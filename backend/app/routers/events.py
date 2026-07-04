from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.event import Event
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
def list_events(tenant_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(Event)
    if tenant_id:
        q = q.filter(Event.tenant_id == tenant_id)
    return q.order_by(Event.start_time.desc()).limit(500).all()


@router.get("/{event_id}", response_model=EventOut)
def get_event(event_id: int, db: Session = Depends(get_db)):
    event = db.query(Event).get(event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    return event
