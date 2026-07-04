import enum

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum, Float, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.database import Base


class DeviceType(str, enum.Enum):
    ev = "ev"
    thermostat = "thermostat"
    battery = "battery"
    hvac = "hvac"
    water_heater = "water_heater"
    other = "other"


class ChargingStatus(str, enum.Enum):
    charging = "charging"
    driving = "driving"
    idle = "idle"
    unplugged = "unplugged"
    completed = "completed"


class DeviceStatus(str, enum.Enum):
    enrolled = "enrolled"
    disabled = "disabled"
    pending = "pending"


class Device(Base):
    """
    Represents an enrolled flexible-load device.

    The schema is intentionally device-agnostic: `device_type` selects the
    kind of asset, and `attributes` (JSON) carries type-specific fields so
    that new device types (thermostats, batteries, etc.) can be added without
    a schema migration. EV-specific first-class columns are kept for the v1
    system because EVs are the initial supported device type.
    """

    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)

    device_type = Column(Enum(DeviceType), default=DeviceType.ev, nullable=False)

    # EV-specific identity fields
    vin = Column(String(64), unique=True, index=True, nullable=True)
    make = Column(String(128), nullable=True)
    model = Column(String(128), nullable=True)
    battery_capacity_kwh = Column(Float, nullable=True)

    # Latest known state (denormalized cache; source of truth is telemetry store)
    current_soc = Column(Float, nullable=True)  # percentage 0-100
    charging_status = Column(Enum(ChargingStatus), default=ChargingStatus.idle, nullable=False)
    current_power_kw = Column(Float, nullable=True)
    location = Column(String(255), nullable=True)
    plugged_in = Column(Integer, default=0)  # 0/1 boolean for MySQL portability

    status = Column(Enum(DeviceStatus), default=DeviceStatus.enrolled, nullable=False)

    # Free-form bag for device-type-specific attributes (future device types)
    attributes = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    tenant = relationship("Tenant", back_populates="devices")
    recommendation_links = relationship("RecommendationDevice", back_populates="device")
