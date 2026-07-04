from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.recommendation import Recommendation, RecommendationStatus, RecommendationDevice
from app.models.event import Event, EventStatus, TriggerSource
from app.schemas.recommendation import RecommendationOut, RecommendationDetailOut, RecommendationDecision
from app.services.ai_engine import generate_recommendation

router = APIRouter(prefix="/api/recommendations", tags=["Recommendations"])


@router.post("/generate/{tenant_id}", response_model=Optional[RecommendationDetailOut])
def trigger_recommendation(tenant_id: int, db: Session = Depends(get_db)):
    """Run the AI engine on-demand for a tenant (in addition to the scheduled job)."""
    rec = generate_recommendation(db, tenant_id)
    return rec


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

    event = Event(
        tenant_id=rec.tenant_id,
        start_time=rec.recommended_start,
        end_time=rec.recommended_end,
        event_status=EventStatus.scheduled,
        created_from_recommendation=rec.recommendation_id,
        trigger_source=TriggerSource.ai,
        created_by=payload.user_id,
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
