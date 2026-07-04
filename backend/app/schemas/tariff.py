from datetime import date, time
from typing import Optional, List

from pydantic import BaseModel, ConfigDict


class TouScheduleBase(BaseModel):
    days_of_week: str  # e.g. "mon,tue,wed,thu,fri"
    start_time: time
    end_time: time
    period_name: str  # on_peak / mid_peak / off_peak / super_off_peak


class TouScheduleCreate(TouScheduleBase):
    pass


class TouScheduleOut(TouScheduleBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class TariffBase(BaseModel):
    tariff_name: str
    effective_start_date: Optional[date] = None
    effective_end_date: Optional[date] = None
    timezone: str = "UTC"
    on_peak_rate: Optional[float] = None
    mid_peak_rate: Optional[float] = None
    off_peak_rate: Optional[float] = None
    super_off_peak_rate: Optional[float] = None
    currency: str = "USD"
    active: bool = True
    max_event_duration_minutes: int = 120
    incentive_per_kwh: Optional[float] = None
    min_required_load_reduction_kw: Optional[float] = None


class TariffCreate(TariffBase):
    tenant_id: int
    tou_schedules: List[TouScheduleCreate] = []


class TariffOut(TariffBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tenant_id: int
    tou_schedules: List[TouScheduleOut] = []
