"""
WebSocket endpoints for real-time telemetry streaming.

Clients connect to /ws/telemetry/{tenant_uid} and receive JSON messages:

  {"type": "snapshot",  "data": { ...telemetry record ... }}   ← burst on connect
  {"type": "telemetry", "data": { ...telemetry record ... }}   ← each new reading
  {"type": "ping",      "data": {}}                            ← keepalive every 30 s

Clients may send any text (e.g. "ping") to keep the connection alive.
"""

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.database import SessionLocal
from app.models.tenant import Tenant
from app.services.telemetry_store import get_telemetry_store
from app.services.ws_manager import manager

logger = logging.getLogger("dr_system")
router = APIRouter(tags=["WebSocket"])

KEEPALIVE_SECONDS = 30
SNAPSHOT_SECONDS = 300  # send readings from last 5 min on connect


@router.websocket("/ws/telemetry/{tenant_uid}")
async def telemetry_ws(websocket: WebSocket, tenant_uid: str) -> None:
    # ── Validate tenant ────────────────────────────────────────────────────
    db = SessionLocal()
    try:
        tenant = db.query(Tenant).filter(Tenant.tenant_uid == tenant_uid).first()
        if not tenant:
            await websocket.close(code=4004, reason="Tenant not found")
            return
        tenant_id = tenant.id
    finally:
        db.close()

    await manager.connect(websocket, tenant_uid)

    # ── Send snapshot of recent readings on connect ─────────────────────
    try:
        store = get_telemetry_store()
        for record in store.latest_for_tenant(tenant_id, within_seconds=SNAPSHOT_SECONDS):
            await websocket.send_json({"type": "snapshot", "data": record})
    except Exception:
        logger.exception("Error sending WS snapshot for tenant %s", tenant_uid)

    # ── Main receive loop (keepalive pings) ────────────────────────────
    try:
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=KEEPALIVE_SECONDS)
            except asyncio.TimeoutError:
                # Client is still there; send a server-side ping so proxies don't drop it
                await websocket.send_json({"type": "ping", "data": {}})
    except WebSocketDisconnect:
        manager.disconnect(websocket, tenant_uid)
    except Exception:
        logger.exception("WS error for tenant %s", tenant_uid)
        manager.disconnect(websocket, tenant_uid)
