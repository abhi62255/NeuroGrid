import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler

from app.config import settings
from app.database import Base, engine, SessionLocal
from app import models  # noqa: F401  (registers all models on Base.metadata)
from app.routers import tenants, users, devices, telemetry, recommendations, events, tariffs, dashboard
from app.services.ai_engine import generate_recommendation
from app.models.tenant import Tenant

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("dr_system")

app = FastAPI(
    title="AI-Powered Demand Response Event Recommendation System",
    description="EV-first, device-agnostic DR recommendation platform.",
    version="1.0.0",
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


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    scheduler.add_job(
        run_recommendation_cycle,
        "interval",
        seconds=settings.RECOMMENDATION_INTERVAL_SECONDS,
        id="recommendation_cycle",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Startup complete. Recommendation engine running every %ss", settings.RECOMMENDATION_INTERVAL_SECONDS)


@app.on_event("shutdown")
def on_shutdown():
    scheduler.shutdown(wait=False)


@app.get("/api/health")
def health():
    return {"status": "ok"}
