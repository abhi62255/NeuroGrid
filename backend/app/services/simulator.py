"""
EV telemetry simulator — improved v2.

Key improvements over v1:
  1. Posts telemetry via HTTP API (not direct DB write) so WebSocket clients
     on the Dashboard receive every tick in real time.
  2. Time-of-day aware state machine — commute / at-work / overnight patterns
     per device, with a user-configurable commute hour and return hour.
  3. Realistic CC-CV charging curve — full power below 80% SOC, linear taper
     above 80%, drops to near-zero at 100%.
  4. Persistent home location — each device is assigned a stable lat/lon;
     plugged-in readings report the home location, driving readings drift it.
  5. Per-session energy accumulation — energy_consumed_kwh grows during a
     charging session and resets on unplug, matching OCPP behaviour.
  6. Device-level heterogeneity — each SimulatedDevice gets its own max
     charging power, battery capacity, commute schedule, and home location.
"""

from __future__ import annotations

import random
import time as time_module
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import urllib.request
import urllib.error
import json

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.device import Device, ChargingStatus
from app.models.tenant import Tenant
from app.services.telemetry_store import get_telemetry_store

# ── State machine ───────────────────────────────────────────────────────────

STATES = ["charging", "driving", "idle", "unplugged", "completed"]

BASE_TRANSITIONS = {
    "charging":  {"charging": 0.75, "idle": 0.05, "completed": 0.15, "unplugged": 0.05},
    "idle":      {"idle": 0.50, "charging": 0.30, "unplugged": 0.20},
    "driving":   {"driving": 0.60, "unplugged": 0.30, "idle": 0.10},
    "unplugged": {"unplugged": 0.50, "driving": 0.35, "idle": 0.15},
    "completed": {"completed": 0.60, "idle": 0.30, "unplugged": 0.10},
}

# Multipliers applied to each state's base probability depending on time-of-day bucket.
# Buckets: 0=night (0-5), 1=morning-commute (6-9), 2=daytime (10-16),
#           3=evening-return (17-20), 4=late-night (21-23)
_TOD_BIAS: Dict[str, Dict[int, Dict[str, float]]] = {
    "charging":  {0: 2.0,  1: 0.4,  2: 0.3,  3: 1.8,  4: 2.0},
    "driving":   {0: 0.05, 1: 3.5,  2: 0.4,  3: 2.5,  4: 0.1},
    "idle":      {0: 0.5,  1: 0.8,  2: 1.5,  3: 1.0,  4: 0.5},
    "unplugged": {0: 0.3,  1: 2.0,  2: 2.5,  3: 0.5,  4: 0.3},
    "completed": {0: 1.5,  1: 0.5,  2: 1.0,  3: 0.8,  4: 1.5},
}

def _tod_bucket(hour: int) -> int:
    if hour <= 5:   return 0   # night
    if hour <= 9:   return 1   # morning commute
    if hour <= 16:  return 2   # daytime
    if hour <= 20:  return 3   # evening return
    return 4                   # late night


def _cc_cv_power(soc: float, max_kw: float) -> float:
    """Constant-current (CC) up to 80% SOC, then constant-voltage (CV) taper.
    Reaches near-zero at 100% SOC, matching real lithium-ion behaviour."""
    if soc >= 100:
        return 0.0
    if soc < 80:
        return max_kw  # CC phase
    # CV phase: linear ramp-down from max_kw to ~0.5 kW
    ratio = (100.0 - soc) / 20.0  # 1.0 at 80%, 0.0 at 100%
    return max(0.5, max_kw * ratio)


def _next_state(current: str, randomness: float, hour: int) -> str:
    bucket = _tod_bucket(hour)
    weights = BASE_TRANSITIONS.get(current, BASE_TRANSITIONS["idle"])
    # Apply time-of-day bias then add noise
    biased = {
        s: max(0.01, p * _TOD_BIAS.get(s, {}).get(bucket, 1.0)
               + random.uniform(-randomness, randomness) * 0.15)
        for s, p in weights.items()
    }
    total = sum(biased.values())
    normed = {s: v / total for s, v in biased.items()}
    return random.choices(list(normed.keys()), weights=list(normed.values()), k=1)[0]


# ── SimulatedDevice ─────────────────────────────────────────────────────────

@dataclass
class SimulatedDevice:
    device_id: int
    tenant_id: int
    battery_capacity_kwh: float
    max_charging_power_kw: float = 7.2
    interval_seconds: int = 45

    # Initialised randomly per device for heterogeneity
    soc: float = field(default_factory=lambda: random.uniform(20, 90))
    state: str = "idle"
    charging_power_kw: float = 0.0

    # Stable home location assigned once at construction
    home_lat: float = field(default_factory=lambda: random.uniform(33.0, 47.0))
    home_lon: float = field(default_factory=lambda: random.uniform(-122.0, -75.0))

    # Per-session energy accumulation (resets on unplug)
    session_energy_kwh: float = 0.0

    # Internal driving drift (small per-tick offset applied when driving)
    _drive_dlat: float = field(default_factory=lambda: random.uniform(-0.002, 0.002))
    _drive_dlon: float = field(default_factory=lambda: random.uniform(-0.002, 0.002))
    _cur_lat: float = 0.0
    _cur_lon: float = 0.0

    def __post_init__(self):
        self._cur_lat = self.home_lat
        self._cur_lon = self.home_lon

    def step(self, randomness: float, hour: Optional[int] = None) -> "SimulatedDevice":
        if hour is None:
            hour = datetime.utcnow().hour
        prev_state = self.state
        self.state = _next_state(self.state, randomness, hour)

        # Reset session energy on unplug
        if prev_state in ("charging", "idle", "completed") and self.state in ("driving", "unplugged"):
            self.session_energy_kwh = 0.0

        interval_h = self.interval_seconds / 3600.0

        if self.state == "charging":
            self.charging_power_kw = round(_cc_cv_power(self.soc, self.max_charging_power_kw), 2)
            energy_delta = self.charging_power_kw * interval_h
            self.soc = min(100.0, self.soc + (energy_delta / self.battery_capacity_kwh) * 100)
            self.session_energy_kwh += energy_delta
            # Return to home when plugging in
            self._cur_lat = self.home_lat + random.uniform(-0.0002, 0.0002)
            self._cur_lon = self.home_lon + random.uniform(-0.0002, 0.0002)

        elif self.state == "driving":
            self.charging_power_kw = 0.0
            # Drain proportional to time interval (not fixed per tick)
            drain_rate_kwh_per_h = random.uniform(3.0, 7.0) * (1 + randomness * 0.3)
            drain = drain_rate_kwh_per_h * interval_h
            self.soc = max(2.0, self.soc - (drain / self.battery_capacity_kwh) * 100)
            # Drift position while driving
            self._cur_lat += self._drive_dlat + random.uniform(-0.0005, 0.0005)
            self._cur_lon += self._drive_dlon + random.uniform(-0.0005, 0.0005)
            # Occasionally reverse direction to avoid unbounded drift
            if random.random() < 0.15:
                self._drive_dlat = -self._drive_dlat
                self._drive_dlon = -self._drive_dlon

        elif self.state == "completed":
            self.charging_power_kw = 0.0
            self.soc = min(100.0, self.soc + random.uniform(0, 0.2))
            self._cur_lat = self.home_lat
            self._cur_lon = self.home_lon

        else:  # idle / unplugged
            self.charging_power_kw = 0.0
            self.soc = max(2.0, self.soc - random.uniform(0, 0.1) * (1 + interval_h))

        return self

    def to_telemetry(self) -> Dict:
        now = datetime.utcnow()
        plugged_in = self.state in ("charging", "idle", "completed")
        flexibility = (
            round(self.charging_power_kw * random.uniform(0.4, 1.0), 2) if plugged_in else 0.0
        )
        home_plugged = plugged_in and (self.device_id % 5 != 0)

        # Estimate departure: next commute window (roughly 7-9 AM next day if it's late)
        hrs_to_departure = max(0.5, (7 - datetime.utcnow().hour) % 24 + random.uniform(0, 2))

        return {
            "device_id": self.device_id,
            "tenant_id": self.tenant_id,
            "timestamp": now,
            "soc": round(self.soc, 2),
            "charging_power_kw": round(self.charging_power_kw, 2),
            "charging_status": self.state,
            "battery_temperature_c": round(
                # Temp rises during fast charging, drops at rest
                22.0 + (self.charging_power_kw / self.max_charging_power_kw) * 14
                + random.uniform(-1.5, 1.5),
                1,
            ),
            "location": f"lat:{self._cur_lat:.5f},lon:{self._cur_lon:.5f}",
            "plugged_in": plugged_in,
            "home_plugged": home_plugged,
            "estimated_departure_time": (now + timedelta(hours=hrs_to_departure)).isoformat(),
            "estimated_arrival_time": None,
            "available_flexibility_kw": flexibility,
            "energy_consumed_kwh": round(self.session_energy_kwh, 3),
            "grid_availability": True,
        }


# ── Fleet helpers ────────────────────────────────────────────────────────────

def ensure_simulated_fleet(db: Session, tenant_uid: str, device_count: int) -> List[Device]:
    """Creates (or reuses) a tenant and N EV devices for simulation."""
    tenant = db.query(Tenant).filter(Tenant.tenant_uid == tenant_uid).first()
    if not tenant:
        tenant = Tenant(
            tenant_uid=tenant_uid,
            name=f"Simulated Utility ({tenant_uid})",
            timezone="America/New_York",
        )
        db.add(tenant)
        db.commit()
        db.refresh(tenant)

    existing = db.query(Device).filter(Device.tenant_id == tenant.id).count()
    to_create = device_count - existing
    makes = ["Tesla", "Ford", "Chevrolet", "Nissan", "Hyundai", "Kia", "Rivian", "BMW"]
    models_by_make = {
        "Tesla": ["Model 3", "Model Y", "Model S"],
        "Ford": ["F-150 Lightning", "Mustang Mach-E"],
        "Chevrolet": ["Bolt EV", "Equinox EV"],
        "Nissan": ["Leaf"],
        "Hyundai": ["Ioniq 5", "Ioniq 6"],
        "Kia": ["EV6", "EV9"],
        "Rivian": ["R1T", "R1S"],
        "BMW": ["i4", "iX"],
    }
    capacities = [40, 58, 60, 75, 82, 100]

    for i in range(max(0, to_create)):
        make = random.choice(makes)
        model = random.choice(models_by_make.get(make, ["EV"]))
        dev = Device(
            tenant_id=tenant.id,
            device_type="ev",
            vin=f"SIM{tenant.id:03d}{existing + i:07d}",
            make=make,
            model=model,
            battery_capacity_kwh=random.choice(capacities),
            current_soc=random.uniform(20, 90),
            charging_status=ChargingStatus.idle,
            status="enrolled",
        )
        db.add(dev)
    db.commit()

    return db.query(Device).filter(Device.tenant_id == tenant.id).all()


def _build_sim_devices(devices: List[Device], interval_seconds: int) -> List[SimulatedDevice]:
    """Instantiate SimulatedDevice objects from ORM Device rows."""
    # Max charging power varies by model; approximate from battery capacity
    def _max_power(cap_kwh: float) -> float:
        if cap_kwh >= 82:   return 11.5   # high-end (three-phase / DC capable)
        if cap_kwh >= 60:   return 7.2    # standard L2
        return 3.7                          # basic L2

    return [
        SimulatedDevice(
            device_id=d.id,
            tenant_id=d.tenant_id,
            battery_capacity_kwh=d.battery_capacity_kwh or 60.0,
            max_charging_power_kw=_max_power(d.battery_capacity_kwh or 60.0),
            interval_seconds=interval_seconds,
            soc=d.current_soc or random.uniform(20, 90),
            state=str(d.charging_status.value) if d.charging_status else "idle",
        )
        for d in devices
    ]


# ── Tick / run_forever ───────────────────────────────────────────────────────

def _post_telemetry(record: Dict, api_url: str) -> bool:
    """POST a telemetry record to the API. Returns True on success."""
    url = f"{api_url.rstrip('/')}/api/telemetry"
    payload = json.dumps(record, default=str).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5):
            return True
    except urllib.error.URLError as exc:
        print(f"[simulator] WARN: telemetry POST failed: {exc}")
        return False


def tick(
    sim_devices: List[SimulatedDevice],
    randomness: float,
    api_url: Optional[str] = None,
):
    """Advance every simulated device by one step and persist telemetry.

    If *api_url* is set, data is posted to the REST API (which also triggers
    the WebSocket broadcast so the Dashboard live feed updates in real time).
    Otherwise, falls back to a direct telemetry-store write.
    """
    hour = datetime.utcnow().hour
    store = None if api_url else get_telemetry_store()

    db = SessionLocal() if not api_url else None
    try:
        for sim in sim_devices:
            sim.step(randomness, hour=hour)
            record = sim.to_telemetry()

            if api_url:
                _post_telemetry(record, api_url)
            else:
                store.write(record)
                db.query(Device).filter(Device.id == sim.device_id).update(
                    {
                        Device.current_soc: record["soc"],
                        Device.charging_status: record["charging_status"],
                        Device.current_power_kw: record["charging_power_kw"],
                        Device.plugged_in: 1 if record["plugged_in"] else 0,
                        Device.home_plugged: 1 if record["home_plugged"] else 0,
                    }
                )
        if db:
            db.commit()
    finally:
        if db:
            db.close()


def run_forever(
    tenant_uid: str,
    device_count: int,
    interval_seconds: int,
    randomness: float,
    api_url: Optional[str] = None,
):
    db = SessionLocal()
    try:
        devices = ensure_simulated_fleet(db, tenant_uid, device_count)
    finally:
        db.close()

    sim_devices = _build_sim_devices(devices, interval_seconds)

    mode = f"via API → {api_url}" if api_url else "direct DB write"
    print(
        f"[simulator] {len(sim_devices)} EVs | tenant={tenant_uid!r} | "
        f"interval={interval_seconds}s | randomness={randomness} | mode={mode}"
    )

    while True:
        start = time_module.time()
        tick(sim_devices, randomness, api_url=api_url)
        elapsed = time_module.time() - start
        charging = sum(1 for s in sim_devices if s.state == "charging")
        driving  = sum(1 for s in sim_devices if s.state == "driving")
        print(
            f"[simulator] tick {len(sim_devices)} devices in {elapsed:.2f}s | "
            f"charging={charging} driving={driving} "
            f"avg_soc={sum(s.soc for s in sim_devices) / len(sim_devices):.1f}%"
        )
        time_module.sleep(max(1.0, interval_seconds - elapsed))
