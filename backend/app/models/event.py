import enum

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.database import Base


class EventStatus(str, enum.Enum):
    scheduled = "scheduled"
    active = "active"
    completed = "completed"
    cancelled = "cancelled"


class TriggerSource(str, enum.Enum):
    ai = "ai"
    user = "user"


class Event(Base):
    """A created Demand Response event."""

    __tablename__ = "events"

    event_id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)

    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    event_status = Column(Enum(EventStatus), default=EventStatus.scheduled, nullable=False)
    event_type = Column(String(50), default="stop_charging", nullable=True)

    created_from_recommendation = Column(
        Integer, ForeignKey("recommendations.recommendation_id"), nullable=True
    )
    trigger_source = Column(Enum(TriggerSource), default=TriggerSource.ai, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    tenant = relationship("Tenant", back_populates="events")
    recommendation = relationship(
        "Recommendation", back_populates="event", foreign_keys="Recommendation.event_id"
    )
