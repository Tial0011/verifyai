/**
 * VERIFY-AI — researcher participant detail page.
 *
 * A participant document is create-once and never updated (see
 * firestore.rules — update/delete are always denied), so a single getDoc
 * read is the correct tool here rather than a listener: there is nothing
 * for a listener to ever tell us that changed. Read-only display of
 * exactly what's stored — this page renders no field it can't trace back
 * to the participant record or the approved case content, and it never
 * offers to edit anything.
 */
import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { db } from "../firebase/config.js";
import { requireResearcher, initLogout } from "./guard.js";
import { QUESTIONS, TOTAL_QUESTIONS } from "../participant/case-data.js";
import { INSTITUTION_LABELS } from "../participant/study-arm.js";
import { STEPS as VERIFY_STEPS } from "../participant/verify-workflow.js";
import {
  escapeHtml,
  armLabel,
  formatDate,
  formatTime,
  formatDateTime,
  questionTimings,
  answerMomentFor,
  formatSeconds,
  completionStatus,
} from "./format.js";

function getIdFromUrl() {
  return new URLSearchParams(window.location.search).get("id");
}

function notRecorded() {
  return `<span class="r-not-recorded">Not recorded</span>`;
}

function val(value) {
  return value === null || value === undefined || value === "" ? notRecorded() : escapeHtml(value);
}

function renderInfoGrid(p) {
  const university = INSTITUTION_LABELS[p.university] || p.university;
  const submitted = (p.timestamps && p.timestamps.submittedAt) || p.createdAt;
  const rows = [
    ["Participant ID", p.participantId || p.id],
    ["University", university],
    ["Study condition", armLabel(p.studyCondition)],
    ["Submission date", formatDate(submitted)],
    ["Submission time", formatTime(submitted)],
    ["Completion status", completionStatus(p)],
  ];
  document.getElementById("participant-info-grid").innerHTML = rows
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${val(value)}</dd></div>`)
    .join("");
}

function answerChangedLabel(response) {
  if (response.answerChangedAfterAi === null || response.answerChangedAfterAi === undefined) {
    return notRecorded();
  }
  return response.answerChangedAfterAi ? "Yes" : "No";
}

function timingBlockHtml(response) {
  const started = response.startedAt;
  const answeredAt = answerMomentFor(response);
  const completedAt = response.submittedAt;
  const { timeToInitialAnswer, totalQuestionTime } = questionTimings(response);

  return `
    <div class="r-timing-row">
      <div class="r-answer-box">
        <p class="r-answer-box__label">Started</p>
        <p class="r-answer-box__value">${started ? formatTime(started) : notRecorded()}</p>
      </div>
      <div class="r-answer-box">
        <p class="r-answer-box__label">Answer selected</p>
        <p class="r-answer-box__value">${answeredAt ? formatTime(answeredAt) : notRecorded()}</p>
      </div>
      <div class="r-answer-box">
        <p class="r-answer-box__label">Completed</p>
        <p class="r-answer-box__value">${completedAt ? formatTime(completedAt) : notRecorded()}</p>
      </div>
      <div class="r-answer-box">
        <p class="r-answer-box__label">Time to initial answer</p>
        <p class="r-answer-box__value">${formatSeconds(timeToInitialAnswer)}</p>
      </div>
      <div class="r-answer-box">
        <p class="r-answer-box__label">Total question time</p>
        <p class="r-answer-box__value">${formatSeconds(totalQuestionTime)}</p>
      </div>
    </div>`;
}

function aiBlockHtml(response) {
  if (!response.aiSuggestionShown) return "";
  const suggestion = response.aiSuggestion ? response.aiSuggestion.optionLabel : null;
  return `
    <div>
      <p class="r-subsection-title">AI information</p>
      <div class="r-answer-pair">
        <div class="r-answer-box">
          <p class="r-answer-box__label">AI recommendation</p>
          <p class="r-answer-box__value">${val(suggestion)}</p>
        </div>
        <div class="r-answer-box">
          <p class="r-answer-box__label">AI shown at</p>
          <p class="r-answer-box__value">${response.aiSuggestionShownAt ? formatTime(response.aiSuggestionShownAt) : notRecorded()}</p>
        </div>
        <div class="r-answer-box">
          <p class="r-answer-box__label">Final matches AI suggestion</p>
          <p class="r-answer-box__value">${
            response.answerMatchesAiSuggestion === null || response.answerMatchesAiSuggestion === undefined
              ? notRecorded()
              : response.answerMatchesAiSuggestion
              ? "Yes"
              : "No"
          }</p>
        </div>
      </div>
    </div>`;
}

function verifyStepDisplay(step, response, question) {
  const entry = response.verifyResponses && response.verifyResponses[step.key];
  if (!entry || (entry.value === null && !entry.note)) {
    return `
      <div class="r-verify-step">
        <p class="r-verify-step__name">${step.letter} — ${escapeHtml(step.name)}</p>
        <p class="r-verify-step__value">${notRecorded()}</p>
      </div>`;
  }

  let displayValue = entry.value;
  if (step.kind === "choice" && step.usesQuestionOptions) {
    const opt = question.options.find((o) => o.id === entry.value);
    displayValue = opt ? opt.label : entry.value;
  } else if (step.kind === "choice") {
    const opt = (step.options || []).find((o) => o.id === entry.value);
    displayValue = opt ? opt.label : entry.value;
  }

  return `
    <div class="r-verify-step">
      <p class="r-verify-step__name">${step.letter} — ${escapeHtml(step.name)}</p>
      <p class="r-verify-step__value">${val(displayValue)}</p>
      ${entry.note ? `<p class="r-verify-step__note">${escapeHtml(entry.note)}</p>` : ""}
    </div>`;
}

function verifyBlockHtml(response, question) {
  if (!response.verifyWorkflowShown) return "";
  return `
    <div>
      <p class="r-subsection-title">VERIFY-AI evaluation</p>
      <div class="r-verify-steps">
        ${VERIFY_STEPS.map((step) => verifyStepDisplay(step, response, question)).join("")}
      </div>
    </div>`;
}

function questionCardHtml(question, index, response) {
  const num = index + 1;
  if (!response) {
    return `
      <div class="r-q-card">
        <div class="r-q-card__head">
          <h3 class="r-q-card__title">Question ${num}</h3>
        </div>
        <div class="r-q-card__body">
          <p>${notRecorded()} — this question was not reached.</p>
        </div>
      </div>`;
  }

  return `
    <div class="r-q-card">
      <div class="r-q-card__head">
        <h3 class="r-q-card__title">Question ${num}</h3>
        <span class="r-badge ${response.completed ? "r-badge--good" : "r-badge--warn"}">
          ${response.completed ? "Complete" : "Incomplete"}
        </span>
      </div>
      <div class="r-q-card__body">
        <div class="r-answer-pair">
          <div class="r-answer-box">
            <p class="r-answer-box__label">${response.aiSuggestionShown ? "Initial answer" : "Participant response"}</p>
            <p class="r-answer-box__value">${val(response.initialAnswerLabel || response.finalAnswerLabel)}</p>
          </div>
          ${
            response.aiSuggestionShown
              ? `<div class="r-answer-box">
                  <p class="r-answer-box__label">Final answer</p>
                  <p class="r-answer-box__value">${val(response.finalAnswerLabel)}</p>
                </div>
                <div class="r-answer-box">
                  <p class="r-answer-box__label">Changed answer</p>
                  <p class="r-answer-box__value">${answerChangedLabel(response)}</p>
                </div>`
              : ""
          }
          <div class="r-answer-box">
            <p class="r-answer-box__label">Confidence</p>
            <p class="r-answer-box__value">${
              typeof response.confidence === "number" ? `${response.confidence} / 5` : notRecorded()
            }</p>
          </div>
        </div>

        ${timingBlockHtml(response)}
        ${aiBlockHtml(response)}
        ${verifyBlockHtml(response, question)}
      </div>
    </div>`;
}

function renderQuestions(p) {
  const responses = Array.isArray(p.studyResponses) ? p.studyResponses : [];
  const container = document.getElementById("questions-container");
  container.innerHTML = QUESTIONS.map((q, idx) => questionCardHtml(q, idx, responses[idx])).join("");
}

async function loadParticipant(id) {
  const snap = await getDoc(doc(db, "participants", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

async function init() {
  const researcher = await requireResearcher();
  document.getElementById("researcher-email").textContent = researcher.email;
  initLogout();

  const id = getIdFromUrl();
  const loadingEl = document.getElementById("loading-state");
  const notFoundEl = document.getElementById("not-found-state");
  const contentEl = document.getElementById("detail-content");

  if (!id) {
    loadingEl.hidden = true;
    notFoundEl.hidden = false;
    return;
  }

  try {
    const participant = await loadParticipant(id);
    loadingEl.hidden = true;

    if (!participant) {
      notFoundEl.hidden = false;
      return;
    }

    contentEl.hidden = false;
    document.getElementById("participant-heading").textContent =
      participant.participantId || participant.id;
    document.getElementById("participant-subheading").textContent = `${
      INSTITUTION_LABELS[participant.university] || participant.university || "Unknown site"
    } · ${armLabel(participant.studyCondition)} · ${
      participant.questionsCompleted || 0
    }/${participant.questionsTotal || TOTAL_QUESTIONS} questions completed`;

    renderInfoGrid(participant);
    renderQuestions(participant);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("VERIFY-AI: failed to load participant", err);
    loadingEl.hidden = true;
    notFoundEl.hidden = false;
  }
}

init();
