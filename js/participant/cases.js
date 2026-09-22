/**
 * VERIFY-AI — clinical assessment runner (all three study arms).
 *
 * Walks the participant through the 8 questions (one per scenario), one
 * at a time, rendering in place rather than navigating, and saving
 * progress to localStorage after every step. Nothing is written to
 * Firestore here — the single Firestore write still happens once, at
 * final submission (complete.html).
 *
 * What each arm sees (this is the core of the study design — see
 * js/participant/study-arm.js):
 *
 *   No-AI          scenario → question → answer → confidence, on one
 *                  screen. No AI suggestion is rendered, no AI markup
 *                  exists in the DOM, no AI request is made (none is made
 *                  in ANY arm — AI output is pre-generated and locked in
 *                  case-data.js).
 *
 *   Standard AI    scenario → question. The moment the participant picks
 *                  an answer, that first pick is recorded and the locked
 *                  AI suggestion appears below. They can then re-pick; the
 *                  answer they submit is their final answer. The
 *                  VERIFY-AI workflow is not rendered.
 *
 *   AI + VERIFY-AI Same as Standard AI, except the six-step VERIFY-AI
 *                  check appears together with the AI suggestion. The
 *                  final answer cannot be submitted until all six steps
 *                  are complete.
 *
 * The AI suggestion is deliberately withheld until the participant has
 * made a first pick. That pick is stored as `initialAnswerOptionId`
 * before any AI markup is rendered, and is never overwritten — later
 * re-picks only change the final answer. If the page is refreshed after
 * the reveal, the suggestion is shown again with the first pick
 * pre-selected.
 *
 * Research integrity: no correctness feedback of any kind is shown during
 * the assessment, and the answer key is not present in the client.
 */
import { QUESTIONS, TOTAL_QUESTIONS, CONFIDENCE_PROMPT } from "./case-data.js";
import { getParticipantDraft, getStudyProgress, saveStudyProgress } from "../utils/local-storage.js";
import { showOverlay, initNetworkBanner } from "../utils/loading.js";
import { resolveArm, armShowsAi, armShowsVerifyWorkflow, isValidArm } from "./study-arm.js";
import {
  renderVerifyWorkflow,
  collectAndValidate,
  independentAnswerFrom,
  STEPS,
} from "./verify-workflow.js";

let stopQuestionTimer = () => {};

function startQuestionTimer(progress, index) {
  const response = progress.responses[index];
  response.activeTimeMs = Number.isFinite(response.activeTimeMs) ? response.activeTimeMs : 0;
  let started = null;
  const checkpoint = () => {
    const response = progress.responses[index];
    const now = performance.now();
    if (started !== null) response.activeTimeMs += now - started;
    started = !document.hidden && document.hasFocus() ? now : null;
    const display = document.getElementById("question-time");
    const seconds = Math.floor(response.activeTimeMs / 1000);
    if (display) display.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    saveStudyProgress(progress);
  };
  const pause = () => {
    checkpoint();
    started = null;
  };
  checkpoint();
  const interval = window.setInterval(checkpoint, 1000);
  document.addEventListener("visibilitychange", checkpoint);
  window.addEventListener("focus", checkpoint);
  window.addEventListener("blur", pause);
  window.addEventListener("pagehide", pause);
  window.addEventListener("pageshow", checkpoint);
  stopQuestionTimer = () => {
    pause();
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", checkpoint);
    window.removeEventListener("focus", checkpoint);
    window.removeEventListener("blur", pause);
    window.removeEventListener("pagehide", pause);
    window.removeEventListener("pageshow", checkpoint);
    stopQuestionTimer = () => {};
  };
}

function saveQuestionDraft(progress, index, form) {
  progress.responses[index].draftFields = Object.fromEntries(new FormData(form));
  saveStudyProgress(progress);
}

function restoreQuestionDraft(form, response) {
  const fields = response.draftFields || {
    answer: response.finalAnswerOptionId || response.initialAnswerOptionId,
    confidence: response.confidence,
  };
  if (!response.draftFields && response.verifyResponses) {
    STEPS.forEach(({ key }) => {
      fields[`verify-${key}`] = response.verifyResponses[key]?.value;
      fields[`verify-${key}-note`] = response.verifyResponses[key]?.note;
    });
  }
  for (const control of form.elements) {
    const value = fields[control.name];
    if (value == null) continue;
    if (control.type === "radio") control.checked = control.value === String(value);
    else if (control.name) control.value = value;
  }
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
}

function getProgress(arm) {
  const stored = getStudyProgress();
  if (stored && Array.isArray(stored.responses)) {
    // Keep the arm the participant started in; never re-assign mid-study.
    if (!isValidArm(stored.studyArm)) stored.studyArm = arm;
    // Written once, on the first ever render of the assessment (below),
    // and never touched again — a refresh must not restart the clock.
    return stored;
  }
  return {
    currentIndex: 0,
    studyArm: arm,
    // When the participant first reached the assessment. Together with
    // the last question's submittedAt this gives the assessment duration
    // (see js/utils/duration.js); the wall-clock total also counts the
    // entry form and the final submission screen.
    assessmentStartedAt: new Date().toISOString(),
    responses: [],
  };
}

function renderBlocked(message) {
  const root = document.getElementById("case-root");
  if (!root) return;
  root.innerHTML = `<p class="case-blocked">${escapeHtml(message)}</p>`;
}

/**
 * The locked AI suggestion panel. Rendered ONLY for arms where
 * armShowsAi(arm) is true — for the No-AI arm this function is never
 * called and none of this markup reaches the page.
 */
function renderAiPanel(question) {
  const ai = question.aiSuggestion;
  if (!ai) return "";
  return `
    <section class="ai-panel" aria-labelledby="ai-panel-heading">
      <p class="ai-panel__tag" id="ai-panel-heading">AI suggestion</p>
      <p class="ai-panel__answer">${escapeHtml(ai.optionLabel)}</p>
      <p class="ai-panel__disclaimer">
        This is a suggestion generated by an AI system. It has not been
        selected for you, it may be wrong, and you are responsible for the
        final answer you submit.
      </p>
    </section>
  `;
}

function renderHeader(question, index) {
  return `
    <p class="case-progress">${escapeHtml(question.scenarioTitle)} · Question ${
    index + 1
  } of ${TOTAL_QUESTIONS}</p>
    <h1 class="case-title">Question ${index + 1}</h1>
    <p class="case-timer">Time on this question: <span id="question-time" role="timer" aria-live="off">0:00</span></p>
    <p class="case-timer-hint">Time pauses when you leave this question or switch away from this page.</p>
    <div class="case-vignette">${escapeHtml(question.vignette)}</div>
  `;
}

function renderAnswerFieldset(question, selectedId) {
  return `
      <fieldset class="field choice-fieldset" id="answer-field" data-invalid="false">
        <legend>${escapeHtml(question.prompt)}</legend>
        <div class="choice-options choice-options--stacked" role="radiogroup" aria-label="${escapeHtml(
          question.prompt
        )}" aria-describedby="answer-error">
          ${question.options
            .map(
              (opt) =>
                `<label class="choice-option"><input type="radio" name="answer" value="${escapeHtml(
                  opt.id
                )}"${opt.id === selectedId ? " checked" : ""} /> ${escapeHtml(opt.label)}</label>`
            )
            .join("")}
        </div>
        <p class="field__error" id="answer-error">Please select an answer before continuing.</p>
      </fieldset>
  `;
}

function renderConfidenceFieldset() {
  return `
      <fieldset class="field choice-fieldset" id="confidence-field" data-invalid="false">
        <legend>${escapeHtml(CONFIDENCE_PROMPT)}</legend>
        <div class="choice-options" role="radiogroup" aria-label="Confidence, 1 low to 5 high" aria-describedby="confidence-error">
          ${[1, 2, 3, 4, 5]
            .map(
              (n) =>
                `<label class="choice-option"><input type="radio" name="confidence" value="${n}" /> ${n}</label>`
            )
            .join("")}
        </div>
        <p class="field__error" id="confidence-error">Please select a confidence rating.</p>
      </fieldset>
  `;
}

function renderActions(index, canSubmit = true) {
  return `
      <div class="form-actions">
        ${index > 0 ? '<button class="btn btn-secondary" type="button" id="previous-question">Previous question</button>' : ""}
        <button class="btn btn-primary" type="submit" id="next-question"${canSubmit ? "" : " hidden"}>
          ${index + 1 === TOTAL_QUESTIONS ? "Finish assessment" : "Next question"}
        </button>
        <p class="form-status" id="case-status" role="status" aria-live="polite"></p>
      </div>
  `;
}

/**
 * Everything that appears only after the participant's first pick in the
 * AI arms: the locked AI suggestion, the VERIFY-AI check (VERIFY arm
 * only), the confidence rating and the submit button. None of this
 * markup is in the DOM before the first pick.
 */
function renderRevealed(question, index, showVerify) {
  return `
      ${renderAiPanel(question)}
      <p class="reveal-hint">You can change your answer above if you wish.</p>
      ${showVerify ? renderVerifyWorkflow(question) : ""}
      ${renderConfidenceFieldset()}
  `;
}

/**
 * Renders one question.
 *
 *   No-AI arm:      answer + confidence + submit, all on one screen.
 *   Standard AI /
 *   AI + VERIFY-AI: only the question and options are shown at first.
 *                   The moment the participant picks an answer, that
 *                   first pick is recorded and the AI suggestion (and,
 *                   in the VERIFY-AI arm, the six-step check) appears
 *                   below. The participant may then re-pick freely; the
 *                   answer they submit is the final answer.
 */
function renderQuestion(progress, arm) {
  stopQuestionTimer();
  const root = document.getElementById("case-root");
  if (!root) return;

  const index = progress.currentIndex;
  const question = QUESTIONS[index];
  const showAi = armShowsAi(arm);
  const showVerify = armShowsVerifyWorkflow(arm);

  // Record when this question was first shown (once per question). The
  // AI suggestion is NOT recorded as shown here — only when it is
  // actually revealed after the first pick.
  if (!progress.responses[index]) {
    progress.responses[index] = {
      scenarioId: question.scenarioId,
      questionId: question.id,
      questionIndex: index,
      studyArm: arm,
      aiSuggestionShown: false,
      aiSuggestion: null,
      verifyWorkflowShown: false,
      startedAt: new Date().toISOString(),
      aiSuggestionShownAt: null,
      completed: false,
    };
    saveStudyProgress(progress);
  }

  // If the AI was already revealed for this question (e.g. the page was
  // refreshed after the first pick), show it again straight away with the
  // first pick pre-selected. The recorded first pick is never overwritten.
  const alreadyRevealed = showAi && Boolean(progress.responses[index].initialAnswerOptionId);
  const preselected = alreadyRevealed ? progress.responses[index].initialAnswerOptionId : null;

  root.innerHTML = `
    ${renderHeader(question, index)}

    <form id="case-form" novalidate>
      ${renderAnswerFieldset(question, preselected)}

      <div class="reveal-root" id="reveal-root">
        ${
          !showAi
            ? renderConfidenceFieldset()
            : alreadyRevealed
            ? renderRevealed(question, index, showVerify)
            : ""
        }
      </div>
      ${renderActions(index, !showAi || alreadyRevealed)}
    </form>
    <nav class="question-nav" aria-label="Questions">
      ${QUESTIONS.map((_, questionIndex) => `<button type="button" class="question-nav__button" data-question-index="${questionIndex}" aria-label="Question ${questionIndex + 1}"${questionIndex === index ? ' aria-current="step"' : ""}>${questionIndex + 1}</button>`).join("")}
    </nav>
  `;

  const form = document.getElementById("case-form");
  restoreQuestionDraft(form, progress.responses[index]);
  document.getElementById("previous-question")?.addEventListener("click", () => {
    handleSubmit(progress, arm, index, index - 1);
  });
  root.querySelectorAll("[data-question-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const destination = Number(button.dataset.questionIndex);
      if (destination !== index) handleSubmit(progress, arm, index, destination);
    });
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    handleSubmit(progress, arm, index);
  });

  if (showAi && !alreadyRevealed) {
    // First pick → record it, then reveal the AI suggestion.
    form.addEventListener("change", (event) => {
      if (!event.target || event.target.name !== "answer") return;
      if (progress.responses[index].initialAnswerOptionId) return; // already revealed
      revealAi(progress, arm, index, event.target.value);
    });
  }

  form.addEventListener("input", () => saveQuestionDraft(progress, index, form));
  form.addEventListener("change", () => saveQuestionDraft(progress, index, form));
  startQuestionTimer(progress, index);

  window.scrollTo({ top: 0, behavior: "auto" });
}

/** Records the participant's first pick, then renders the AI suggestion. */
function revealAi(progress, arm, index, pickedOptionId) {
  const question = QUESTIONS[index];
  const showVerify = armShowsVerifyWorkflow(arm);
  const picked = question.options.find((opt) => opt.id === pickedOptionId);
  const now = new Date().toISOString();

  // Record the first pick BEFORE any AI markup is rendered.
  progress.responses[index] = {
    ...progress.responses[index],
    initialAnswerOptionId: pickedOptionId,
    initialAnswerLabel: picked ? picked.label : null,
    initialAnswerAt: now,
    aiSuggestionShown: true,
    aiSuggestion: {
      optionId: question.aiSuggestion.optionId,
      optionLabel: question.aiSuggestion.optionLabel,
    },
    verifyWorkflowShown: showVerify,
    aiSuggestionShownAt: now,
  };
  saveStudyProgress(progress);

  const revealRoot = document.getElementById("reveal-root");
  revealRoot.innerHTML = renderRevealed(question, index, showVerify);
  document.getElementById("next-question").hidden = false;

  const panel = revealRoot.querySelector(".ai-panel");
  if (panel) panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function goToQuestion(progress, arm, index, destination) {
  saveQuestionDraft(progress, index, document.getElementById("case-form"));
  stopQuestionTimer();
  progress.currentIndex = destination;
  saveStudyProgress(progress);
  renderQuestion(progress, arm);
}

function handleSubmit(progress, arm, index, destination = null) {
  const question = QUESTIONS[index];
  const showAi = armShowsAi(arm);
  const status = document.getElementById("case-status");
  const answerField = document.getElementById("answer-field");
  const confidenceField = document.getElementById("confidence-field");

  const answerInput = document.querySelector('input[name="answer"]:checked');
  const confidenceInput = document.querySelector('input[name="confidence"]:checked');

  // AI arms can only submit after the reveal (the submit button does not
  // exist before it); guard anyway against implicit form submission.
  if (showAi && !progress.responses[index].initialAnswerOptionId) {
    if (destination !== null) goToQuestion(progress, arm, index, destination);
    return;
  }

  const answerValid = Boolean(answerInput);
  const confidenceValid = Boolean(confidenceInput);

  answerField.setAttribute("data-invalid", String(!answerValid));
  confidenceField.setAttribute("data-invalid", String(!confidenceValid));

  // VERIFY-AI arm: the six-step check is mandatory and cannot be skipped.
  let verify = null;
  if (armShowsVerifyWorkflow(arm)) {
    verify = collectAndValidate();
    if (!verify.valid) {
      progress.responses[index].completed = false;
      if (destination !== null) {
        goToQuestion(progress, arm, index, destination);
        return;
      }
      status.textContent =
        "Please complete every step of the VERIFY-AI check before submitting your final answer.";
      const firstInvalid = document.getElementById(verify.firstInvalidId);
      if (firstInvalid) firstInvalid.scrollIntoView({ block: "center" });
      return;
    }
  }

  if (!answerValid || !confidenceValid) {
    progress.responses[index].completed = false;
    if (destination !== null) {
      goToQuestion(progress, arm, index, destination);
      return;
    }
    status.textContent = "Please complete both fields before continuing.";
    return;
  }

  const selectedOption = question.options.find((opt) => opt.id === answerInput.value);
  const aiOptionId = showAi ? question.aiSuggestion.optionId : null;
  const independentAnswer = verify ? independentAnswerFrom(verify.responses) : null;
  const initialAnswerId = progress.responses[index].initialAnswerOptionId || null;

  saveQuestionDraft(progress, index, document.getElementById("case-form"));
  stopQuestionTimer();

  progress.responses[index] = {
    ...progress.responses[index],
    finalAnswerOptionId: answerInput.value,
    finalAnswerLabel: selectedOption ? selectedOption.label : null,
    confidence: Number(confidenceInput.value),
    verifyResponses: verify ? verify.responses : null,
    independentAnswerOptionId: independentAnswer,
    // First pick (before the AI suggestion appeared) vs. final answer.
    // Null in the No-AI arm, where there is no AI to change an answer after.
    answerChangedAfterAi:
      showAi && initialAnswerId !== null ? initialAnswerId !== answerInput.value : null,
    answerMatchesAiSuggestion: aiOptionId === null ? null : aiOptionId === answerInput.value,
    submittedAt: new Date().toISOString(),
    completed: true,
  };
  const firstIncomplete = QUESTIONS.findIndex((_, i) => !progress.responses[i]?.completed);
  progress.currentIndex = destination !== null
    ? destination
    : firstIncomplete === -1
    ? TOTAL_QUESTIONS
    : index + 1 < TOTAL_QUESTIONS ? index + 1 : firstIncomplete;

  if (progress.currentIndex >= TOTAL_QUESTIONS) {
    // The moment the assessment itself ended. Recorded here rather than
    // derived later so it can't drift if a response is ever missing a
    // timestamp; duration.js still falls back to deriving it for records
    // written before this existed.
    progress.assessmentCompletedAt = new Date().toISOString();
    saveStudyProgress(progress);
    showOverlay("Preparing your submission…");
    window.location.href = "complete.html";
    return;
  }

  saveStudyProgress(progress);
  renderQuestion(progress, arm);
}

function initFooterYear() {
  const el = document.getElementById("footer-year");
  if (el) el.textContent = String(new Date().getFullYear());
}

document.addEventListener("DOMContentLoaded", () => {
  initFooterYear();

  // A participant who loses signal mid-assessment should find out now,
  // not at the submit button. Nothing is written to Firestore during the
  // assessment, so being offline here is harmless — the banner says so.
  initNetworkBanner();

  const draft = getParticipantDraft();
  if (!draft) {
    window.location.href = "entry.html";
    return;
  }

  const arm = resolveArm(draft);
  if (!arm) {
    renderBlocked(
      "We couldn't determine the study condition for your institution. Please contact the research team."
    );
    return;
  }

  const progress = getProgress(arm);

  // A session that was already in progress when timing was introduced has
  // no assessmentStartedAt. Recover it from the first question's own
  // startedAt rather than stamping "now", which would under-report the
  // duration. If there are no responses yet, now IS the start.
  if (!progress.assessmentStartedAt) {
    const firstStarted = progress.responses.find((r) => r && r.startedAt);
    progress.assessmentStartedAt = firstStarted
      ? firstStarted.startedAt
      : new Date().toISOString();
    saveStudyProgress(progress);
  }

  if (progress.currentIndex >= TOTAL_QUESTIONS) {
    showOverlay("Preparing your submission…");
    window.location.href = "complete.html";
    return;
  }

  renderQuestion(progress, progress.studyArm || arm);
});
