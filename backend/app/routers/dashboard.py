from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.tenant import Tenant
from app.models.device import Device
from app.models.recommendation import Recommendation, RecommendationStatus
from app.models.event import Event, EventStatus

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/summary")
def summary(tenant_id: int | None = None, db: Session = Depends(get_db)):
    device_q = db.query(Device)
    rec_q = db.query(Recommendation)
    event_q = db.query(Event)
    if tenant_id:
        device_q = device_q.filter(Device.tenant_id == tenant_id)
        rec_q = rec_q.filter(Recommendation.tenant_id == tenant_id)
        event_q = event_q.filter(Event.tenant_id == tenant_id)

    total_tenants = db.query(func.count(Tenant.id)).scalar()
    total_evs = device_q.count()
    active_charging = device_q.filter(Device.charging_status == "charging").count()
    recommended_events = rec_q.filter(Recommendation.recommendation_status == RecommendationStatus.pending).count()
    active_events = event_q.filter(Event.event_status == EventStatus.active).count()

    return {
        "total_tenants": total_tenants,
        "total_evs": total_evs,
        "active_charging_evs": active_charging,
        "recommended_events": recommended_events,
        "active_events": active_events,
    }
