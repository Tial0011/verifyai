/**
 * VERIFY-AI — final submission page.
 *
 * Assembles the participant's complete local record (draft + case
 * responses) and hands it to submitFinalRecord (js/firebase/submission.js)
 * for the single Firestore write. This file owns the UI states around
 * that call; the write/ID-generation/idempotency logic itself lives in
 * submission.js.
 *
 * Field shape note: the object passed to submitFinalRecord mirrors the
 * conceptual example in the README/architecture notes (participantId,
 * university, studyCondition, consent, participantInformation,
 * studyResponses, timestamps). It has NOT been reviewed against a
 * research-team-approved data dictionary — treat the exact field names
 * here as provisional until that review happens.
 */
import { TOTAL_QUESTIONS } from "./case-data.js";
import {
  getParticipantDraft,
  getStudyProgress,
  getSubmissionResult,
  clearAllLocalStudyState,
} from "../utils/local-storage.js";
import { submitFinalRecord } from "../firebase/submission.js";
import { resolveArm } from "./study-arm.js";

function assembleResearchRecord(draft, progress) {
  const {
    institution,
    savedAt,
    studyArm,
    ["consent-checkbox"]: consent,
    ...participantInformation
  } = draft;

  return {
    university: institution,
    // The arm recorded on the progress object is the one the participant
    // actually ran under, so it wins over anything re-derived later.
    studyCondition: progress.studyArm || studyArm || resolveArm(draft),
    consent: Boolean(consent),
    participantInformation,
    // One entry per question: scenario/question ids, final answer,
    // confidence, whether an AI suggestion was shown and what it was,
    // VERIFY-AI step responses, independent answer, agreement/change
    // flags, timestamps, completion status.
    studyResponses: progress.responses,
    questionsCompleted: progress.responses.filter((r) => r && r.completed).length,
    questionsTotal: TOTAL_QUESTIONS,
    timestamps: {
      enteredAt: savedAt,
      submittedAt: new Date().toISOString(),
    },
  };
}

function showSuccess(participantId) {
  document.getElementById("submit-state").hidden = true;
  const successState = document.getElementById("success-state");
  successState.hidden = false;
  document.getElementById("participant-id-display").textContent = participantId;
}

function initFooterYear() {
  const el = document.getElementById("footer-year");
  if (el) el.textContent = String(new Date().getFullYear());
}

document.addEventListener("DOMContentLoaded", () => {
  initFooterYear();

  // Already submitted successfully (e.g. this is a refresh of the
  // confirmation screen) — show the result without touching Firestore.
  const existingResult = getSubmissionResult();
  if (existingResult && existingResult.participantId) {
    showSuccess(existingResult.participantId);
    return;
  }

  const draft = getParticipantDraft();
  const progress = getStudyProgress();

  if (!draft) {
    window.location.href = "entry.html";
    return;
  }
  if (!resolveArm(draft)) {
    // Mirrors the same guard as cases.js — no study condition could be
    // resolved for this institution.
    document.getElementById("submit-state").innerHTML =
      '<p class="case-blocked">We couldn\'t determine the study condition for your institution. Please contact the research team.</p>';
    return;
  }
  if (!progress || progress.currentIndex < TOTAL_QUESTIONS) {
    window.location.href = "cases.html";
    return;
  }

  const submitBtn = document.getElementById("submit-btn");
  const status = document.getElementById("submit-status");
  let submitting = false; // in-memory guard against a second click while a request is in flight

  submitBtn.addEventListener("click", async () => {
    if (submitting) return;
    submitting = true;
    submitBtn.disabled = true;
    submitBtn.setAttribute("aria-disabled", "true");
    status.textContent = "Submitting your responses…";

    try {
      const record = assembleResearchRecord(draft, progress);
      const { participantId } = await submitFinalRecord(record);

      // Only clear the working draft/progress once the write is
      // confirmed successful. The submission result itself (and its
      // idempotency key) is left in place so a refresh of this screen
      // still shows the same confirmation instead of resubmitting.
      clearAllLocalStudyState();
      showSuccess(participantId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("VERIFY-AI: final submission failed", err);
      status.textContent =
        "We couldn't complete your submission. Your responses have been kept temporarily. Please try submitting again.";
      submitBtn.disabled = false;
      submitBtn.setAttribute("aria-disabled", "false");
    } finally {
      submitting = false;
    }
  });
});
