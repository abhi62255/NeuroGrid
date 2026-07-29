/**
 * Shared UTC time formatting utilities.
 * All timestamps in NeuroGrid are stored and transmitted as UTC.
 * Display them as UTC so the UI matches the backend exactly.
 */

const UTC_OPTS = { timeZone: "UTC" };

/**
 * Parse a datetime string as UTC.
 * FastAPI serialises naive datetimes without a 'Z' suffix, so browsers
 * interpret them as local time.  Append 'Z' when no timezone is present.
 */
function toUtcDate(dt) {
  if (!dt) return null;
  const s = String(dt);
  // Already has timezone info (Z or +HH:MM)
  if (s.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(s)) return new Date(s);
  return new Date(s + "Z");
}

/** "Jul 29, 2026, 14:32 UTC" */
export function fmtUtcDateTime(dt) {
  if (!dt) return "—";
  return (
    toUtcDate(dt).toLocaleString("en-US", {
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
    toUtcDate(dt).toLocaleString("en-US", {
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
    toUtcDate(dt).toLocaleString("en-US", {
      ...UTC_OPTS,
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }) + " UTC"
  );
}
