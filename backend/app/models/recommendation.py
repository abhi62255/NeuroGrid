import enum

from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    DateTime,
    ForeignKey,
    Enum,
    Text,
    Boolean,
    JSON,
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.database import Base


class RecommendationStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"
    expired = "expired"


class Recommendation(Base):
    """An AI-generated Demand Response recommendation."""

    __tablename__ = "recommendations"

    recommendation_id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)

    recommendation_time = Column(DateTime(timezone=True), server_default=func.now())
    recommendation_status = Column(Enum(RecommendationStatus), default=RecommendationStatus.pending, nullable=False)

    confidence_score = Column(Float, nullable=True)
    reasoning = Column(Text, nullable=True)

    recommended_start = Column(DateTime(timezone=True), nullable=True)
    recommended_end = Column(DateTime(timezone=True), nullable=True)

    predicted_load_reduction_kw = Column(Float, nullable=True)
    predicted_energy_shifted_kwh = Column(Float, nullable=True)
    estimated_customer_incentive = Column(Float, nullable=True)
    estimated_utility_savings = Column(Float, nullable=True)

    # raw structured LLM output, kept for audit / debugging
    raw_llm_response = Column(JSON, nullable=True)
    event_type = Column(String(50), default="stop_charging", nullable=True)

    accepted_by_user = Column(Integer, ForeignKey("users.id"), nullable=True)
    event_id = Column(Integer, ForeignKey("events.event_id"), nullable=True)

    tenant = relationship("Tenant", back_populates="recommendations")
    device_links = relationship(
        "RecommendationDevice", back_populates="recommendation", cascade="all, delete-orphan"
    )
    event = relationship("Event", back_populates="recommendation", foreign_keys=[event_id])


class RecommendationDevice(Base):
    """Mapping table between a recommendation and the devices it covers."""

    __tablename__ = "recommendation_devices"

    id = Column(Integer, primary_key=True, index=True)
    recommendation_id = Column(Integer, ForeignKey("recommendations.recommendation_id"), nullable=False)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False)

    expected_contribution_kw = Column(Float, nullable=True)
    participated = Column(Boolean, default=False)

    recommendation = relationship("Recommendation", back_populates="device_links")
    device = relationship("Device", back_populates="recommendation_links")
