/**
 * VERIFY-AI — session duration: derivation and formatting.
 *
 * "How long did this participant take?" is asked in four places — the
 * final submission record, the participants table, the participant
 * detail page, and both CSV exports. This module is the single place
 * that answers it, so those four can never disagree.
 *
 * Pure functions only: no DOM, no Firestore, no localStorage. Safe to
 * import from participant pages and researcher pages alike.
 *
 * ---------------------------------------------------------------------
 * THREE DURATIONS ARE RECORDED, NOT ONE
 * ---------------------------------------------------------------------
 * They answer different research questions and can differ a lot for the
 * same participant, so the export carries all three rather than picking
 * one and calling it "time taken":
 *
 *   totalSeconds       Entry form completed → final submission pressed.
 *                      The full session, wall-clock. Includes any time
 *                      the participant spent away from the screen, and
 *                      includes the pause on the final submission page.
 *                      This is the "it took me 6 minutes" number.
 *
 *   assessmentSeconds  First question shown → last question submitted.
 *                      Wall-clock time on the clinical assessment
 *                      itself, excluding the consent/entry form and the
 *                      final submit screen. Usually the fairest
 *                      between-arm comparison, because the No-AI arm has
 *                      no AI panel to read but the same entry form.
 *
 *   activeSeconds      Sum of each question's own start→submit time.
 *                      Excludes gaps *between* questions. Equals
 *                      assessmentSeconds when a participant works
 *                      straight through; is noticeably smaller when they
 *                      walked away mid-assessment, which makes the gap
 *                      between the two a useful data-quality signal.
 *
 * All three are derived from raw timestamps that are recorded and
 * exported unmodified. Nothing here ever overwrites a raw timestamp, and
 * a duration that cannot be computed is null — never zero, and never a
 * guess (see the "missing value is an empty field" rule in csv.js).
 */

/** Firestore Timestamp | ISO string | Date | null → Date | null. Never throws. */
export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === "function") return value.toDate(); // Firestore Timestamp
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Whole seconds between two timestamp-like values, or null if either is
 * missing or the result would be negative (clock skew / bad data — we
 * report nothing rather than a nonsense duration).
 */
export function secondsBetween(startValue, endValue) {
  const start = toDate(startValue);
  const end = toDate(endValue);
  if (!start || !end) return null;
  const diff = Math.round((end.getTime() - start.getTime()) / 1000);
  return diff >= 0 ? diff : null;
}

/**
 * Human-readable duration: "4m 32s", "1h 12m", "48s".
 *
 * Used for display only. Every CSV column that carries a duration also
 * carries the raw seconds as an integer, so analysis never has to parse
 * this string.
 */
export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) {
    return "Not recorded";
  }
  const total = Math.max(0, Math.round(Number(seconds)));

  if (total < 60) return `${total}s`;

  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return secs === 0 ? `${minutes}m` : `${minutes}m ${secs}s`;
}

/** Duration rounded to one decimal place in minutes — convenient for analysis. */
export function toMinutes(seconds) {
  if (seconds === null || seconds === undefined) return null;
  return Math.round((Number(seconds) / 60) * 10) / 10;
}

/** The responses array off a participant record / progress object, always an array. */
function responsesOf(source) {
  if (!source) return [];
  const list = source.studyResponses || source.responses;
  return Array.isArray(list) ? list.filter(Boolean) : [];
}

/**
 * First `startedAt` across the responses — when the participant was first
 * shown a question. Prefers an explicitly recorded value on the record.
 */
export function assessmentStartOf(source) {
  if (!source) return null;
  const explicit =
    (source.timestamps && source.timestamps.assessmentStartedAt) || source.assessmentStartedAt;
  if (explicit) return explicit;

  const dates = responsesOf(source)
    .map((r) => toDate(r.startedAt))
    .filter(Boolean);
  if (!dates.length) return null;
  return new Date(Math.min(...dates.map((d) => d.getTime())));
}

/** Last `submittedAt` across the responses — when the final question was answered. */
export function assessmentEndOf(source) {
  if (!source) return null;
  const explicit =
    (source.timestamps && source.timestamps.assessmentCompletedAt) ||
    source.assessmentCompletedAt;
  if (explicit) return explicit;

  const dates = responsesOf(source)
    .map((r) => toDate(r.submittedAt))
    .filter(Boolean);
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((d) => d.getTime())));
}

/**
 * Sum of each question's own start→submit time, in seconds. Null when no
 * question contributed a usable pair of timestamps (so an incomplete
 * record reports "not recorded" rather than a misleading 0).
 */
export function questionSecondsOf(response) {
  return Number.isFinite(response.activeTimeMs)
    ? Math.round(Math.max(0, response.activeTimeMs) / 1000)
    : secondsBetween(response.startedAt, response.submittedAt);
}

export function activeSecondsOf(source) {
  let sum = 0;
  let counted = 0;
  responsesOf(source).forEach((r) => {
    const secs = questionSecondsOf(r);
    if (secs !== null) {
      sum += secs;
      counted += 1;
    }
  });
  return counted > 0 ? sum : null;
}

/**
 * The three durations for a participant record (as stored in Firestore)
 * or for an in-progress local record.
 *
 * Backwards compatible on purpose: participant documents written before
 * durations were recorded have no `durations` field, so this derives
 * everything from the raw timestamps those records already carry. Any
 * stored value wins over a derived one, because the stored value was
 * computed on the participant's own device at submission time.
 *
 * @returns {{totalSeconds: number|null, assessmentSeconds: number|null,
 *            activeSeconds: number|null}}
 */
export function deriveDurations(record) {
  if (!record) {
    return { totalSeconds: null, assessmentSeconds: null, activeSeconds: null };
  }

  const stored = record.durations || {};
  const ts = record.timestamps || {};

  const totalSeconds =
    typeof stored.totalSeconds === "number"
      ? stored.totalSeconds
      : secondsBetween(ts.enteredAt, ts.submittedAt || record.createdAt);

  const assessmentSeconds =
    typeof stored.assessmentSeconds === "number"
      ? stored.assessmentSeconds
      : secondsBetween(assessmentStartOf(record), assessmentEndOf(record));

  const activeSeconds =
    typeof stored.activeSeconds === "number" ? stored.activeSeconds : activeSecondsOf(record);

  return { totalSeconds, assessmentSeconds, activeSeconds };
}

/** Median of a list of numbers (nulls ignored), or null if none are usable. */
export function median(values) {
  const nums = values.filter((v) => typeof v === "number" && !Number.isNaN(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 0 ? Math.round((nums[mid - 1] + nums[mid]) / 2) : nums[mid];
}
