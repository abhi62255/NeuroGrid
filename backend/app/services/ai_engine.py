"""
AI Demand Response Recommendation Engine.

Periodically (or on-demand):
  1. Reads recent telemetry for a tenant's eligible devices from the
     telemetry store.
  2. Aggregates fleet-level signals (flexible load, charging power,
     participation %).
  3. Resolves the tenant's current tariff / TOU period.
  4. Sends a compact structured summary to the LLM and asks for a
     structured JSON recommendation.
  5. Persists the recommendation (and per-device links) to MySQL.

The engine is device-agnostic at the aggregation layer: `build_fleet_summary`
works off whatever device rows + telemetry are passed in, so future device
types (thermostats, batteries, ...) can plug in their own adapters that
produce the same summary shape and reuse this same LLM workflow.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.models.device import Device
from app.models.recommendation import Recommendation, RecommendationDevice, RecommendationStatus
from app.services import tariff_service
from app.services.telemetry_store import get_telemetry_store

SYSTEM_PROMPT = """You are an expert electric-grid Demand Response (DR) analyst.
You will be given a JSON summary of an electric-vehicle (EV) fleet's current
telemetry, the utility's current electricity tariff/price period, and DR
program constraints. Decide whether a Demand Response event should be
recommended right now.

Guidance:
- Prioritize recommending events during On-Peak (expensive) pricing periods.
- Avoid recommending events during Off-Peak periods unless grid_signal
  indicates a specific non-price reason (e.g. congestion) is present.
- Only include devices that are currently charging or plugged-in with
  sufficient flexibility (will not depart before the event ends).
- Respect max_event_duration_minutes and min_required_load_reduction_kw.
- Be conservative with confidence when data is sparse.

Respond with ONLY a single JSON object (no markdown, no prose) matching
exactly this shape:
{
  "recommend_event": boolean,
  "confidence": number (0-1),
  "reason": string,
  "recommended_start": ISO-8601 datetime string,
  "recommended_end": ISO-8601 datetime string,
  "expected_load_reduction_kw": number,
  "expected_energy_shifted_kwh": number,
  "estimated_customer_incentive": number,
  "estimated_utility_savings": number,
  "eligible_devices": [string, ...]
}
"""


def build_fleet_summary(devices: List[Device], telemetry_by_device: Dict[int, Dict[str, Any]]) -> Dict[str, Any]:
    """Aggregate device + latest-telemetry rows into a compact fleet summary for the LLM."""
    eligible = []
    total_power_kw = 0.0
    total_flex_kw = 0.0
    soc_values = []

    for dev in devices:
        t = telemetry_by_device.get(dev.id)
        if not t:
            continue
        if t.get("charging_status") not in ("charging", "idle"):
            continue
        if not t.get("plugged_in"):
            continue

        soc = t.get("soc")
        power = t.get("charging_power_kw") or 0.0
        flex = t.get("available_flexibility_kw") or power

        eligible.append(
            {
                "device_id": f"device_{dev.id}",
                "soc": soc,
                "charging_power_kw": power,
                "available_flexibility_kw": flex,
                "estimated_departure_time": t.get("estimated_departure_time"),
            }
        )
        total_power_kw += power
        total_flex_kw += flex
        if soc is not None:
            soc_values.append(soc)

    avg_soc = sum(soc_values) / len(soc_values) if soc_values else None
    participation_pct = (len(eligible) / len(devices) * 100) if devices else 0

    return {
        "fleet_size": len(devices),
        "eligible_device_count": len(eligible),
        "participation_percentage": round(participation_pct, 1),
        "total_charging_power_kw": round(total_power_kw, 2),
        "total_available_flexibility_kw": round(total_flex_kw, 2),
        "average_soc_percent": round(avg_soc, 1) if avg_soc is not None else None,
        "eligible_devices": eligible[:500],  # cap payload size
    }


def _call_llm(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Calls the Google Gemini API and parses the structured JSON recommendation."""
    from google import genai
    from google.genai import types

    api_key = settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY
    client = genai.Client(api_key=api_key or None)

    response = client.models.generate_content(
        model=settings.AI_MODEL,
        contents=json.dumps(payload, default=str),
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
            temperature=0.0,
        )
    )
    text = response.text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    return json.loads(text.strip())


def generate_recommendation(db: Session, tenant_id: int, lookback_seconds: int = 600) -> Optional[Recommendation]:
    """Runs one full recommendation cycle for a tenant and persists the result."""
    store = get_telemetry_store()

    devices = (
        db.query(Device)
        .filter(Device.tenant_id == tenant_id, Device.status == "enrolled")
        .all()
    )
    if not devices:
        return None

    try:
        latest_rows = store.latest_for_tenant(tenant_id, within_seconds=lookback_seconds)
    except NotImplementedError:
        # HBase backend without a secondary index configured; fall back to
        # per-device query (slower, but functionally correct).
        latest_rows = []
        for dev in devices:
            rows = store.query(device_id=dev.id, tenant_id=tenant_id, limit=1)
            if rows:
                latest_rows.append(rows[0])

    telemetry_by_device = {row["device_id"]: row for row in latest_rows}

    fleet_summary = build_fleet_summary(devices, telemetry_by_device)
    price_info = tariff_service.get_current_price_info(db, tenant_id)

    payload = {
        "utility": price_info,
        "fleet": fleet_summary,
        "now": datetime.utcnow().isoformat(),
    }

    llm_result = _call_llm(payload)

    if not llm_result.get("recommend_event"):
        return None

    rec = Recommendation(
        tenant_id=tenant_id,
        recommendation_status=RecommendationStatus.pending,
        confidence_score=llm_result.get("confidence"),
        reasoning=llm_result.get("reason"),
        recommended_start=_parse_dt(llm_result.get("recommended_start")),
        recommended_end=_parse_dt(llm_result.get("recommended_end")),
        predicted_load_reduction_kw=llm_result.get("expected_load_reduction_kw"),
        predicted_energy_shifted_kwh=llm_result.get("expected_energy_shifted_kwh"),
        estimated_customer_incentive=llm_result.get("estimated_customer_incentive"),
        estimated_utility_savings=llm_result.get("estimated_utility_savings"),
        raw_llm_response=llm_result,
    )
    db.add(rec)
    db.flush()  # get recommendation_id

    device_id_lookup = {f"device_{d.id}": d.id for d in devices}
    contribution_map = {
        item["device_id"]: item.get("available_flexibility_kw")
        for item in fleet_summary["eligible_devices"]
    }
    for ext_id in llm_result.get("eligible_devices", []):
        internal_id = device_id_lookup.get(ext_id)
        if internal_id is None:
            continue
        db.add(
            RecommendationDevice(
                recommendation_id=rec.recommendation_id,
                device_id=internal_id,
                expected_contribution_kw=contribution_map.get(ext_id),
            )
        )

    db.commit()
    db.refresh(rec)
    return rec


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
