"""
Configurable EV telemetry simulator.

Simulates a fleet of EVs cycling through charging / driving / idle /
unplugged / completed states, with realistic SOC and charging-power
evolution, and writes each reading to the telemetry store (and updates the
denormalized "latest state" cache on the Device row in MySQL).

Run standalone via `python run_simulator.py`, or import `run_forever` /
`tick` into another process (e.g. a scheduler or Celery worker).
"""

from __future__ import annotations

import random
import time as time_module
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, List

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.device import Device, ChargingStatus
from app.models.tenant import Tenant
from app.services.telemetry_store import get_telemetry_store

STATES = ["charging", "driving", "idle", "unplugged", "completed"]
STATE_TRANSITIONS = {
    "charging": {"charging": 0.75, "idle": 0.05, "completed": 0.15, "unplugged": 0.05},
    "idle": {"idle": 0.5, "charging": 0.3, "unplugged": 0.2},
    "driving": {"driving": 0.6, "unplugged": 0.3, "idle": 0.1},
    "unplugged": {"unplugged": 0.5, "driving": 0.35, "idle": 0.15},
    "completed": {"completed": 0.6, "idle": 0.3, "unplugged": 0.1},
}


@dataclass
class SimulatedDevice:
    device_id: int
    tenant_id: int
    battery_capacity_kwh: float
    soc: float = field(default_factory=lambda: random.uniform(20, 90))
    state: str = "idle"
    charging_power_kw: float = 0.0

    def step(self, randomness: float):
        self.state = _next_state(self.state, randomness)

        if self.state == "charging":
            self.charging_power_kw = max(1.0, random.gauss(7.2, 1.5 * (1 + randomness)))
            energy_delta = self.charging_power_kw * (self._interval_hours())
            self.soc = min(100.0, self.soc + (energy_delta / self.battery_capacity_kwh) * 100)
        elif self.state == "driving":
            self.charging_power_kw = 0.0
            drain_kwh = random.uniform(0.5, 3.0) * (1 + randomness)
            self.soc = max(2.0, self.soc - (drain_kwh / self.battery_capacity_kwh) * 100)
        elif self.state == "completed":
            self.charging_power_kw = 0.0
            self.soc = min(100.0, self.soc + random.uniform(0, 0.5))
        else:  # idle / unplugged
            self.charging_power_kw = 0.0
            self.soc = max(2.0, self.soc - random.uniform(0, 0.2))

        return self

    def _interval_hours(self) -> float:
        return 45 / 3600  # approximate simulator tick length in hours

    def to_telemetry(self) -> Dict:
        now = datetime.utcnow()
        plugged_in = self.state in ("charging", "idle", "completed")
        flexibility = self.charging_power_kw * random.uniform(0.4, 1.0) if plugged_in else 0.0
        return {
            "device_id": self.device_id,
            "tenant_id": self.tenant_id,
            "timestamp": now,
            "soc": round(self.soc, 2),
            "charging_power_kw": round(self.charging_power_kw, 2),
            "charging_status": self.state,
            "battery_temperature_c": round(random.uniform(20, 38), 1),
            "location": "lat:%.4f,lon:%.4f" % (random.uniform(30, 45), random.uniform(-120, -75)),
            "plugged_in": plugged_in,
            "estimated_departure_time": (now + timedelta(hours=random.uniform(1, 10))).isoformat(),
            "estimated_arrival_time": None,
            "available_flexibility_kw": round(flexibility, 2),
            "energy_consumed_kwh": round(random.uniform(0, 2), 2),
            "grid_availability": True,
        }


def _next_state(current: str, randomness: float) -> str:
    weights = STATE_TRANSITIONS.get(current, STATE_TRANSITIONS["idle"])
    states, probs = zip(*weights.items())
    if randomness > 0:
        probs = [max(0.01, p + random.uniform(-randomness, randomness) * 0.3) for p in probs]
    total = sum(probs)
    probs = [p / total for p in probs]
    return random.choices(states, weights=probs, k=1)[0]


def ensure_simulated_fleet(db: Session, tenant_uid: str, device_count: int) -> List[Device]:
    """Creates (or reuses) a tenant and N EV devices for simulation."""
    tenant = db.query(Tenant).filter(Tenant.tenant_uid == tenant_uid).first()
    if not tenant:
        tenant = Tenant(tenant_uid=tenant_uid, name=f"Simulated Utility ({tenant_uid})", timezone="America/New_York")
        db.add(tenant)
        db.commit()
        db.refresh(tenant)

    existing = db.query(Device).filter(Device.tenant_id == tenant.id).count()
    to_create = device_count - existing
    makes = ["Tesla", "Ford", "Chevrolet", "Nissan", "Hyundai", "Kia", "Rivian"]
    for i in range(max(0, to_create)):
        dev = Device(
            tenant_id=tenant.id,
            device_type="ev",
            vin=f"SIM{tenant.id}{existing + i:08d}",
            make=random.choice(makes),
            model="Model X" if random.random() > 0.5 else "EV Sedan",
            battery_capacity_kwh=random.choice([40, 60, 75, 82, 100]),
            current_soc=random.uniform(20, 90),
            charging_status=ChargingStatus.idle,
            status="enrolled",
        )
        db.add(dev)
    db.commit()

    return db.query(Device).filter(Device.tenant_id == tenant.id).all()


def tick(sim_devices: List[SimulatedDevice], randomness: float):
    """Advance every simulated device by one step and persist telemetry + device cache."""
    store = get_telemetry_store()
    db = SessionLocal()
    try:
        for sim in sim_devices:
            sim.step(randomness)
            record = sim.to_telemetry()
            store.write(record)

            db.query(Device).filter(Device.id == sim.device_id).update(
                {
                    Device.current_soc: record["soc"],
                    Device.charging_status: record["charging_status"],
                    Device.current_power_kw: record["charging_power_kw"],
                    Device.plugged_in: 1 if record["plugged_in"] else 0,
                }
            )
        db.commit()
    finally:
        db.close()


def run_forever(tenant_uid: str, device_count: int, interval_seconds: int, randomness: float):
    db = SessionLocal()
    try:
        devices = ensure_simulated_fleet(db, tenant_uid, device_count)
    finally:
        db.close()

    sim_devices = [
        SimulatedDevice(device_id=d.id, tenant_id=d.tenant_id, battery_capacity_kwh=d.battery_capacity_kwh or 60)
        for d in devices
    ]

    print(f"[simulator] Simulating {len(sim_devices)} EVs for tenant '{tenant_uid}' "
          f"every {interval_seconds}s (randomness={randomness})")

    while True:
        start = time_module.time()
        tick(sim_devices, randomness)
        elapsed = time_module.time() - start
        print(f"[simulator] tick complete for {len(sim_devices)} devices in {elapsed:.2f}s")
        time_module.sleep(max(1.0, interval_seconds - elapsed))
