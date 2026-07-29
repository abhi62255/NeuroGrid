"""
WebSocket connection manager.

Maintains a registry of active WebSocket connections keyed by tenant UID.
Call `manager.broadcast(uid, event_type, data)` from any async context to
push JSON messages to every client currently watching that tenant.
"""

import json
import logging
from typing import Dict, List

from fastapi import WebSocket

logger = logging.getLogger("dr_system")


class ConnectionManager:
    def __init__(self) -> None:
        # tenant_uid → list of open WebSocket connections
        self._connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, tenant_uid: str) -> None:
        await websocket.accept()
        self._connections.setdefault(tenant_uid, []).append(websocket)
        logger.info(
            "WS connect: tenant=%s  open_connections=%d",
            tenant_uid,
            len(self._connections[tenant_uid]),
        )

    def disconnect(self, websocket: WebSocket, tenant_uid: str) -> None:
        conns = self._connections.get(tenant_uid, [])
        if websocket in conns:
            conns.remove(websocket)
        logger.info(
            "WS disconnect: tenant=%s  remaining=%d",
            tenant_uid,
            len(conns),
        )

    async def broadcast(self, tenant_uid: str, event_type: str, data: dict) -> None:
        """Push a JSON message to every connected client for *tenant_uid*.

        Dead / closed connections are pruned automatically.
        """
        conns = self._connections.get(tenant_uid, [])
        if not conns:
            return

        payload = json.dumps({"type": event_type, "data": data}, default=str)
        dead: List[WebSocket] = []
        for ws in list(conns):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, tenant_uid)

    @property
    def connection_counts(self) -> Dict[str, int]:
        return {uid: len(conns) for uid, conns in self._connections.items() if conns}


# Module-level singleton shared across the entire app process
manager = ConnectionManager()
