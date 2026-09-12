/**
 * VERIFY-AI — No-AI case runner (template).
 *
 * Renders one case at a time from CASES (js/participant/case-data.js —
 * currently placeholder content, see that file). Captures a diagnosis,
 * a confidence rating, and start/submit timestamps per case, and saves
 * all of it to localStorage as the participant progresses — never to
 * Firestore. This page is a single-page runner: moving to the next case
 * re-renders in place rather than navigating to a new URL, so there's
 * nothing to re-fetch and no per-case Firestore read/write.
 *
 * Guards:
 *   - No participant draft in localStorage → the participant hasn't
 *     completed entry/consent yet; send them back to entry.html.
 *   - Institution isn't University of Ibadan → only the No-AI arm is
 *     built so far (see README); this flow doesn't apply, so this shows
 *     a plain message rather than guessing at Standard-AI/VERIFY-AI
 *     behavior that hasn't been built or approved yet.
 *   - All cases already answered → skip straight to complete.html rather
 *     than re-showing finished cases.
 */
import { CASES } from "./case-data.js";
import { getParticipantDraft, getStudyProgress, saveStudyProgress } from "../utils/local-storage.js";

const NO_AI_INSTITUTION = "university-of-ibadan";

function getProgress() {
  return getStudyProgress() || { currentIndex: 0, responses: [] };
}

function renderBlocked(message) {
  const root = document.getElementById("case-root");
  if (!root) return;
  root.innerHTML = `<p class="case-blocked">${message}</p>`;
}

function renderCase(progress) {
  const root = document.getElementById("case-root");
  if (!root) return;

  const index = progress.currentIndex;
  const total = CASES.length;
  const currentCase = CASES[index];

  // Record when this case was first shown (only once, per case).
  if (!progress.responses[index]) {
    progress.responses[index] = { caseId: currentCase.id, startedAt: new Date().toISOString() };
    saveStudyProgress(progress);
  }

  root.innerHTML = `
    <p class="case-progress">Case ${index + 1} of ${total}</p>
    <h1 class="case-title">${currentCase.title}</h1>
    <div class="case-vignette placeholder">${currentCase.vignette}</div>

    <form id="case-form" novalidate>
      <fieldset class="field choice-fieldset" id="diagnosis-field" data-invalid="false">
        <legend>${currentCase.diagnosisPrompt}</legend>
        <div class="choice-options choice-options--stacked" role="radiogroup" aria-label="${currentCase.diagnosisPrompt}" aria-describedby="diagnosis-error">
          ${currentCase.diagnosisOptions
            .map(
              (opt) =>
                `<label class="choice-option"><input type="radio" name="diagnosis" value="${opt.id}" required /> ${opt.label}</label>`
            )
            .join("")}
        </div>
        <p class="field__error" id="diagnosis-error">Please select a diagnosis before continuing.</p>
      </fieldset>

      <fieldset class="field choice-fieldset" id="confidence-field" data-invalid="false">
        <legend>${currentCase.confidencePrompt}</legend>
        <div class="choice-options" role="radiogroup" aria-label="Confidence, 1 low to 5 high" aria-describedby="confidence-error">
          ${[1, 2, 3, 4, 5]
            .map(
              (n) =>
                `<label class="choice-option"><input type="radio" name="confidence" value="${n}" required /> ${n}</label>`
            )
            .join("")}
        </div>
        <p class="field__error" id="confidence-error">Please select a confidence rating.</p>
      </fieldset>

      <div class="form-actions">
        <button class="btn btn-primary" type="submit">
          ${index + 1 === total ? "Finish cases" : "Next case"}
        </button>
        <p class="form-status" id="case-status" role="status" aria-live="polite"></p>
      </div>
    </form>
  `;

  document.getElementById("case-form").addEventListener("submit", (event) => {
    event.preventDefault();
    handleCaseSubmit(progress, index);
  });
}

function handleCaseSubmit(progress, index) {
  const diagnosisField = document.getElementById("diagnosis-field");
  const confidenceField = document.getElementById("confidence-field");
  const status = document.getElementById("case-status");

  const diagnosisInput = document.querySelector('input[name="diagnosis"]:checked');
  const confidenceInput = document.querySelector('input[name="confidence"]:checked');

  const diagnosisValid = Boolean(diagnosisInput);
  const confidenceValid = Boolean(confidenceInput);

  diagnosisField.setAttribute("data-invalid", String(!diagnosisValid));
  confidenceField.setAttribute("data-invalid", String(!confidenceValid));

  if (!diagnosisValid || !confidenceValid) {
    status.textContent = "Please complete both fields before continuing.";
    return;
  }

  const currentCase = CASES[index];
  const selectedOption = currentCase.diagnosisOptions.find((opt) => opt.id === diagnosisInput.value);

  progress.responses[index] = {
    ...progress.responses[index],
    diagnosisOptionId: diagnosisInput.value,
    diagnosisLabel: selectedOption ? selectedOption.label : null,
    confidence: Number(confidenceInput.value),
    submittedAt: new Date().toISOString(),
  };
  progress.currentIndex = index + 1;
  saveStudyProgress(progress);

  if (progress.currentIndex >= CASES.length) {
    window.location.href = "complete.html";
  } else {
    renderCase(progress);
  }
}

function initFooterYear() {
  const el = document.getElementById("footer-year");
  if (el) el.textContent = String(new Date().getFullYear());
}

document.addEventListener("DOMContentLoaded", () => {
  initFooterYear();

  const draft = getParticipantDraft();
  if (!draft) {
    window.location.href = "entry.html";
    return;
  }

  if (draft.institution !== NO_AI_INSTITUTION) {
    renderBlocked(
      "This case flow is only implemented for the No-AI study arm so far. The flow for your institution has not been built yet — please check back once it's available."
    );
    return;
  }

  const progress = getProgress();
  if (progress.currentIndex >= CASES.length) {
    window.location.href = "complete.html";
    return;
  }

  renderCase(progress);
});
