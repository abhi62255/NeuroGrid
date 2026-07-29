import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useAutoRefresh(fetchFn, intervalMs?)
 *
 * Calls fetchFn immediately on mount, then every intervalMs milliseconds.
 * Returns:
 *   - lastUpdated  Date | null
 *   - refreshing   boolean — true during the in-flight fetch
 *   - refresh      () => void — call to trigger a manual refresh
 *
 * fetchFn must be stable (wrap in useCallback at call site) or
 * pass deps as a third argument.
 */
export function useAutoRefresh(fetchFn, intervalMs = 30_000) {
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchFn();
      setLastUpdated(new Date());
    } finally {
      setRefreshing(false);
    }
  }, [fetchFn]);

  useEffect(() => {
    refresh();
    timerRef.current = setInterval(refresh, intervalMs);
    return () => clearInterval(timerRef.current);
  }, [refresh, intervalMs]);

  return { lastUpdated, refreshing, refresh };
}

/** Formats a Date as "Updated X seconds/minutes ago" */
export function useRelativeTime(date) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!date) return;
    const update = () => {
      const diff = Math.round((Date.now() - date.getTime()) / 1000);
      if (diff < 60) setLabel(`Updated ${diff}s ago`);
      else setLabel(`Updated ${Math.round(diff / 60)}m ago`);
    };
    update();
    const t = setInterval(update, 5000);
    return () => clearInterval(t);
  }, [date]);

  return label;
}
