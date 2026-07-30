from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from google.genai import errors as genai_errors
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.recommendation import Recommendation, RecommendationStatus, RecommendationDevice
from app.models.event import Event, EventStatus, TriggerSource
from app.schemas.recommendation import RecommendationOut, RecommendationDetailOut, RecommendationDecision
from app.services.ai_engine import generate_recommendation

router = APIRouter(prefix="/api/recommendations", tags=["Recommendations"])


def _status_code_from_genai_error(exc: Exception, default: int) -> int:
    status = getattr(exc, "status", None)
    if isinstance(status, int):
        return status

    response = getattr(exc, "response", None)
    response_status = getattr(response, "status_code", None)
    if isinstance(response_status, int):
        return response_status

    if isinstance(status, str):
        normalized = status.upper()
        if normalized == "RESOURCE_EXHAUSTED":
            return 429
        if normalized == "UNAVAILABLE":
            return 503

    return default


@router.post("/generate/{tenant_id}", response_model=Optional[RecommendationDetailOut])
def trigger_recommendation(tenant_id: int, db: Session = Depends(get_db)):
    """Run the AI engine on-demand for a tenant (in addition to the scheduled job)."""
    try:
        rec = generate_recommendation(db, tenant_id)
        return rec
    except genai_errors.ClientError as exc:
        detail = exc.message or "Gemini API request failed."
        raise HTTPException(status_code=_status_code_from_genai_error(exc, 429), detail=detail)
    except genai_errors.ServerError as exc:
        detail = exc.message or "Gemini API is temporarily unavailable."
        raise HTTPException(status_code=_status_code_from_genai_error(exc, 503), detail=detail)


@router.get("", response_model=List[RecommendationOut])
def list_recommendations(
    tenant_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Recommendation).options(selectinload(Recommendation.device_links))
    if tenant_id:
        q = q.filter(Recommendation.tenant_id == tenant_id)
    if status:
        q = q.filter(Recommendation.recommendation_status == status)
    recs = q.order_by(Recommendation.recommendation_time.desc()).limit(500).all()
    return [RecommendationOut.from_orm_with_count(r) for r in recs]



@router.get("/{recommendation_id}", response_model=RecommendationDetailOut)
def get_recommendation(recommendation_id: int, db: Session = Depends(get_db)):
    rec = db.query(Recommendation).get(recommendation_id)
    if not rec:
        raise HTTPException(404, "Recommendation not found")
    return rec


@router.post("/{recommendation_id}/accept", response_model=RecommendationDetailOut)
def accept_recommendation(recommendation_id: int, payload: RecommendationDecision, db: Session = Depends(get_db)):
    rec = db.query(Recommendation).get(recommendation_id)
    if not rec:
        raise HTTPException(404, "Recommendation not found")
    if rec.recommendation_status != RecommendationStatus.pending:
        raise HTTPException(400, "Recommendation already decided")
    if rec.recommended_start is None or rec.recommended_end is None:
        raise HTTPException(400, "Recommendation has no event window; cannot create event")

    now = datetime.utcnow()
    # If the recommended start is in the past (e.g. AI generated it earlier),
    # start the event immediately rather than scheduling it for the past.
    start_time = rec.recommended_start if rec.recommended_start > now else now

    event = Event(
        tenant_id=rec.tenant_id,
        start_time=start_time,
        end_time=rec.recommended_end,
        event_status=EventStatus.active,   # Accept = go live immediately
        created_from_recommendation=rec.recommendation_id,
        trigger_source=TriggerSource.ai,
        created_by=payload.user_id,
        event_type=rec.event_type,
    )
    db.add(event)
    db.flush()

    rec.recommendation_status = RecommendationStatus.accepted
    rec.accepted_by_user = payload.user_id
    rec.event_id = event.event_id

    for link in rec.device_links:
        link.participated = True

    db.commit()
    db.refresh(rec)
    return rec


@router.post("/{recommendation_id}/reject", response_model=RecommendationDetailOut)
def reject_recommendation(recommendation_id: int, payload: RecommendationDecision, db: Session = Depends(get_db)):
    rec = db.query(Recommendation).get(recommendation_id)
    if not rec:
        raise HTTPException(404, "Recommendation not found")
    if rec.recommendation_status != RecommendationStatus.pending:
        raise HTTPException(400, "Recommendation already decided")

    rec.recommendation_status = RecommendationStatus.rejected
    rec.accepted_by_user = payload.user_id
    db.commit()
    db.refresh(rec)
    return rec
