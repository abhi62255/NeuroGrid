/**
 * Shared UTC time formatting utilities.
 * All timestamps in NeuroGrid are stored and transmitted as UTC.
 * Display them as UTC so the UI matches the backend exactly.
 */

const UTC_OPTS = { timeZone: "UTC" };

/** "Jul 29, 2026, 14:32 UTC" */
export function fmtUtcDateTime(dt) {
  if (!dt) return "—";
  return (
    new Date(dt).toLocaleString("en-US", {
      ...UTC_OPTS,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }) + " UTC"
  );
}

/** "14:32 UTC" */
export function fmtUtcTime(dt) {
  if (!dt) return "—";
  return (
    new Date(dt).toLocaleString("en-US", {
      ...UTC_OPTS,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }) + " UTC"
  );
}

/** "Jul 29, 14:32 UTC" (compact — for table cells) */
export function fmtUtcShort(dt) {
  if (!dt) return "—";
  return (
    new Date(dt).toLocaleString("en-US", {
      ...UTC_OPTS,
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }) + " UTC"
  );
}
