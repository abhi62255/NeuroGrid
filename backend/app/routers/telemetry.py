from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.device import Device
from app.models.tenant import Tenant
from app.schemas.telemetry import TelemetryIn, TelemetryOut
from app.services.telemetry_store import get_telemetry_store
from app.services.ws_manager import manager

router = APIRouter(prefix="/api/telemetry", tags=["Telemetry"])


@router.post("", response_model=TelemetryOut)
async def receive_telemetry(payload: TelemetryIn, db: Session = Depends(get_db)):
    store = get_telemetry_store()
    record = payload.model_dump()
    record["timestamp"] = record["timestamp"] or datetime.utcnow()
    store.write(record)

    # Keep device row's "latest state" cache in sync
    db.query(Device).filter(Device.id == payload.device_id).update(
        {
            Device.current_soc: payload.soc,
            Device.charging_status: payload.charging_status,
            Device.current_power_kw: payload.charging_power_kw,
            Device.plugged_in: 1 if payload.plugged_in else 0,
            Device.home_plugged: 1 if payload.home_plugged else 0,
        }
    )
    db.commit()

    # Push to any WebSocket clients watching this tenant
    tenant = db.get(Tenant, payload.tenant_id)
    if tenant:
        await manager.broadcast(tenant.tenant_uid, "telemetry", record)

    return record


@router.get("", response_model=List[TelemetryOut])
def query_telemetry(
    device_id: Optional[int] = None,
    tenant_id: Optional[int] = None,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    limit: int = 200,
):
    store = get_telemetry_store()
    return store.query(device_id=device_id, tenant_id=tenant_id, start=start, end=end, limit=limit)

