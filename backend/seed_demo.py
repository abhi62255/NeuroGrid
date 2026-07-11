"""
Seeds 3 demo tenants (each with an operator user, a TOU tariff, and 50 EVs)
so the Recommendation Engine and frontend Dashboard have realistic multi-tenant
data immediately after setup.

Usage: python seed_demo.py
"""

import random
from datetime import time

from app.database import SessionLocal, Base, engine
from app.config import settings
from app.models.tenant import Tenant
from app.models.user import User
from app.models.tariff import Tariff, TouSchedule
from app.models.device import Device, ChargingStatus

Base.metadata.create_all(bind=engine)

# ---------------------------------------------------------------------------
# Tenant definitions
# ---------------------------------------------------------------------------
TENANTS = [
    {
        "tenant_uid": "demo-utility",
        "name": "Demo Utility Co.",
        "region": "Northeast US",
        "timezone": "America/New_York",
        "user_name": "Demo Operator",
        "user_email": "operator@demo-utility.com",
        "tariff_name": "Standard Residential TOU",
        "on_peak_rate": 0.42,
        "mid_peak_rate": 0.24,
        "off_peak_rate": 0.14,
        "super_off_peak_rate": 0.09,
        "device_count": 10,
    },
    {
        "tenant_uid": "pacific-power",
        "name": "Pacific Power Grid",
        "region": "West Coast US",
        "timezone": "America/Los_Angeles",
        "user_name": "Pacific Operator",
        "user_email": "operator@pacific-power.com",
        "tariff_name": "Pacific TOU Premium",
        "on_peak_rate": 0.52,
        "mid_peak_rate": 0.31,
        "off_peak_rate": 0.18,
        "super_off_peak_rate": 0.10,
        "device_count": 5,
    },
    {
        "tenant_uid": "midwest-energy",
        "name": "Midwest Energy Solutions",
        "region": "Midwest US",
        "timezone": "America/Chicago",
        "user_name": "Midwest Operator",
        "user_email": "operator@midwest-energy.com",
        "tariff_name": "Midwest Flat-Peak TOU",
        "on_peak_rate": 0.38,
        "mid_peak_rate": 0.22,
        "off_peak_rate": 0.12,
        "super_off_peak_rate": 0.07,
        "device_count": 3,
    },
]

MAKES = ["Tesla", "Ford", "Chevrolet", "Nissan", "Hyundai", "Kia", "Rivian"]
BATTERY_SIZES = [40, 60, 75, 82, 100]
CHARGING_STATUSES = [
    ChargingStatus.charging,
    ChargingStatus.idle,
    ChargingStatus.driving,
    ChargingStatus.unplugged,
    ChargingStatus.completed,
]

db = SessionLocal()
try:
    for i, td in enumerate(TENANTS):
        # ── Tenant ──────────────────────────────────────────────────────────
        tenant = db.query(Tenant).filter(Tenant.tenant_uid == td["tenant_uid"]).first()
        if not tenant:
            tenant = Tenant(
                tenant_uid=td["tenant_uid"],
                name=td["name"],
                region=td["region"],
                timezone=td["timezone"],
            )
            db.add(tenant)
            db.commit()
            db.refresh(tenant)
            print(f"[OK] Created tenant '{tenant.name}' (id={tenant.id})")
        else:
            print(f"  Tenant '{tenant.name}' already exists (id={tenant.id})")

        # ── User ─────────────────────────────────────────────────────────────
        if not db.query(User).filter(User.tenant_id == tenant.id).first():
            db.add(User(
                tenant_id=tenant.id,
                name=td["user_name"],
                email=td["user_email"],
                role="admin",
            ))
            db.commit()
            print(f"  [OK] Created operator user: {td['user_email']}")

        # ── Tariff ───────────────────────────────────────────────────────────
        if not db.query(Tariff).filter(Tariff.tenant_id == tenant.id).first():
            tariff = Tariff(
                tenant_id=tenant.id,
                tariff_name=td["tariff_name"],
                timezone=tenant.timezone,
                on_peak_rate=td["on_peak_rate"],
                mid_peak_rate=td["mid_peak_rate"],
                off_peak_rate=td["off_peak_rate"],
                super_off_peak_rate=td["super_off_peak_rate"],
                currency="USD",
                active=True,
                max_event_duration_minutes=120,
                incentive_per_kwh=0.10,
                min_required_load_reduction_kw=50,  # lower threshold for 50-device fleets
            )
            db.add(tariff)
            db.flush()

            weekday = "mon,tue,wed,thu,fri"
            db.add_all([
                TouSchedule(tariff_id=tariff.id, days_of_week=weekday, start_time=time(0, 0),  end_time=time(6, 0),      period_name="off_peak"),
                TouSchedule(tariff_id=tariff.id, days_of_week=weekday, start_time=time(6, 0),  end_time=time(16, 0),     period_name="mid_peak"),
                TouSchedule(tariff_id=tariff.id, days_of_week=weekday, start_time=time(16, 0), end_time=time(21, 0),     period_name="on_peak"),
                TouSchedule(tariff_id=tariff.id, days_of_week=weekday, start_time=time(21, 0), end_time=time(23, 59, 59),period_name="off_peak"),
                TouSchedule(tariff_id=tariff.id, days_of_week="sat,sun", start_time=time(0, 0), end_time=time(23, 59, 59), period_name="off_peak"),
            ])
            db.commit()
            print(f"  [OK] Created tariff: {td['tariff_name']}")

        # ── Devices ──────────────────────────────────────────────────────────
        existing_count = db.query(Device).filter(Device.tenant_id == tenant.id).count()
        to_create = td["device_count"] - existing_count
        if to_create > 0:
            for j in range(to_create):
                make = random.choice(MAKES)
                model = random.choice(["Model 3", "Model Y", "F-150 Lightning", "Bolt EV", "IONIQ 6", "EV6", "R1T"])
                status = random.choice(CHARGING_STATUSES)
                plugged_in = status in (ChargingStatus.charging, ChargingStatus.idle, ChargingStatus.completed)
                max_soc = round(random.uniform(80, 95), 1)
                min_soc = round(random.uniform(15, 30), 1)
                home_plugged = plugged_in and (j % 5 != 0)
                db.add(Device(
                    tenant_id=tenant.id,
                    device_type="ev",
                    vin=f"T{tenant.id}{existing_count + j:08d}",
                    make=make,
                    model=model,
                    battery_capacity_kwh=random.choice(BATTERY_SIZES),
                    current_soc=round(random.uniform(15, 95), 1),
                    charging_status=status,
                    current_power_kw=round(random.uniform(4, 11), 2) if status == ChargingStatus.charging else 0.0,
                    plugged_in=1 if plugged_in else 0,
                    home_plugged=1 if home_plugged else 0,
                    max_soc=max_soc,
                    min_soc=min_soc,
                    status="enrolled",
                ))
            db.commit()
            print(f"  [OK] Created {to_create} EV devices")
        else:
            print(f"  Devices already seeded ({existing_count} existing)")

        print()

    print("=" * 55)
    print("All 3 tenants ready! Next steps:")
    print("  1. python run_simulator.py --tenant demo-utility")
    print("  2. uvicorn app.main:app --reload")
    print("=" * 55)

finally:
    db.close()
