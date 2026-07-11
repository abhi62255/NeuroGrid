from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class EventCreate(BaseModel):
    tenant_id: int
    start_time: datetime
    end_time: datetime
    created_from_recommendation: Optional[int] = None
    trigger_source: str = "user"
    created_by: Optional[int] = None
    event_type: Optional[str] = "stop_charging"


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    event_id: int
    tenant_id: int
    start_time: datetime
    end_time: datetime
    event_status: str
    event_type: Optional[str] = "stop_charging"
    created_from_recommendation: Optional[int] = None
    trigger_source: str
    created_by: Optional[int] = None
    created_at: datetime
