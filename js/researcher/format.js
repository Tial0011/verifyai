/**
 * VERIFY-AI — researcher-side formatting helpers.
 *
 * Pure functions only (no DOM, no Firestore) so they're easy to reuse
 * across dashboard.js / participants.js / participant-details.js /
 * csv.js without coupling them to each other.
 */
import { ARM_LABELS, armShowsAi } from "../participant/study-arm.js";
import {
  toDate,
  secondsBetween,
  questionSecondsOf,
  formatDuration,
  toMinutes,
  deriveDurations,
  median,
} from "../utils/duration.js";

// Timestamp parsing and duration maths are shared with the participant
// side (complete.js computes the same durations at submission time), so
// they live in js/utils/duration.js and are re-exported here. Researcher
// modules can keep importing everything from format.js.
export { toDate, secondsBetween, formatDuration, toMinutes, deriveDurations, median };

export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
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

/**
 * The raw timestamp that counts as "the answer was given" for a response:
 * AI arms → initialAnswerAt (first pick, before the AI suggestion showed;
 * null if it was never recorded — no fallback to submittedAt). No-AI →
 * submittedAt. Used for the answered_at column and the timing maths so the
 * two can never disagree.
 */
export function answerMomentFor(response) {
  if (!response) return null;
  const isAiArm = response.studyArm
    ? armShowsAi(response.studyArm)
    : Boolean(response.aiSuggestionShown);
  return (isAiArm ? response.initialAnswerAt : response.submittedAt) || null;
}

/**
 * Per-question timing, derived from the RAW timestamps (which are never
 * modified — see csv.js). Single source of truth for both the CSV export
 * and the participant detail page.
 *
 *   time_to_initial_answer_seconds
 *     AI arms:  startedAt -> initialAnswerAt (first pick, made BEFORE the
 *               AI suggestion appeared). Blank if initialAnswerAt is
 *               missing — no fallback, so an AI-arm value is never
 *               silently swapped for the total time.
 *     No-AI:    startedAt -> submittedAt. There is no AI to reveal, so no
 *               separate first-pick timestamp exists; submission is the
 *               answer moment.
 *
 *   total_question_time_seconds
 *     All arms: startedAt -> submittedAt.
 *
 * Either value is null when a required timestamp is missing.
 */
export function questionTimings(response) {
  if (!response) return { timeToInitialAnswer: null, totalQuestionTime: null };
  return {
    timeToInitialAnswer: secondsBetween(response.startedAt, answerMomentFor(response)),
    totalQuestionTime: questionSecondsOf(response),
  };
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
