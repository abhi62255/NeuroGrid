import enum
import uuid

from sqlalchemy import Column, Integer, String, DateTime, Enum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.database import Base


class TenantStatus(str, enum.Enum):
    active = "active"
    suspended = "suspended"
    inactive = "inactive"


class Tenant(Base):
    """A utility company using the platform."""

    __tablename__ = "tenants"

    id = Column(Integer, primary_key=True, index=True)
    tenant_uid = Column(String(64), unique=True, index=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    region = Column(String(128), nullable=True)
    timezone = Column(String(64), nullable=False, default="UTC")
    status = Column(Enum(TenantStatus), default=TenantStatus.active, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    users = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    devices = relationship("Device", back_populates="tenant", cascade="all, delete-orphan")
    tariffs = relationship("Tariff", back_populates="tenant", cascade="all, delete-orphan")
    recommendations = relationship("Recommendation", back_populates="tenant", cascade="all, delete-orphan")
    events = relationship("Event", back_populates="tenant", cascade="all, delete-orphan")
