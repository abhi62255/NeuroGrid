from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class TelemetryIn(BaseModel):
    device_id: int
    tenant_id: int
    timestamp: Optional[datetime] = None
    soc: float
    charging_power_kw: float = 0.0
    charging_status: str
    battery_temperature_c: Optional[float] = None
    location: Optional[str] = None
    plugged_in: bool = False
    home_plugged: bool = False
    estimated_departure_time: Optional[datetime] = None
    estimated_arrival_time: Optional[datetime] = None
    available_flexibility_kw: Optional[float] = None
    energy_consumed_kwh: Optional[float] = None
    grid_availability: Optional[bool] = True


class TelemetryOut(TelemetryIn):
    pass


class TelemetryQuery(BaseModel):
    device_id: Optional[int] = None
    tenant_id: Optional[int] = None
    start: Optional[datetime] = None
    end: Optional[datetime] = None
    limit: int = 200
