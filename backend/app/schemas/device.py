from datetime import datetime
from typing import Optional, Any, Dict

from pydantic import BaseModel, ConfigDict


class DeviceBase(BaseModel):
    device_type: str = "ev"
    vin: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    battery_capacity_kwh: Optional[float] = None
    location: Optional[str] = None
    attributes: Optional[Dict[str, Any]] = None
    max_soc: Optional[float] = 90.0
    min_soc: Optional[float] = 20.0


class DeviceCreate(DeviceBase):
    tenant_id: int


class DeviceUpdate(BaseModel):
    make: Optional[str] = None
    model: Optional[str] = None
    battery_capacity_kwh: Optional[float] = None
    current_soc: Optional[float] = None
    charging_status: Optional[str] = None
    current_power_kw: Optional[float] = None
    location: Optional[str] = None
    plugged_in: Optional[bool] = None
    home_plugged: Optional[bool] = None
    status: Optional[str] = None
    attributes: Optional[Dict[str, Any]] = None
    max_soc: Optional[float] = None
    min_soc: Optional[float] = None


class DeviceOut(DeviceBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tenant_id: int
    current_soc: Optional[float] = None
    charging_status: str
    current_power_kw: Optional[float] = None
    plugged_in: Optional[int] = None
    home_plugged: Optional[int] = None
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None
