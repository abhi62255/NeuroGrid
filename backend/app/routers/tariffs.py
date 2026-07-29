from typing import List, Optional
import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.device import Device
from app.models.tariff import Tariff, TouSchedule
from app.schemas.tariff import TariffCreate, TariffOut
from app.services import tariff_service

router = APIRouter(prefix="/api/tariffs", tags=["Tariffs"])

_DAY_ABBR = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

_RATE_FIELDS = {
    "on_peak": "on_peak_rate",
    "mid_peak": "mid_peak_rate",
    "off_peak": "off_peak_rate",
    "super_off_peak": "super_off_peak_rate",
}

# Typical EV fleet charging fraction of peak per hour (index = hour 0-23)
_EV_CHARGE_CURVE = [
    0.75, 0.80, 0.82, 0.80, 0.72, 0.55,  # 00-05 overnight
    0.35, 0.20, 0.18, 0.15, 0.12, 0.10,  # 06-11 morning commute out
    0.12, 0.14, 0.16, 0.18, 0.30, 0.60,  # 12-17 midday / returning home
    0.70, 0.65, 0.60, 0.55, 0.70, 0.74,  # 18-23 evening → overnight
]


@router.post("", response_model=TariffOut)
def create_tariff(payload: TariffCreate, db: Session = Depends(get_db)):
    data = payload.model_dump(exclude={"tou_schedules"})
    tariff = Tariff(**data)
    db.add(tariff)
    db.flush()

    for sched in payload.tou_schedules:
        db.add(TouSchedule(tariff_id=tariff.id, **sched.model_dump()))

    db.commit()
    db.refresh(tariff)
    return tariff


@router.get("", response_model=List[TariffOut])
def list_tariffs(tenant_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(Tariff)
    if tenant_id:
        q = q.filter(Tariff.tenant_id == tenant_id)
    return q.all()


@router.get("/current/{tenant_id}")
def current_price(tenant_id: int, db: Session = Depends(get_db)):
    return tariff_service.get_current_price_info(db, tenant_id)


@router.get("/calendar/{tenant_id}")
def tariff_calendar(tenant_id: int, db: Session = Depends(get_db)):
    """
    Returns a 24-hour tariff window map with load forecast and cost-savings
    data for the Tariff Calendar UI.

    Response shape:
    {
      tariff_name, timezone, currency, num_devices, current_hour,
      rates: { on_peak, off_peak, ... },
      windows: [ { hour, period, rate, load_kw, cost, potential_savings_if_shifted } ... ],
      incentive_per_kwh, max_event_duration_minutes
    }
    """
    tariff = tariff_service.get_active_tariff(db, tenant_id)
    if not tariff:
        raise HTTPException(404, "No active tariff configured for this tenant")

    # Build rate lookup map
    rates = {
        period: getattr(tariff, field) or 0.0
        for period, field in _RATE_FIELDS.items()
    }
    cheapest_rate = min((v for v in rates.values() if v), default=0.0)

    # Determine today's day abbreviation for TOU matching
    today = dt.date.today()
    day_abbr = _DAY_ABBR[today.weekday()]

    # Build one entry per hour (0-23)
    devices = db.query(Device).filter(Device.tenant_id == tenant_id).all()
    num_devices = len(devices) or 1
    avg_power_kw = sum(d.max_charging_power_kw or 7.2 for d in devices) / num_devices

    windows = []
    for h in range(24):
        check_time = dt.time(h, 0)
        period = "off_peak"
        for sched in tariff.tou_schedules:
            days = [d.strip() for d in sched.days_of_week.split(",")]
            if day_abbr not in days:
                continue
            if sched.start_time <= sched.end_time:
                in_win = sched.start_time <= check_time < sched.end_time
            else:
                in_win = check_time >= sched.start_time or check_time < sched.end_time
            if in_win:
                period = sched.period_name
                break

        rate = rates.get(period, 0.0)
        load_kw = round(_EV_CHARGE_CURVE[h] * num_devices * avg_power_kw, 1)
        cost = round(rate * load_kw, 3)
        savings = round(max(rate - cheapest_rate, 0) * load_kw, 3)

        windows.append({
            "hour": h,
            "period": period,
            "rate": rate,
            "load_kw": load_kw,
            "cost": cost,
            "potential_savings_if_shifted": savings,
        })

    return {
        "tenant_id": tenant_id,
        "tariff_name": tariff.tariff_name,
        "timezone": tariff.timezone,
        "currency": tariff.currency,
        "num_devices": len(devices),
        "current_hour": dt.datetime.now().hour,
        "rates": rates,
        "windows": windows,
        "incentive_per_kwh": tariff.incentive_per_kwh,
        "max_event_duration_minutes": tariff.max_event_duration_minutes,
    }


@router.get("/{tariff_id}", response_model=TariffOut)
def get_tariff(tariff_id: int, db: Session = Depends(get_db)):
    tariff = db.get(Tariff, tariff_id)
    if not tariff:
        raise HTTPException(404, "Tariff not found")
    return tariff
