from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.event import Event, EventStatus
from app.schemas.event import EventCreate, EventOut

router = APIRouter(prefix="/api/events", tags=["Demand Response Events"])


@router.post("", response_model=EventOut)
def create_event(payload: EventCreate, db: Session = Depends(get_db)):
    event = Event(**payload.model_dump())
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.get("", response_model=List[EventOut])
def list_events(tenant_id: Optional[int] = None, status: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Event)
    if tenant_id:
        q = q.filter(Event.tenant_id == tenant_id)
    if status:
        q = q.filter(Event.event_status == status)
    return q.order_by(Event.start_time.desc()).limit(500).all()


@router.get("/{event_id}", response_model=EventOut)
def get_event(event_id: int, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    return event


@router.post("/{event_id}/cancel", response_model=EventOut)
def cancel_event(event_id: int, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    if event.event_status in (EventStatus.completed, EventStatus.cancelled):
        raise HTTPException(400, f"Event is already '{event.event_status}'")
    event.event_status = EventStatus.cancelled
    db.commit()
    db.refresh(event)
    return event
