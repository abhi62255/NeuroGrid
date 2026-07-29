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


def run_expiry_sweep():
    """Scheduled job: mark stale recommendations and past-window events as expired (UTC)."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)  # naive UTC for DB comparison
    db = SessionLocal()
    try:
        # Expire pending recommendations whose entire window is in the past
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

        # Expire scheduled/active events whose end_time has passed
        expired_events = (
            db.query(Event)
            .filter(
                Event.event_status.in_([EventStatus.scheduled, EventStatus.active]),
                Event.end_time < now,
            )
            .all()
        )
        for ev in expired_events:
            ev.event_status = EventStatus.expired
            logger.info("Expired event %s (end_time %s UTC)", ev.event_id, ev.end_time)

        if expired_recs or expired_events:
            db.commit()
    except Exception:
        logger.exception("Expiry sweep failed")
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
    # Expiry sweep runs every 2 minutes
    scheduler.add_job(
        run_expiry_sweep,
        "interval",
        seconds=120,
        id="expiry_sweep",
        replace_existing=True,
    )
    scheduler.start()
    # Run an immediate sweep on startup to catch anything already expired
    run_expiry_sweep()
    logger.info(
        "Startup complete. Recommendation engine every %ss. Expiry sweep every 120s.",
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
