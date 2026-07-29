import { useCallback, useEffect, useRef, useState } from "react";

// Derive WebSocket base URL from the HTTP API base URL
const WS_BASE = (process.env.REACT_APP_API_BASE_URL || "http://localhost:8000/api")
  .replace(/^http/, "ws")   // http → ws  |  https → wss
  .replace(/\/api\/?$/, ""); // strip trailing /api

/**
 * useTelemetrySocket(tenantUid)
 *
 * Opens a WebSocket to /ws/telemetry/{tenantUid} and returns:
 *   - latestRecord  – the most recent telemetry record pushed by the server
 *   - feed          – rolling list of the last MAX_FEED_LENGTH records
 *   - connected     – true while the socket is open
 *
 * Reconnects automatically after 5 s on disconnect/error.
 * Cleans up on unmount.
 */

const MAX_FEED_LENGTH = 20;
const RETRY_DELAY_MS = 5000;

export function useTelemetrySocket(tenantUid) {
  const [latestRecord, setLatestRecord] = useState(null);
  const [feed, setFeed] = useState([]);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef(null);
  const retryRef = useRef(null);

  const connect = useCallback(() => {
    if (!tenantUid) return;
    const url = `${WS_BASE}/ws/telemetry/${tenantUid}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "telemetry" || msg.type === "snapshot") {
          setLatestRecord(msg.data);
          setFeed((prev) => [msg.data, ...prev].slice(0, MAX_FEED_LENGTH));
        }
        // ignore "ping" messages
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => ws.close();

    ws.onclose = () => {
      setConnected(false);
      retryRef.current = setTimeout(connect, RETRY_DELAY_MS);
    };
  }, [tenantUid]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { latestRecord, feed, connected };
}
