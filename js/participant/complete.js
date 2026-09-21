/**
 * VERIFY-AI — final submission page.
 *
 * Assembles the participant's complete local record (draft + case
 * responses) and hands it to submitFinalRecord (js/firebase/submission.js)
 * for the single Firestore write. This file owns the UI states around
 * that call; the write/ID-generation/idempotency logic itself lives in
 * submission.js.
 *
 * This is the only moment in the entire study where a participant's
 * session can be lost to a bad connection, so the states around the call
 * are deliberately explicit:
 *
 *   idle      "Submit".
 *   busy      The button shows a spinner and "Submitting…", and a line
 *             asks the participant not to close the page. After 6s a
 *             further hint says it's slow but their answers are safe —
 *             the failure mode being designed against is a participant
 *             on a weak connection reloading mid-write.
 *   offline   The write isn't attempted at all. The participant is told
 *             their answers are held on this device, and the status line
 *             updates itself when the connection returns.
 *   failed    Plain-language error plus a working Try again button.
 *             Local state is NOT cleared, and the retry reuses the same
 *             idempotency key — so a retry can never create a second
 *             participant record or consume a second VA ID
 *             (see submission.js).
 *   success   Participant ID shown; local draft/progress cleared.
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
  saveSubmissionResult,
  clearAllLocalStudyState,
} from "../utils/local-storage.js";
import { submitFinalRecord } from "../firebase/submission.js";
import { resolveArm } from "./study-arm.js";
import { setButtonLoading, startSlowHint, initNetworkBanner, isOffline } from "../utils/loading.js";
import {
  secondsBetween,
  assessmentStartOf,
  assessmentEndOf,
  activeSecondsOf,
  formatDuration,
} from "../utils/duration.js";

/**
 * The three session durations, computed on the participant's own device
 * at submission time and stored alongside the raw timestamps they were
 * derived from. Storing them is a convenience for the researcher views
 * and exports — js/utils/duration.js can still derive all three from the
 * raw timestamps, so nothing depends on these fields existing, and
 * records written before this change still report timing correctly.
 *
 * See js/utils/duration.js for what each duration means and why all
 * three are kept rather than a single "time taken".
 */
function computeTiming(draft, progress, submittedAt) {
  const assessmentStartedAt = assessmentStartOf(progress);
  const assessmentCompletedAt = assessmentEndOf(progress);
  const toIso = (value) => (value ? new Date(value).toISOString() : null);

  return {
    timestamps: {
      enteredAt: draft.savedAt || null,
      assessmentStartedAt: toIso(assessmentStartedAt),
      assessmentCompletedAt: toIso(assessmentCompletedAt),
      submittedAt,
    },
    durations: {
      totalSeconds: secondsBetween(draft.savedAt, submittedAt),
      assessmentSeconds: secondsBetween(assessmentStartedAt, assessmentCompletedAt),
      activeSeconds: activeSecondsOf(progress),
    },
  };
}

function assembleResearchRecord(draft, progress) {
  const {
    institution,
    savedAt,
    studyArm,
    ["consent-checkbox"]: consent,
    ...participantInformation
  } = draft;

  const submittedAt = new Date().toISOString();
  const { timestamps, durations } = computeTiming(draft, progress, submittedAt);

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
    timestamps,
    durations,
  };
}

function showSuccess(participantId, durations) {
  document.getElementById("submit-state").hidden = true;
  const successState = document.getElementById("success-state");
  successState.hidden = false;
  document.getElementById("participant-id-display").textContent = participantId;

  // A small courtesy for the participant, and a useful sanity check for
  // anyone timing a pilot session with a stopwatch.
  const timeEl = document.getElementById("completion-time");
  if (timeEl && durations && typeof durations.totalSeconds === "number") {
    timeEl.textContent = `You completed the study in ${formatDuration(durations.totalSeconds)}.`;
    timeEl.hidden = false;
  }
}

function clearError() {
  const el = document.getElementById("submit-error");
  if (el) el.remove();
}

/** Renders a plain-language failure message under the submit button. */
function showError(container, title, detail) {
  clearError();
  const el = document.createElement("div");
  el.className = "va-error";
  el.id = "submit-error";
  el.setAttribute("role", "alert");
  const strong = document.createElement("strong");
  strong.textContent = title;
  const span = document.createElement("span");
  span.textContent = detail;
  el.append(strong, span);
  container.appendChild(el);
}

/**
 * Maps a failure to something a medical student can act on. Every
 * message says explicitly that the answers are still held locally,
 * because the instinct on a failed submit is to assume the session is
 * gone and close the tab — which is the one action that would actually
 * lose it.
 */
function friendlyFailure(err) {
  const code = err && err.code ? String(err.code) : "";

  if (code === "unavailable" || code === "deadline-exceeded" || isOffline()) {
    return {
      title: "We couldn't reach the study database.",
      detail:
        "Your answers are still saved on this device and nothing has been lost. Check your internet connection, then press Try again.",
    };
  }
  if (code === "permission-denied") {
    return {
      title: "The submission was rejected by the study database.",
      detail:
        "Your answers are still saved on this device. Please contact the research team before closing this page.",
    };
  }
  return {
    title: "We couldn't complete your submission.",
    detail:
      "Your answers are still saved on this device, and retrying cannot create a duplicate record. Please press Try again.",
  };
}

function initFooterYear() {
  const el = document.getElementById("footer-year");
  if (el) el.textContent = String(new Date().getFullYear());
}

document.addEventListener("DOMContentLoaded", () => {
  initFooterYear();
  initNetworkBanner({
    offlineMessage:
      "You appear to be offline. Your answers are saved on this device — keep this page open and submit again once you're back online.",
  });

  // Already submitted successfully (e.g. this is a refresh of the
  // confirmation screen) — show the result without touching Firestore.
  const existingResult = getSubmissionResult();
  if (existingResult && existingResult.participantId) {
    showSuccess(existingResult.participantId, existingResult.durations);
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
  const actions = submitBtn.closest(".form-actions") || submitBtn.parentElement;
  let submitting = false; // in-memory guard against a second click while a request is in flight

  // If the connection returns while they're sitting on this page, say so
  // rather than leaving a stale "you're offline" error on screen.
  window.addEventListener("online", () => {
    if (submitting) return;
    clearError();
    status.textContent = "You're back online — you can submit now.";
  });

  submitBtn.addEventListener("click", async () => {
    if (submitting) return;
    clearError();

    // Don't spend a request — or the participant's patience — on a write
    // we already know cannot reach Firestore.
    if (isOffline()) {
      status.textContent = "";
      showError(
        actions,
        "You're offline.",
        "Your answers are saved on this device. Reconnect to the internet and press Submit again — nothing will be lost."
      );
      return;
    }

    submitting = true;
    setButtonLoading(submitBtn, true, "Submitting…");
    status.textContent = "Submitting your responses — please don't close this page.";

    const cancelSlowHint = startSlowHint(
      actions,
      "This is taking longer than usual. Your answers are safe on this device — please keep waiting rather than reloading the page.",
      6000
    );

    try {
      const record = assembleResearchRecord(draft, progress);
      const { participantId } = await submitFinalRecord(record);

      // Only clear the working draft/progress once the write is
      // confirmed successful. The submission result itself (and its
      // idempotency key) is left in place so a refresh of this screen
      // still shows the same confirmation instead of resubmitting.
      // Keep the durations next to the stored result so a refresh of the
      // confirmation screen can still show "you completed the study in
      // X" — the draft and progress it was derived from are about to be
      // cleared. This overwrites the {participantId} that submission.js
      // stored; the participantId itself is unchanged, so the
      // already-submitted short-circuit there still works.
      saveSubmissionResult({ participantId, durations: record.durations });
      clearAllLocalStudyState();
      cancelSlowHint();
      status.textContent = "";
      showSuccess(participantId, record.durations);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("VERIFY-AI: final submission failed", err);
      cancelSlowHint();

      const { title, detail } = friendlyFailure(err);
      status.textContent = "";
      setButtonLoading(submitBtn, false);
      // Retrying reuses the same idempotency key, so a retry after a
      // write that actually succeeded returns the original participant
      // ID instead of creating a second record (see submission.js).
      submitBtn.textContent = "Try again";
      showError(actions, title, detail);
    } finally {
      cancelSlowHint();
      submitting = false;
    }
  });
});
