"""Resolves the current tariff/price period for a tenant based on its TOU schedule."""

from datetime import datetime, date
from typing import Optional, Dict, Any

from sqlalchemy.orm import Session

from app.models.tariff import Tariff, TouSchedule

_DAY_ABBR = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

_RATE_FIELD_BY_PERIOD = {
    "on_peak": "on_peak_rate",
    "mid_peak": "mid_peak_rate",
    "off_peak": "off_peak_rate",
    "super_off_peak": "super_off_peak_rate",
}


def get_active_tariff(db: Session, tenant_id: int, as_of: Optional[date] = None) -> Optional[Tariff]:
    as_of = as_of or datetime.utcnow().date()
    query = (
        db.query(Tariff)
        .filter(Tariff.tenant_id == tenant_id, Tariff.active.is_(True))
        .filter((Tariff.effective_start_date.is_(None)) | (Tariff.effective_start_date <= as_of))
        .filter((Tariff.effective_end_date.is_(None)) | (Tariff.effective_end_date >= as_of))
    )
    return query.first()


def get_current_price_info(db: Session, tenant_id: int, now: Optional[datetime] = None) -> Dict[str, Any]:
    """
    Returns the current tariff period and $/kWh rate for a tenant, e.g.:
    {"period": "on_peak", "rate": 0.42, "currency": "USD", "tariff_name": "..."}
    Falls back to a generic "unknown" period if no tariff/schedule is configured.
    """
    now = now or datetime.utcnow()
    tariff = get_active_tariff(db, tenant_id, now.date())
    if not tariff:
        return {"period": "unknown", "rate": None, "currency": "USD", "tariff_name": None}

    day_abbr = _DAY_ABBR[now.weekday()]
    current_time = now.time()

    matched: Optional[TouSchedule] = None
    for sched in tariff.tou_schedules:
        days = [d.strip() for d in sched.days_of_week.split(",")]
        if day_abbr not in days:
            continue
        if sched.start_time <= sched.end_time:
            in_window = sched.start_time <= current_time < sched.end_time
        else:
            # window wraps past midnight
            in_window = current_time >= sched.start_time or current_time < sched.end_time
        if in_window:
            matched = sched
            break

    period = matched.period_name if matched else "off_peak"
    rate_field = _RATE_FIELD_BY_PERIOD.get(period, "off_peak_rate")
    rate = getattr(tariff, rate_field, None)

    return {
        "period": period,
        "rate": rate,
        "currency": tariff.currency,
        "tariff_name": tariff.tariff_name,
        "max_event_duration_minutes": tariff.max_event_duration_minutes,
        "incentive_per_kwh": tariff.incentive_per_kwh,
        "min_required_load_reduction_kw": tariff.min_required_load_reduction_kw,
    }
