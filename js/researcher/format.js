/**
 * VERIFY-AI — researcher-side formatting helpers.
 *
 * Pure functions only (no DOM, no Firestore) so they're easy to reuse
 * across dashboard.js / participants.js / participant-details.js /
 * csv.js without coupling them to each other.
 */
import { ARM_LABELS } from "../participant/study-arm.js";

export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
}

/** Firestore Timestamp | ISO string | null → Date | null. Never throws. */
export function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate(); // Firestore Timestamp
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const TIME_FMT = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const DATETIME_FMT = new Intl.DateTimeFormat(undefined, {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(value) {
  const d = toDate(value);
  return d ? DATE_FMT.format(d) : "Not recorded";
}

export function formatTime(value) {
  const d = toDate(value);
  return d ? TIME_FMT.format(d) : "Not recorded";
}

export function formatDateTime(value) {
  const d = toDate(value);
  return d ? DATETIME_FMT.format(d) : "Not recorded";
}

/** "3 min ago" / "Just now" / "2 days ago" style relative label. */
export function formatRelative(value) {
  const d = toDate(value);
  if (!d) return "Unknown time";
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 5) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}

/** Whole seconds between two timestamp-like values, or null if either is missing. */
export function secondsBetween(startValue, endValue) {
  const start = toDate(startValue);
  const end = toDate(endValue);
  if (!start || !end) return null;
  const diff = Math.round((end.getTime() - start.getTime()) / 1000);
  return diff >= 0 ? diff : null;
}

export function formatSeconds(seconds) {
  if (seconds === null || seconds === undefined) return "Not recorded";
  return `${seconds}s`;
}

export function armLabel(studyCondition) {
  return ARM_LABELS[studyCondition] || studyCondition || "Unknown";
}

/** Overall completion status for a participant record. */
export function completionStatus(participant) {
  const total = participant.questionsTotal;
  const completed = participant.questionsCompleted;
  if (typeof total === "number" && typeof completed === "number" && completed >= total && total > 0) {
    return "Complete";
  }
  return "Incomplete";
}
