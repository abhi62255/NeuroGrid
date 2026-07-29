import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler

from app.config import settings
from app.database import Base, engine, SessionLocal
from app import models  # noqa: F401  (registers all models on Base.metadata)
from app.routers import tenants, users, devices, telemetry, recommendations, events, tariffs, dashboard, ws
from app.services.ai_engine import generate_recommendation
from app.models.tenant import Tenant
from app.models.event import Event, EventStatus
from app.models.recommendation import Recommendation, RecommendationStatus

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("dr_system")

scheduler = BackgroundScheduler()


def run_recommendation_cycle():
    """Scheduled job: generate a recommendation for every active tenant."""
    db = SessionLocal()
    try:
        tenant_ids = [t.id for t in db.query(Tenant).filter(Tenant.status == "active").all()]
    finally:
        db.close()

    for tenant_id in tenant_ids:
        db = SessionLocal()
        try:
            rec = generate_recommendation(db, tenant_id)
            if rec:
                logger.info("Generated recommendation %s for tenant %s", rec.recommendation_id, tenant_id)
        except Exception:
            logger.exception("Recommendation cycle failed for tenant %s", tenant_id)
        finally:
            db.close()


def run_status_sweep():
    """Scheduled job: auto-transition events based on UTC time.

    scheduled → active  when start_time has passed
    active    → completed when end_time has passed
    Also expires pending recommendations whose window has fully passed.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)  # naive UTC for DB comparison
    db = SessionLocal()
    try:
        # scheduled → active: start_time passed but end_time not yet
        to_activate = (
            db.query(Event)
            .filter(
                Event.event_status == EventStatus.scheduled,
                Event.start_time <= now,
                Event.end_time > now,
            )
            .all()
        )
        for ev in to_activate:
            ev.event_status = EventStatus.active
            logger.info("Auto-activated event %s (start_time %s UTC)", ev.event_id, ev.start_time)

        # active → completed: end_time has passed
        to_complete = (
            db.query(Event)
            .filter(
                Event.event_status.in_([EventStatus.active, EventStatus.scheduled]),
                Event.end_time <= now,
            )
            .all()
        )
        for ev in to_complete:
            ev.event_status = EventStatus.completed
            logger.info("Auto-completed event %s (end_time %s UTC)", ev.event_id, ev.end_time)

        # Expire pending recommendations whose window is fully in the past
        expired_recs = (
            db.query(Recommendation)
            .filter(
                Recommendation.recommendation_status == RecommendationStatus.pending,
                Recommendation.recommended_end < now,
            )
            .all()
        )
        for rec in expired_recs:
            rec.recommendation_status = RecommendationStatus.expired
            logger.info("Expired recommendation %s (window ended %s UTC)", rec.recommendation_id, rec.recommended_end)

        if to_activate or to_complete or expired_recs:
            db.commit()
    except Exception:
        logger.exception("Status sweep failed")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ────────────────────────────────────────────────────────────
    Base.metadata.create_all(bind=engine)
    scheduler.add_job(
        run_recommendation_cycle,
        "interval",
        seconds=settings.RECOMMENDATION_INTERVAL_SECONDS,
        id="recommendation_cycle",
        replace_existing=True,
    )
    # Status sweep every 60s: scheduled→active→completed based on UTC time
    scheduler.add_job(
        run_status_sweep,
        "interval",
        seconds=60,
        id="status_sweep",
        replace_existing=True,
    )
    scheduler.start()
    run_status_sweep()  # immediate sweep on startup
    logger.info(
        "Startup complete. Recommendation engine every %ss. Status sweep every 60s.",
        settings.RECOMMENDATION_INTERVAL_SECONDS,
    )

    yield  # ← application runs here

    # ── Shutdown ───────────────────────────────────────────────────────────
    scheduler.shutdown(wait=False)


app = FastAPI(
    title="AI-Powered Demand Response Event Recommendation System",
    description="EV-first, device-agnostic DR recommendation platform.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tenants.router)
app.include_router(users.router)
app.include_router(devices.router)
app.include_router(telemetry.router)
app.include_router(recommendations.router)
app.include_router(events.router)
app.include_router(tariffs.router)
app.include_router(dashboard.router)
app.include_router(ws.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
