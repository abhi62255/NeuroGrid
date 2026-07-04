from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Boolean,
    Date,
    Time,
    ForeignKey,
)
from sqlalchemy.orm import relationship

from app.database import Base


class Tariff(Base):
    """Utility electricity pricing structure for a tenant."""

    __tablename__ = "tariffs"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)

    tariff_name = Column(String(255), nullable=False)
    effective_start_date = Column(Date, nullable=True)
    effective_end_date = Column(Date, nullable=True)
    timezone = Column(String(64), nullable=False, default="UTC")

    on_peak_rate = Column(Float, nullable=True)
    mid_peak_rate = Column(Float, nullable=True)
    off_peak_rate = Column(Float, nullable=True)
    super_off_peak_rate = Column(Float, nullable=True)

    currency = Column(String(8), default="USD")
    active = Column(Boolean, default=True)

    # DR program parameters used by the AI engine
    max_event_duration_minutes = Column(Integer, default=120)
    incentive_per_kwh = Column(Float, nullable=True)
    min_required_load_reduction_kw = Column(Float, nullable=True)

    tenant = relationship("Tenant", back_populates="tariffs")
    tou_schedules = relationship("TouSchedule", back_populates="tariff", cascade="all, delete-orphan")


class TouSchedule(Base):
    """A single time-of-use window entry for a tariff (e.g. Mon-Fri 16:00-21:00 -> on_peak)."""

    __tablename__ = "tou_schedules"

    id = Column(Integer, primary_key=True, index=True)
    tariff_id = Column(Integer, ForeignKey("tariffs.id"), nullable=False)

    # comma-separated day abbreviations, e.g. "mon,tue,wed,thu,fri" or "sat,sun"
    days_of_week = Column(String(64), nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    period_name = Column(String(32), nullable=False)  # on_peak / mid_peak / off_peak / super_off_peak

    tariff = relationship("Tariff", back_populates="tou_schedules")
