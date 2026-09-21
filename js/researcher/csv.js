/**
 * VERIFY-AI — analysis-friendly CSV export.
 *
 * Two datasets (see researcher/export.html):
 *   1. Participant Summary   — ONE ROW PER PARTICIPANT.
 *   2. Response-Level Dataset — ONE ROW PER QUESTION RESPONSE.
 *
 * Design rules followed here:
 *   - snake_case headers throughout, one consistent naming convention
 *     (q1_time_taken_seconds, never Q1Time / q1Time / Q1_Time).
 *   - Raw timestamps are exported as-is (ISO 8601 / whatever Firestore
 *     gave us) alongside a derived *_time_taken_seconds column — nothing
 *     here overwrites a raw timestamp with a calculated value.
 *   - A missing value is always an empty CSV field, never a fabricated
 *     one and never the string "undefined"/"null".
 *   - Every field is CSV-escaped (RFC 4126-style): wrapped in quotes and
 *     internal quotes doubled whenever the value contains a comma, quote,
 *     or newline, so free-text VERIFY-AI answers can never break columns.
 *   - UTF-8 output with a BOM, so accented characters open correctly in
 *     Excel as well as Google Sheets / LibreOffice.
 */
import { QUESTIONS, TOTAL_QUESTIONS } from "../participant/case-data.js";
import { INSTITUTION_LABELS } from "../participant/study-arm.js";
import { STEPS as VERIFY_STEPS } from "../participant/verify-workflow.js";
import { toDate, secondsBetween, completionStatus } from "./format.js";

function csvField(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(headers, rows) {
  const lines = [headers.map(csvField).join(",")];
  rows.forEach((row) => {
    lines.push(headers.map((h) => csvField(row[h])).join(","));
  });
  // \uFEFF (UTF-8 BOM) so Excel doesn't mis-render non-ASCII text.
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

function isoOrBlank(value) {
  const d = toDate(value);
  return d ? d.toISOString() : "";
}

function universityLabel(participant) {
  return INSTITUTION_LABELS[participant.university] || participant.university || "";
}

function responseFor(participant, questionIndex) {
  const responses = Array.isArray(participant.studyResponses) ? participant.studyResponses : [];
  return responses[questionIndex] || null;
}

/** answered_at: the moment a value was actually locked in — the first
 * pick when an AI suggestion exists (that's the meaningful "answer
 * selected" moment for AI arms), otherwise the final submission itself. */
function answeredAtFor(response) {
  if (!response) return null;
  return response.initialAnswerAt || response.submittedAt || null;
}

function verifyStepValue(response, stepKey) {
  const entry = response && response.verifyResponses && response.verifyResponses[stepKey];
  return entry ? entry.value : "";
}

function verifyStepNote(response, stepKey) {
  const entry = response && response.verifyResponses && response.verifyResponses[stepKey];
  return entry ? entry.note : "";
}

function yesNo(value) {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "";
}

/* --------------------------------------------------------------------
   Export 1 — Participant Summary (one participant per row)
   -------------------------------------------------------------------- */

export function buildSummaryCsv(participants) {
  const baseHeaders = [
    "participant_id",
    "university",
    "study_condition",
    "submission_date",
    "submission_timestamp",
    "completion_status",
  ];

  const perQuestionHeaders = [];
  for (let i = 1; i <= TOTAL_QUESTIONS; i += 1) {
    perQuestionHeaders.push(
      `q${i}_initial_response`,
      `q${i}_final_response`,
      `q${i}_answer_changed`,
      `q${i}_confidence`,
      `q${i}_started_at`,
      `q${i}_answered_at`,
      `q${i}_completed_at`,
      `q${i}_time_taken_seconds`,
      `q${i}_ai_shown`,
      `q${i}_ai_suggestion`,
      `q${i}_answer_matches_ai`,
      `q${i}_verify_validate`,
      `q${i}_verify_examine`,
      `q${i}_verify_review`,
      `q${i}_verify_independently_compare`,
      `q${i}_verify_flag`,
      `q${i}_verify_yield`
    );
  }

  const headers = [...baseHeaders, ...perQuestionHeaders];

  const rows = participants.map((p) => {
    const row = {
      participant_id: p.participantId || p.id || "",
      university: universityLabel(p),
      study_condition: p.studyCondition || "",
      submission_date: isoOrBlank(p.timestamps && p.timestamps.submittedAt).slice(0, 10),
      submission_timestamp: isoOrBlank(p.timestamps && p.timestamps.submittedAt),
      completion_status: completionStatus(p),
    };

    QUESTIONS.forEach((q, idx) => {
      const i = idx + 1;
      const r = responseFor(p, idx);
      row[`q${i}_initial_response`] = r ? r.initialAnswerLabel || "" : "";
      row[`q${i}_final_response`] = r ? r.finalAnswerLabel || "" : "";
      row[`q${i}_answer_changed`] = r ? yesNo(r.answerChangedAfterAi) : "";
      row[`q${i}_confidence`] = r && typeof r.confidence === "number" ? r.confidence : "";
      row[`q${i}_started_at`] = r ? isoOrBlank(r.startedAt) : "";
      row[`q${i}_answered_at`] = r ? isoOrBlank(answeredAtFor(r)) : "";
      row[`q${i}_completed_at`] = r ? isoOrBlank(r.submittedAt) : "";
      row[`q${i}_time_taken_seconds`] = r ? secondsBetween(r.startedAt, r.submittedAt) ?? "" : "";
      row[`q${i}_ai_shown`] = r ? yesNo(Boolean(r.aiSuggestionShown)) : "";
      row[`q${i}_ai_suggestion`] = r && r.aiSuggestion ? r.aiSuggestion.optionLabel || "" : "";
      row[`q${i}_answer_matches_ai`] = r ? yesNo(r.answerMatchesAiSuggestion) : "";
      VERIFY_STEPS.forEach((step) => {
        const col = `q${i}_verify_${
          step.key === "independentlyCompare" ? "independently_compare" : step.key
        }`;
        row[col] = r ? verifyStepValue(r, step.key) : "";
      });
    });

    return row;
  });

  return toCsv(headers, rows);
}

/* --------------------------------------------------------------------
   Export 2 — Response-Level Dataset (one row per question response)
   -------------------------------------------------------------------- */

export function buildResponseLevelCsv(participants) {
  const headers = [
    "participant_id",
    "university",
    "study_condition",
    "question_number",
    "question_id",
    "scenario_id",
    "initial_response",
    "final_response",
    "answer_changed",
    "confidence",
    "started_at",
    "answered_at",
    "completed_at",
    "time_taken_seconds",
    "ai_shown",
    "ai_suggestion",
    "answer_matches_ai",
    "verify_validate",
    "verify_examine",
    "verify_review",
    "verify_review_note",
    "verify_independently_compare",
    "verify_flag",
    "verify_flag_note",
    "verify_yield",
  ];

  const rows = [];

  participants.forEach((p) => {
    QUESTIONS.forEach((q, idx) => {
      const r = responseFor(p, idx);
      rows.push({
        participant_id: p.participantId || p.id || "",
        university: universityLabel(p),
        study_condition: p.studyCondition || "",
        question_number: idx + 1,
        question_id: q.id,
        scenario_id: q.scenarioId,
        initial_response: r ? r.initialAnswerLabel || "" : "",
        final_response: r ? r.finalAnswerLabel || "" : "",
        answer_changed: r ? yesNo(r.answerChangedAfterAi) : "",
        confidence: r && typeof r.confidence === "number" ? r.confidence : "",
        started_at: r ? isoOrBlank(r.startedAt) : "",
        answered_at: r ? isoOrBlank(answeredAtFor(r)) : "",
        completed_at: r ? isoOrBlank(r.submittedAt) : "",
        time_taken_seconds: r ? secondsBetween(r.startedAt, r.submittedAt) ?? "" : "",
        ai_shown: r ? yesNo(Boolean(r.aiSuggestionShown)) : "",
        ai_suggestion: r && r.aiSuggestion ? r.aiSuggestion.optionLabel || "" : "",
        answer_matches_ai: r ? yesNo(r.answerMatchesAiSuggestion) : "",
        verify_validate: r ? verifyStepValue(r, "validate") : "",
        verify_examine: r ? verifyStepValue(r, "examine") : "",
        verify_review: r ? verifyStepValue(r, "review") : "",
        verify_review_note: r ? verifyStepNote(r, "review") : "",
        verify_independently_compare: r ? verifyStepValue(r, "independentlyCompare") : "",
        verify_flag: r ? verifyStepValue(r, "flag") : "",
        verify_flag_note: r ? verifyStepNote(r, "flag") : "",
        verify_yield: r ? verifyStepValue(r, "yield") : "",
      });
    });
  });

  return toCsv(headers, rows);
}

/** Triggers a browser download of a CSV string. */
export function downloadCsv(csvString, filename) {
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
