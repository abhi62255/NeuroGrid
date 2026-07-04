from datetime import datetime
from typing import Optional, List, Any, Dict

from pydantic import BaseModel, ConfigDict


class RecommendationDeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    device_id: int
    expected_contribution_kw: Optional[float] = None
    participated: bool = False


class RecommendationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    recommendation_id: int
    tenant_id: int
    recommendation_time: datetime
    recommendation_status: str
    confidence_score: Optional[float] = None
    reasoning: Optional[str] = None
    recommended_start: Optional[datetime] = None
    recommended_end: Optional[datetime] = None
    predicted_load_reduction_kw: Optional[float] = None
    predicted_energy_shifted_kwh: Optional[float] = None
    estimated_customer_incentive: Optional[float] = None
    estimated_utility_savings: Optional[float] = None
    accepted_by_user: Optional[int] = None
    event_id: Optional[int] = None
    targeted_device_count: Optional[int] = None

    @classmethod
    def from_orm_with_count(cls, rec) -> "RecommendationOut":
        obj = cls.model_validate(rec)
        obj.targeted_device_count = len(rec.device_links) if rec.device_links else 0
        return obj


class RecommendationDetailOut(RecommendationOut):
    device_links: List[RecommendationDeviceOut] = []
    raw_llm_response: Optional[Dict[str, Any]] = None


class RecommendationDecision(BaseModel):
    user_id: Optional[int] = None
