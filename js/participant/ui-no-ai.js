/**
 * VERIFY-AI — University of Ibadan (No-AI) study page.
 *
 * Scope note: this page only renders participant status, progress, and
 * the first clinical-case template. It reads the participant ID / study
 * condition that entry.js already wrote to localStorage at registration
 * time (localStorage, not sessionStorage, so it also survives a closed
 * tab — see entry.js for why) — it never generates an ID and never reads
 * or writes Firestore itself, so viewing or refreshing this page costs
 * zero database operations.
 *
 * The case form below does not persist responses yet: the diagnosis
 * input, confidence scale, and case content are all placeholders pending
 * research-team approval — see docs/RESEARCHER-REVIEW-UI-NO-AI.md.
 */
import { TOTAL_CASES, CURRENT_CASE_NUMBER, STUDY_NAME } from "../config/study-config.js";

const PARTICIPANT_STORAGE_KEYS = {
  participantId: "verifyai:participantId",
  studyCondition: "verifyai:studyCondition",
};

// This page is the no_ai flow only. Anything else in storage means the
// participant reached this URL without completing registration (or is a
// different study condition's participant navigating here directly).
const EXPECTED_CONDITION = "no_ai";

function redirectToEntry() {
  window.location.href = "entry.html";
}

/** Populates participant status from storage. Returns false (and
 *  redirects) if there's no valid no_ai participant record to show. */
function initParticipantStatus() {
  const participantId = localStorage.getItem(PARTICIPANT_STORAGE_KEYS.participantId);
  const studyCondition = localStorage.getItem(PARTICIPANT_STORAGE_KEYS.studyCondition);

  if (!participantId || studyCondition !== EXPECTED_CONDITION) {
    redirectToEntry();
    return false;
  }

  const idEl = document.getElementById("participant-id-value");
  const studyEl = document.getElementById("study-name-value");
  if (idEl) idEl.textContent = participantId;
  if (studyEl) studyEl.textContent = STUDY_NAME;
  return true;
}

function initProgress() {
  const label = document.getElementById("progress-label");
  const bar = document.getElementById("progress-bar");
  const fill = document.getElementById("progress-fill");
  const inlineCaseNumber = document.getElementById("case-number-inline");

  if (label) label.textContent = `Case ${CURRENT_CASE_NUMBER} of ${TOTAL_CASES}`;
  if (inlineCaseNumber) inlineCaseNumber.textContent = String(CURRENT_CASE_NUMBER);

  const percent = Math.round((CURRENT_CASE_NUMBER / TOTAL_CASES) * 100);
  if (bar) bar.setAttribute("aria-valuenow", String(percent));
  if (fill) fill.style.width = `${percent}%`;
}

function initCaseForm() {
  const form = document.getElementById("case-form");
  const status = document.getElementById("case-status");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    // Case-response storage, the diagnosis format, and the confidence
    // scale are all pending research-team approval — see
    // docs/RESEARCHER-REVIEW-UI-NO-AI.md. Nothing is written to Firestore
    // from this form yet; this only confirms the interaction to the
    // participant for interface review purposes.
    if (status) {
      status.textContent =
        "Thanks — this response has been captured for review. Saving case responses isn't available yet; it will be enabled once the research team approves the case instrument and data schema.";
      status.setAttribute("data-state", "pending");
    }
  });
}

function initFooterYear() {
  const el = document.getElementById("footer-year");
  if (el) el.textContent = String(new Date().getFullYear());
}

document.addEventListener("DOMContentLoaded", () => {
  const hasValidSession = initParticipantStatus();
  if (!hasValidSession) return;
  initProgress();
  initCaseForm();
  initFooterYear();
});
