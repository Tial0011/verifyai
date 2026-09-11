/**
 * VERIFY-AI — local session storage utilities.
 *
 * Per the "local storage + single Firestore write" architecture: nothing
 * about a participant's progress is written to Firestore until the final
 * study submission. Until then, progress lives here, in the browser's
 * localStorage, scoped under keys prefixed with "verifyAI_".
 *
 * This module only knows how to read/write/clear those keys. It has no
 * Firebase dependency and makes no assumptions about what shape the
 * study-progress object eventually takes — that's owned by whichever
 * module is building up the participant's record (entry, cases, etc).
 */

const DRAFT_KEY = "verifyAI_participant_draft";
const PROGRESS_KEY = "verifyAI_study_progress";
const IDEMPOTENCY_KEY = "verifyAI_submission_idempotency_key";
const RESULT_KEY = "verifyAI_submission_result";

/** Reads and JSON-parses a key; returns null if absent or unparsable. */
function readJSON(key) {
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`VERIFY-AI: could not parse localStorage key "${key}"`, err);
    return null;
  }
}

/** JSON-serializes and writes a value to a key. */
function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// --- Participant draft (information + consent, from the entry page) ------

export function getParticipantDraft() {
  return readJSON(DRAFT_KEY);
}

export function saveParticipantDraft(participantData) {
  writeJSON(DRAFT_KEY, participantData);
}

export function clearParticipantDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

// --- Study progress (case responses, diagnoses, confidence, timestamps) --

export function getStudyProgress() {
  return readJSON(PROGRESS_KEY);
}

export function saveStudyProgress(progressData) {
  writeJSON(PROGRESS_KEY, progressData);
}

export function clearStudyProgress() {
  localStorage.removeItem(PROGRESS_KEY);
}

/**
 * Clears all temporary VERIFY-AI local state. Call this ONLY after a final
 * Firestore submission has been confirmed successful — never before, and
 * never on a failed submission (see the failure-handling requirements in
 * the architecture notes).
 *
 * This does NOT clear the submission result/idempotency key — those are
 * cleared separately (see clearSubmissionAttemptState) once the
 * confirmation screen is no longer needed, so a refresh right after
 * success still shows the same participant ID rather than losing it.
 */
export function clearAllLocalStudyState() {
  clearParticipantDraft();
  clearStudyProgress();
}

// --- Final-submission bookkeeping (idempotency key + stored result) ------
//
// These exist to make the single final Firestore write safe to retry:
// the same idempotency key is reused across retries/refreshes of an
// in-flight submission, and a stored result short-circuits any further
// submission attempts once one has actually succeeded.

/** Returns the current submission idempotency key, creating one if absent. */
export function getOrCreateSubmissionIdempotencyKey() {
  let key = localStorage.getItem(IDEMPOTENCY_KEY);
  if (!key) {
    key = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random()}`;
    localStorage.setItem(IDEMPOTENCY_KEY, key);
  }
  return key;
}

export function getSubmissionResult() {
  return readJSON(RESULT_KEY);
}

export function saveSubmissionResult(result) {
  writeJSON(RESULT_KEY, result);
}

/**
 * Clears the idempotency key and stored result. Only call this once the
 * confirmation screen is genuinely done being needed (e.g. the participant
 * is navigating away) — not as part of ordinary success-path cleanup.
 */
export function clearSubmissionAttemptState() {
  localStorage.removeItem(IDEMPOTENCY_KEY);
  localStorage.removeItem(RESULT_KEY);
}
