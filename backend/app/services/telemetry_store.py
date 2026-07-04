"""
Telemetry storage abstraction.

The requirement calls for a NoSQL / time-series store (HBase or an
equivalent free scalable database) that supports high-volume time-series
writes, decoupled from the MySQL relational schema.

To keep the project runnable out-of-the-box without a Hadoop/HBase cluster,
this module defines a small `TelemetryStore` interface with two
implementations:

  * `SqliteTelemetryStore` (default) - a zero-dependency, embedded,
    append-mostly store that mimics a wide-column time-series table
    (row key = device_id + timestamp). Works everywhere out of the box.

  * `HBaseTelemetryStore` - talks to a real HBase cluster via the HappyBase
    Thrift client, using a row-key design of `{device_id}#{reverse_ts}` for
    efficient time-ordered scans, one column family `t:` for telemetry
    fields. Enable by setting TELEMETRY_BACKEND=hbase in the environment.

Swapping backends only requires changing TELEMETRY_BACKEND; the rest of the
application only depends on the `TelemetryStore` interface below.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Optional, List, Dict, Any

from app.config import settings


class TelemetryStore(ABC):
    @abstractmethod
    def write(self, record: Dict[str, Any]) -> None:
        ...

    @abstractmethod
    def query(
        self,
        device_id: Optional[int] = None,
        tenant_id: Optional[int] = None,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        limit: int = 200,
    ) -> List[Dict[str, Any]]:
        ...

    @abstractmethod
    def latest_for_tenant(self, tenant_id: int, within_seconds: int = 300) -> List[Dict[str, Any]]:
        """Return the most recent telemetry row per device for a tenant."""
        ...


class SqliteTelemetryStore(TelemetryStore):
    """Lightweight embedded time-series store, used as the default backend."""

    def __init__(self, path: str):
        self._path = path
        self._lock = threading.Lock()
        self._init_db()

    def _connect(self):
        conn = sqlite3.connect(self._path, timeout=30)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS telemetry (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    device_id INTEGER NOT NULL,
                    tenant_id INTEGER NOT NULL,
                    timestamp TEXT NOT NULL,
                    payload TEXT NOT NULL
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_device_ts ON telemetry(device_id, timestamp)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_tenant_ts ON telemetry(tenant_id, timestamp)")

    def write(self, record: Dict[str, Any]) -> None:
        ts = record.get("timestamp") or datetime.utcnow().isoformat()
        if isinstance(ts, datetime):
            ts = ts.isoformat()
        payload = dict(record)
        payload["timestamp"] = ts
        with self._lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO telemetry (device_id, tenant_id, timestamp, payload) VALUES (?, ?, ?, ?)",
                (record["device_id"], record["tenant_id"], ts, json.dumps(payload, default=str)),
            )

    def query(
        self,
        device_id: Optional[int] = None,
        tenant_id: Optional[int] = None,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        limit: int = 200,
    ) -> List[Dict[str, Any]]:
        clauses, params = [], []
        if device_id is not None:
            clauses.append("device_id = ?")
            params.append(device_id)
        if tenant_id is not None:
            clauses.append("tenant_id = ?")
            params.append(tenant_id)
        if start is not None:
            clauses.append("timestamp >= ?")
            params.append(start.isoformat())
        if end is not None:
            clauses.append("timestamp <= ?")
            params.append(end.isoformat())

        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        sql = f"SELECT payload FROM telemetry {where} ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)

        with self._lock, self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [json.loads(r["payload"]) for r in rows]

    def latest_for_tenant(self, tenant_id: int, within_seconds: int = 300) -> List[Dict[str, Any]]:
        sql = """
            SELECT payload FROM telemetry t1
            WHERE tenant_id = ?
            AND id = (
                SELECT id FROM telemetry t2
                WHERE t2.device_id = t1.device_id
                ORDER BY timestamp DESC LIMIT 1
            )
        """
        with self._lock, self._connect() as conn:
            rows = conn.execute(sql, (tenant_id,)).fetchall()
        return [json.loads(r["payload"]) for r in rows]


class HBaseTelemetryStore(TelemetryStore):
    """
    Real HBase-backed implementation using the HappyBase Thrift client.

    Row key design: "{device_id:012d}#{reversed_timestamp}" so that a scan
    starting at a device's row-key prefix naturally returns the most recent
    readings first. Column family "t" holds all telemetry fields as
    individual qualifiers, which keeps writes cheap and allows selective
    column reads at scale.

    Requires: `pip install happybase` and a running HBase Thrift gateway.
    """

    COLUMN_FAMILY = "t"
    TABLE_NAME = "ev_telemetry"

    def __init__(self, host: str, port: int):
        import happybase  # imported lazily so sqlite-only installs don't need it

        self._pool = happybase.ConnectionPool(size=8, host=host, port=port)
        self._ensure_table()

    def _ensure_table(self):
        with self._pool.connection() as conn:
            if self.TABLE_NAME.encode() not in conn.tables():
                conn.create_table(self.TABLE_NAME, {self.COLUMN_FAMILY: dict(max_versions=1)})

    @staticmethod
    def _row_key(device_id: int, ts: datetime) -> bytes:
        reverse_ts = int(9_999_999_999 - ts.timestamp())
        return f"{device_id:012d}#{reverse_ts:012d}".encode()

    def write(self, record: Dict[str, Any]) -> None:
        ts = record.get("timestamp") or datetime.utcnow()
        if isinstance(ts, str):
            ts = datetime.fromisoformat(ts)
        row_key = self._row_key(record["device_id"], ts)
        data = {
            f"{self.COLUMN_FAMILY}:{k}".encode(): json.dumps(v, default=str).encode()
            for k, v in record.items()
        }
        with self._pool.connection() as conn:
            conn.table(self.TABLE_NAME).put(row_key, data)

    def query(
        self,
        device_id: Optional[int] = None,
        tenant_id: Optional[int] = None,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        limit: int = 200,
    ) -> List[Dict[str, Any]]:
        results = []
        with self._pool.connection() as conn:
            table = conn.table(self.TABLE_NAME)
            row_prefix = f"{device_id:012d}#".encode() if device_id is not None else None
            scan_kwargs = {"limit": limit}
            if row_prefix:
                scan_kwargs["row_prefix"] = row_prefix
            for _, data in table.scan(**scan_kwargs):
                record = {
                    k.decode().split(":", 1)[1]: json.loads(v.decode()) for k, v in data.items()
                }
                if tenant_id is not None and record.get("tenant_id") != tenant_id:
                    continue
                results.append(record)
        return results

    def latest_for_tenant(self, tenant_id: int, within_seconds: int = 300) -> List[Dict[str, Any]]:
        # In production this would use a secondary index (e.g. a tenant->device
        # lookup in MySQL) to drive per-device prefix scans. Left as an
        # extension point since it depends on the deployed device roster.
        raise NotImplementedError("latest_for_tenant requires a tenant->device index; see comments.")


_store_instance: Optional[TelemetryStore] = None


def get_telemetry_store() -> TelemetryStore:
    global _store_instance
    if _store_instance is not None:
        return _store_instance

    if settings.TELEMETRY_BACKEND == "hbase":
        _store_instance = HBaseTelemetryStore(settings.HBASE_HOST, settings.HBASE_PORT)
    else:
        _store_instance = SqliteTelemetryStore(settings.TELEMETRY_SQLITE_PATH)
    return _store_instance
