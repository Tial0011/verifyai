/**
 * VERIFY-AI — analysis-friendly CSV export.
 *
 * Two datasets (see researcher/export.html):
 *   1. Participant Summary   — ONE ROW PER PARTICIPANT.
 *   2. Response-Level Dataset — ONE ROW PER QUESTION RESPONSE.
 *
 * Design rules followed here:
 *   - snake_case headers throughout, one consistent naming convention
 *     (q1_total_question_time_seconds, never Q1Time / q1Time / Q1_Time).
 *   - Raw timestamps (started_at, answered_at, completed_at) are exported
 *     as-is (ISO 8601) alongside the derived time_to_initial_answer_seconds
 *     and total_question_time_seconds columns — nothing here overwrites a
 *     raw timestamp with a calculated value. The derivations live in
 *     format.js#questionTimings and js/utils/duration.js.
 *   - A missing value is always an empty CSV field, never a fabricated
 *     one and never the string "undefined"/"null".
 *   - Every field is CSV-escaped (RFC 4180-style): wrapped in quotes and
 *     internal quotes doubled whenever the value contains a comma, quote,
 *     or newline, so free-text VERIFY-AI answers can never break columns.
 *   - UTF-8 output with a BOM, so accented characters open correctly in
 *     Excel as well as Google Sheets / LibreOffice.
 *
 * ---------------------------------------------------------------------
 * COLUMN RELEVANCE (the `applicableColumnsOnly` option)
 * ---------------------------------------------------------------------
 * The three arms do not produce the same variables. A No-AI participant
 * never sees an AI suggestion and never completes a VERIFY-AI check, so
 * every AI and VERIFY column is structurally blank for them — not
 * "missing data", but "not applicable by design". Exporting a No-AI-only
 * selection with all 8 questions' AI and VERIFY columns attached gives a
 * researcher a file that is mostly empty space, and one that a stats
 * package will read as a wall of missing values needing explanation.
 *
 * So by default the builders look at which arms are actually present in
 * the rows being exported and include only the column groups those arms
 * can populate:
 *
 *   always          identifiers, site, condition, submission timing,
 *                   completion status, session durations, per-question
 *                   final response / confidence / raw timestamps /
 *                   total question time
 *   AI group        included when at least one AI arm (Standard AI or
 *                   AI + VERIFY-AI) is in the selection:
 *                   initial_response, answer_changed, ai_shown,
 *                   ai_suggestion, answer_matches_ai, and
 *                   time_to_initial_answer_seconds
 *   VERIFY group    included when at least one AI + VERIFY-AI
 *                   participant is in the selection: all verify_* columns
 *
 * Two notes on that AI group. `initial_response` and `answer_changed`
 * only exist because an AI suggestion interrupted the participant
 * between their first pick and their final answer, so they belong with
 * the AI columns rather than the core ones. And
 * `time_to_initial_answer_seconds` is, for a No-AI participant, the same
 * number as `total_question_time_seconds` by definition (there is no AI
 * reveal to split the question in two) — so in a No-AI-only export it
 * would be a duplicate column, and it is dropped with the rest of the
 * group.
 *
 * Exporting with no condition filter, or with the option turned off,
 * gives the full column set exactly as before — so the "filter to No-AI,
 * get the No-AI fields; export everything, get everything" behaviour
 * falls out of the selection itself. Which arms a file was built for is
 * always recoverable from its own study_condition column, and the export
 * page states the plan before the download.
 *
 * The rule is deterministic: it depends on the study design (which arms
 * are present), never on whether a particular participant happened to
 * leave a field blank. Two exports of the same selection always have
 * identical columns.
 */
import { QUESTIONS, TOTAL_QUESTIONS } from "../participant/case-data.js";
import {
  INSTITUTION_LABELS,
  armShowsAi,
  armShowsVerifyWorkflow,
  normalizeArm,
} from "../participant/study-arm.js";
import { STEPS as VERIFY_STEPS } from "../participant/verify-workflow.js";
import { toDate, questionTimings, answerMomentFor, completionStatus } from "./format.js";
import { deriveDurations, formatDuration, toMinutes } from "../utils/duration.js";

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

/** answered_at: raw timestamp of the answer moment — first pick for AI arms,
 * submission for No-AI (see format.js#answerMomentFor). Blank, never a
 * substitute, if the relevant raw timestamp wasn't recorded. */
function answeredAtFor(response) {
  return answerMomentFor(response);
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

/** verify_<step> column suffix, keeping the snake_case convention. */
function verifyColumnSuffix(stepKey) {
  return stepKey === "independentlyCompare" ? "independently_compare" : stepKey;
}

/* --------------------------------------------------------------------
   Which column groups apply to a given set of participants
   -------------------------------------------------------------------- */

/**
 * Inspects the participants actually being exported and reports which
 * optional column groups they can populate.
 *
 * @param {object[]} participants
 * @param {{applicableColumnsOnly?: boolean}} [options] — when
 *   applicableColumnsOnly is false, every group is included regardless
 *   of which arms are present (the pre-existing behaviour).
 */
export function columnPlan(participants, options = {}) {
  const applicableOnly = options.applicableColumnsOnly !== false;

  const arms = Array.from(
    new Set((participants || []).map((p) => normalizeArm(p.studyCondition)).filter(Boolean))
  );

  const includeAi = !applicableOnly || arms.some(armShowsAi);
  const includeVerify = !applicableOnly || arms.some(armShowsVerifyWorkflow);

  const omitted = [];
  if (!includeAi) omitted.push("AI");
  if (!includeVerify) omitted.push("VERIFY-AI");

  return { arms, includeAi, includeVerify, omitted, applicableOnly };
}

/* --------------------------------------------------------------------
   Session-duration columns (shared by both exports)
   -------------------------------------------------------------------- */

/**
 * How long the participant took. Three durations are exported rather
 * than one — see js/utils/duration.js for what separates them. Each is
 * given in raw seconds (for analysis), in minutes to one decimal place
 * (for convenience), and total_duration_display as a readable "6m 12s"
 * so the file is legible without a formula.
 */
function durationColumns(participant) {
  const { totalSeconds, assessmentSeconds, activeSeconds } = deriveDurations(participant);
  const ts = participant.timestamps || {};

  return {
    entered_at: isoOrBlank(ts.enteredAt),
    assessment_started_at: isoOrBlank(ts.assessmentStartedAt),
    assessment_completed_at: isoOrBlank(ts.assessmentCompletedAt),
    total_duration_seconds: totalSeconds ?? "",
    total_duration_minutes: totalSeconds === null ? "" : toMinutes(totalSeconds),
    total_duration_display: totalSeconds === null ? "" : formatDuration(totalSeconds),
    assessment_duration_seconds: assessmentSeconds ?? "",
    assessment_duration_minutes: assessmentSeconds === null ? "" : toMinutes(assessmentSeconds),
    active_question_time_seconds: activeSeconds ?? "",
  };
}

const DURATION_HEADERS = [
  "entered_at",
  "assessment_started_at",
  "assessment_completed_at",
  "total_duration_seconds",
  "total_duration_minutes",
  "total_duration_display",
  "assessment_duration_seconds",
  "assessment_duration_minutes",
  "active_question_time_seconds",
];

/* --------------------------------------------------------------------
   Export 1 — Participant Summary (one participant per row)
   -------------------------------------------------------------------- */

/**
 * The Participant Summary header row for a given column plan. Kept
 * separate from the row building so the export page can show an accurate
 * column count and preview before the download, using the exact same
 * logic that produces the file.
 */
export function summaryHeaders(plan) {
  const headers = [
    "participant_id",
    "university",
    "study_condition",
    "submission_date",
    "submission_timestamp",
    "completion_status",
    ...DURATION_HEADERS,
  ];

  for (let i = 1; i <= TOTAL_QUESTIONS; i += 1) {
    if (plan.includeAi) headers.push(`q${i}_initial_response`);
    headers.push(`q${i}_final_response`);
    if (plan.includeAi) headers.push(`q${i}_answer_changed`);
    headers.push(`q${i}_confidence`, `q${i}_started_at`, `q${i}_answered_at`, `q${i}_completed_at`);
    // Identical to total_question_time in a No-AI-only export (see the
    // file header), so it travels with the AI group.
    if (plan.includeAi) headers.push(`q${i}_time_to_initial_answer_seconds`);
    headers.push(`q${i}_total_question_time_seconds`);

    if (plan.includeAi) {
      headers.push(`q${i}_ai_shown`, `q${i}_ai_suggestion`, `q${i}_answer_matches_ai`);
    }
    if (plan.includeVerify) {
      VERIFY_STEPS.forEach((step) => {
        headers.push(`q${i}_verify_${verifyColumnSuffix(step.key)}`);
      });
    }
  }

  return headers;
}

export function buildSummaryCsv(participants, options = {}) {
  const plan = columnPlan(participants, options);
  const headers = summaryHeaders(plan);

  const rows = participants.map((p) => {
    const row = {
      participant_id: p.participantId || p.id || "",
      university: universityLabel(p),
      study_condition: p.studyCondition || "",
      submission_date: isoOrBlank(p.timestamps && p.timestamps.submittedAt).slice(0, 10),
      submission_timestamp: isoOrBlank(p.timestamps && p.timestamps.submittedAt),
      completion_status: completionStatus(p),
      ...durationColumns(p),
    };

    QUESTIONS.forEach((q, idx) => {
      const i = idx + 1;
      const r = responseFor(p, idx);
      const timing = questionTimings(r);

      row[`q${i}_final_response`] = r ? r.finalAnswerLabel || "" : "";
      row[`q${i}_confidence`] = r && typeof r.confidence === "number" ? r.confidence : "";
      row[`q${i}_started_at`] = r ? isoOrBlank(r.startedAt) : "";
      row[`q${i}_answered_at`] = r ? isoOrBlank(answeredAtFor(r)) : "";
      row[`q${i}_completed_at`] = r ? isoOrBlank(r.submittedAt) : "";
      row[`q${i}_total_question_time_seconds`] = timing.totalQuestionTime ?? "";

      if (plan.includeAi) {
        row[`q${i}_initial_response`] = r ? r.initialAnswerLabel || "" : "";
        row[`q${i}_answer_changed`] = r ? yesNo(r.answerChangedAfterAi) : "";
        row[`q${i}_time_to_initial_answer_seconds`] = timing.timeToInitialAnswer ?? "";
        row[`q${i}_ai_shown`] = r ? yesNo(Boolean(r.aiSuggestionShown)) : "";
        row[`q${i}_ai_suggestion`] = r && r.aiSuggestion ? r.aiSuggestion.optionLabel || "" : "";
        row[`q${i}_answer_matches_ai`] = r ? yesNo(r.answerMatchesAiSuggestion) : "";
      }

      if (plan.includeVerify) {
        VERIFY_STEPS.forEach((step) => {
          row[`q${i}_verify_${verifyColumnSuffix(step.key)}`] = r
            ? verifyStepValue(r, step.key)
            : "";
        });
      }
    });

    return row;
  });

  return toCsv(headers, rows);
}

/* --------------------------------------------------------------------
   Export 2 — Response-Level Dataset (one row per question response)
   -------------------------------------------------------------------- */

/** The Response-Level header row for a given column plan. */
export function responseLevelHeaders(plan) {
  return [
    "participant_id",
    "university",
    "study_condition",
    // Carried on every row so a per-response model can control for how
    // long the participant took overall without a separate join back to
    // the summary file.
    "participant_total_duration_seconds",
    "participant_assessment_duration_seconds",
    "question_number",
    "question_id",
    "scenario_id",
    ...(plan.includeAi ? ["initial_response"] : []),
    "final_response",
    ...(plan.includeAi ? ["answer_changed"] : []),
    "confidence",
    "started_at",
    "answered_at",
    "completed_at",
    ...(plan.includeAi ? ["time_to_initial_answer_seconds"] : []),
    "total_question_time_seconds",
    ...(plan.includeAi ? ["ai_shown", "ai_suggestion", "answer_matches_ai"] : []),
    ...(plan.includeVerify
      ? [
          "verify_validate",
          "verify_examine",
          "verify_review",
          "verify_review_note",
          "verify_independently_compare",
          "verify_flag",
          "verify_flag_note",
          "verify_yield",
        ]
      : []),
  ];
}

export function buildResponseLevelCsv(participants, options = {}) {
  const plan = columnPlan(participants, options);
  const headers = responseLevelHeaders(plan);

  const rows = [];

  participants.forEach((p) => {
    const durations = deriveDurations(p);

    QUESTIONS.forEach((q, idx) => {
      const r = responseFor(p, idx);
      const timing = questionTimings(r);

      const row = {
        participant_id: p.participantId || p.id || "",
        university: universityLabel(p),
        study_condition: p.studyCondition || "",
        participant_total_duration_seconds: durations.totalSeconds ?? "",
        participant_assessment_duration_seconds: durations.assessmentSeconds ?? "",
        question_number: idx + 1,
        question_id: q.id,
        scenario_id: q.scenarioId,
        final_response: r ? r.finalAnswerLabel || "" : "",
        confidence: r && typeof r.confidence === "number" ? r.confidence : "",
        started_at: r ? isoOrBlank(r.startedAt) : "",
        answered_at: r ? isoOrBlank(answeredAtFor(r)) : "",
        completed_at: r ? isoOrBlank(r.submittedAt) : "",
        total_question_time_seconds: timing.totalQuestionTime ?? "",
      };

      if (plan.includeAi) {
        row.initial_response = r ? r.initialAnswerLabel || "" : "";
        row.answer_changed = r ? yesNo(r.answerChangedAfterAi) : "";
        row.time_to_initial_answer_seconds = timing.timeToInitialAnswer ?? "";
        row.ai_shown = r ? yesNo(Boolean(r.aiSuggestionShown)) : "";
        row.ai_suggestion = r && r.aiSuggestion ? r.aiSuggestion.optionLabel || "" : "";
        row.answer_matches_ai = r ? yesNo(r.answerMatchesAiSuggestion) : "";
      }

      if (plan.includeVerify) {
        row.verify_validate = r ? verifyStepValue(r, "validate") : "";
        row.verify_examine = r ? verifyStepValue(r, "examine") : "";
        row.verify_review = r ? verifyStepValue(r, "review") : "";
        row.verify_review_note = r ? verifyStepNote(r, "review") : "";
        row.verify_independently_compare = r ? verifyStepValue(r, "independentlyCompare") : "";
        row.verify_flag = r ? verifyStepValue(r, "flag") : "";
        row.verify_flag_note = r ? verifyStepNote(r, "flag") : "";
        row.verify_yield = r ? verifyStepValue(r, "yield") : "";
      }

      rows.push(row);
    });
  });

  return toCsv(headers, rows);
}

/**
 * What a download with the current selection and options will actually
 * contain: which arms, which optional column groups, and how many
 * columns each file will have. Derived from the same header functions
 * the builders use, so the figures shown on the export page can never
 * drift from the files produced.
 */
export function describeExport(participants, options = {}) {
  const plan = columnPlan(participants, options);
  return {
    ...plan,
    summaryColumns: summaryHeaders(plan).length,
    responseLevelColumns: responseLevelHeaders(plan).length,
  };
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
