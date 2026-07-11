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
from app.models.event import Event, EventStatus
from app.services import tariff_service
from app.services.telemetry_store import get_telemetry_store

# todo: also give chagrging events

SYSTEM_PROMPT = """You are an expert electric-grid Demand Response (DR) and Smart Charging analyst.
You will be given a JSON summary of an electric-vehicle (EV) fleet's current
telemetry (including battery SOC, min_soc, max_soc, and departure times), the utility's current electricity tariff/price period, and DR
program constraints. Decide whether a Demand Response event should be recommended right now.

An event can be one of two types:
1. "stop_charging" (Demand Response / Curtailment): Recommending that targeted EVs stop charging to reduce grid load.
   - Recommending these events during On-Peak (expensive) pricing periods.
   - Only target devices that are currently charging and plugged in at home, where their current SOC is strictly ABOVE their min_soc. If a device's current SOC is below its min_soc, it must be allowed to charge and NOT be curtailed.
2. "start_charging" (Smart Charging): Recommending that targeted EVs start charging.
   - Recommending these events during Off-Peak (cheap) pricing periods, OR when a device's current SOC is below its min_soc (regardless of peak period, to ensure user has minimum charge), OR depending on when they have to go (if they need to charge to reach their max_soc before the estimated_departure_time).
   - Only target devices that are plugged in at home but not currently charging (or charging below capability), whose current SOC is below their max_soc.

Constraints:
- Respect max_event_duration_minutes and min_required_load_reduction_kw (for stop_charging events).
- Be conservative with confidence when data is sparse.

Respond with ONLY a single JSON object (no markdown, no prose) matching
exactly this shape:
{
  "recommend_event": boolean,
  "event_type": "stop_charging" | "start_charging",
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


def build_fleet_summary(
    devices: List[Device],
    telemetry_by_device: Dict[int, Dict[str, Any]],
    busy_device_ids: Optional[set] = None
) -> Dict[str, Any]:
    """Aggregate device + latest-telemetry rows into a compact fleet summary for the LLM."""
    eligible = []
    total_power_kw = 0.0
    total_flex_kw = 0.0
    soc_values = []

    for dev in devices:
        if busy_device_ids and dev.id in busy_device_ids:
            continue
        t = telemetry_by_device.get(dev.id)
        if not t:
            continue
        if t.get("charging_status") not in ("charging", "idle"):
            continue
        if not t.get("plugged_in"):
            continue
        if not t.get("home_plugged"):
            continue

        soc = t.get("soc")
        power = t.get("charging_power_kw") or 0.0
        flex = t.get("available_flexibility_kw") or power

        eligible.append(
            {
                "device_id": f"device_{dev.id}",
                "soc": soc,
                "min_soc": dev.min_soc or 20.0,
                "max_soc": dev.max_soc or 90.0,
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

    # ── Compute busy devices ────────────────────────────────────────────────
    # Collect device IDs that are already targeted in an active/scheduled DR
    # event OR in a pending recommendation for this tenant.  These devices
    # must NOT appear in a parallel recommendation.
    now = datetime.utcnow()

    # Devices already in an active or scheduled Event
    active_event_device_ids: set[int] = set()
    active_events = (
        db.query(Event)
        .filter(
            Event.tenant_id == tenant_id,
            Event.event_status.in_([EventStatus.active, EventStatus.scheduled]),
            Event.end_time > now,
        )
        .all()
    )
    for ev in active_events:
        # Pull devices from the originating recommendation (if any)
        if ev.created_from_recommendation:
            links = (
                db.query(RecommendationDevice)
                .filter(RecommendationDevice.recommendation_id == ev.created_from_recommendation)
                .all()
            )
            for link in links:
                active_event_device_ids.add(link.device_id)

    # Devices already in a pending recommendation (not yet accepted / rejected)
    pending_rec_device_ids: set[int] = set()
    pending_recs = (
        db.query(Recommendation)
        .filter(
            Recommendation.tenant_id == tenant_id,
            Recommendation.recommendation_status == RecommendationStatus.pending,
        )
        .all()
    )
    for prec in pending_recs:
        for link in prec.device_links:
            pending_rec_device_ids.add(link.device_id)

    busy_device_ids = active_event_device_ids | pending_rec_device_ids

    fleet_summary = build_fleet_summary(devices, telemetry_by_device, busy_device_ids=busy_device_ids)
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
        event_type=llm_result.get("event_type", "stop_charging"),
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
