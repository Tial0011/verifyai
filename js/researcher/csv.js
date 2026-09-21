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

/* --------------------------------------------------------------------
   The field catalogue — what a researcher can choose to export
   --------------------------------------------------------------------

   Every exportable field is declared once, here, and both exports plus
   the export page's field picker are generated from it. Adding a field
   to the study means adding one entry below; the picker, the header row
   and the column counts all follow automatically.

   Each entry carries:
     key       the column name (and, for per-question fields, the suffix
               after the q1_ … q8_ prefix)
     label     how the field is named to the researcher in the picker
     section   the picker heading it appears under
     group     "core" | "ai" | "verify" — which arms can populate it.
               "ai"/"verify" fields are hidden when no participant in the
               selection is in that arm (see columnPlan).
     locked    true for fields that cannot be deselected, because a file
               without them can't be matched back to a participant.

   ORDER MATTERS: the arrays below are the column order of the exported
   files. Deselecting fields never reorders the remaining ones.
   -------------------------------------------------------------------- */

/** Fields with one value per participant — the Participant Summary's
 * leading columns. */
export const SUMMARY_PARTICIPANT_FIELDS = [
  { key: "participant_id", label: "Participant ID", section: "Identification", group: "core", locked: true },
  { key: "university", label: "University", section: "Identification", group: "core" },
  { key: "study_condition", label: "Study condition", section: "Identification", group: "core" },
  { key: "submission_date", label: "Submission date", section: "Submission", group: "core" },
  { key: "submission_timestamp", label: "Submission timestamp", section: "Submission", group: "core" },
  { key: "completion_status", label: "Completion status", section: "Submission", group: "core" },
  { key: "entered_at", label: "Entered study at", section: "Session timing", group: "core" },
  { key: "assessment_started_at", label: "Assessment started at", section: "Session timing", group: "core" },
  { key: "assessment_completed_at", label: "Assessment completed at", section: "Session timing", group: "core" },
  { key: "total_duration_seconds", label: "Total time (seconds)", section: "Session timing", group: "core" },
  { key: "total_duration_minutes", label: "Total time (minutes)", section: "Session timing", group: "core" },
  { key: "total_duration_display", label: "Total time (readable, e.g. 6m 12s)", section: "Session timing", group: "core" },
  { key: "assessment_duration_seconds", label: "Assessment time (seconds)", section: "Session timing", group: "core" },
  { key: "assessment_duration_minutes", label: "Assessment time (minutes)", section: "Session timing", group: "core" },
  { key: "active_question_time_seconds", label: "Active time on questions (seconds)", section: "Session timing", group: "core" },
];

/** Fields with one value per question. In the Participant Summary each
 * becomes eight columns (q1_… to q8_…); in the Response-Level dataset
 * each is a single column, since a row IS one question. Shared between
 * the two exports so the picker means the same thing in both. */
export const QUESTION_FIELDS = [
  { key: "initial_response", label: "Initial response (before AI shown)", section: "Responses", group: "ai" },
  { key: "final_response", label: "Final response", section: "Responses", group: "core" },
  { key: "answer_changed", label: "Answer changed after AI", section: "Responses", group: "ai" },
  { key: "confidence", label: "Confidence (1–5)", section: "Responses", group: "core" },
  { key: "started_at", label: "Question started at", section: "Question timing", group: "core" },
  { key: "answered_at", label: "Answer selected at", section: "Question timing", group: "core" },
  { key: "completed_at", label: "Question completed at", section: "Question timing", group: "core" },
  { key: "time_to_initial_answer_seconds", label: "Time to initial answer (seconds)", section: "Question timing", group: "ai" },
  { key: "total_question_time_seconds", label: "Total question time (seconds)", section: "Question timing", group: "core" },
  { key: "ai_shown", label: "AI suggestion shown", section: "AI", group: "ai" },
  { key: "ai_suggestion", label: "AI suggestion", section: "AI", group: "ai" },
  { key: "answer_matches_ai", label: "Final answer matches AI", section: "AI", group: "ai" },
  // One entry per VERIFY-AI step, in the order the participant completes
  // them. Two of the six steps ask for a free-text note as well; that
  // note column sits immediately after its own step rather than being
  // grouped at the end, which is both the existing column order and the
  // order a researcher reads them in.
  ...VERIFY_STEPS.flatMap((step) => {
    const field = {
      key: `verify_${verifyColumnSuffix(step.key)}`,
      label: `${step.letter} — ${step.name}`,
      section: "VERIFY-AI",
      group: "verify",
    };
    if (!step.note) return [field];
    return [
      field,
      {
        key: `verify_${verifyColumnSuffix(step.key)}_note`,
        label: `${step.letter} — ${step.name} (free-text note)`,
        section: "VERIFY-AI",
        group: "verify",
        // The summary export has never carried the free-text notes —
        // eight of them per participant would swamp the row, and they
        // are read one at a time anyway.
        responseLevelOnly: true,
      },
    ];
  }),
];

/** Participant-level fields carried on every Response-Level row. */
export const RESPONSE_PARTICIPANT_FIELDS = [
  { key: "participant_id", label: "Participant ID", section: "Identification", group: "core", locked: true },
  { key: "university", label: "University", section: "Identification", group: "core" },
  { key: "study_condition", label: "Study condition", section: "Identification", group: "core" },
  // Carried on every row so a per-response model can control for how
  // long the participant took overall without a join back to the
  // summary file.
  { key: "participant_total_duration_seconds", label: "Participant total time (seconds)", section: "Session timing", group: "core" },
  { key: "participant_assessment_duration_seconds", label: "Participant assessment time (seconds)", section: "Session timing", group: "core" },
  { key: "question_number", label: "Question number", section: "Question identification", group: "core", locked: true },
  { key: "question_id", label: "Question ID", section: "Question identification", group: "core" },
  { key: "scenario_id", label: "Scenario ID", section: "Question identification", group: "core" },
];

/**
 * Whether a field's arm group is populated by the current selection.
 * A locked field is always kept — the file has to stay identifiable.
 */
function fieldApplies(field, plan) {
  if (field.group === "ai") return plan.includeAi;
  if (field.group === "verify") return plan.includeVerify;
  return true;
}

/** Whether the researcher has switched this field off in the picker. */
function fieldExcluded(field, excluded) {
  return !field.locked && excluded.has(field.key);
}

function includedFields(fields, plan, excluded) {
  return fields.filter((f) => fieldApplies(f, plan) && !fieldExcluded(f, excluded));
}

/** Normalizes the excludedFields option into a Set. */
function excludedSet(options) {
  return new Set(Array.isArray(options.excludedFields) ? options.excludedFields : []);
}

/**
 * The full picker model for one export: its sections, each field, and
 * whether that field is currently applicable and currently selected.
 * The export page renders straight from this, so what the researcher
 * sees can never drift from what the builders produce.
 *
 * @param {"summary"|"responseLevel"} kind
 */
export function fieldCatalogue(kind, plan, options = {}) {
  const excluded = excludedSet(options);
  const fields =
    kind === "responseLevel"
      ? [...RESPONSE_PARTICIPANT_FIELDS, ...QUESTION_FIELDS]
      : [
          ...SUMMARY_PARTICIPANT_FIELDS,
          ...QUESTION_FIELDS.filter((f) => !f.responseLevelOnly),
        ];

  const sections = new Map();
  fields.forEach((field) => {
    if (!fieldApplies(field, plan)) return; // not populated by this selection
    if (!sections.has(field.section)) sections.set(field.section, []);
    sections.get(field.section).push({
      ...field,
      selected: !fieldExcluded(field, excluded),
      // Per-question fields become 8 columns each in the summary export.
      columnsEach: kind === "summary" && QUESTION_FIELDS.includes(field) ? TOTAL_QUESTIONS : 1,
    });
  });

  return Array.from(sections.entries()).map(([title, items]) => ({ title, fields: items }));
}

/* --------------------------------------------------------------------
   Export 1 — Participant Summary (one participant per row)
   -------------------------------------------------------------------- */

/**
 * The Participant Summary header row for a given column plan. Kept
 * separate from the row building so the export page can show an accurate
 * column count and preview before the download, using the exact same
 * logic that produces the file.
 */
export function summaryHeaders(plan, options = {}) {
  const excluded = excludedSet(options);

  const headers = includedFields(SUMMARY_PARTICIPANT_FIELDS, plan, excluded).map((f) => f.key);

  const perQuestion = includedFields(
    QUESTION_FIELDS.filter((f) => !f.responseLevelOnly),
    plan,
    excluded
  );

  for (let i = 1; i <= TOTAL_QUESTIONS; i += 1) {
    perQuestion.forEach((field) => headers.push(`q${i}_${field.key}`));
  }

  return headers;
}

export function buildSummaryCsv(participants, options = {}) {
  const plan = columnPlan(participants, options);
  const headers = summaryHeaders(plan, options);

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
export function responseLevelHeaders(plan, options = {}) {
  const excluded = excludedSet(options);
  return [
    ...includedFields(RESPONSE_PARTICIPANT_FIELDS, plan, excluded).map((f) => f.key),
    ...includedFields(QUESTION_FIELDS, plan, excluded).map((f) => f.key),
  ];
}

export function buildResponseLevelCsv(participants, options = {}) {
  const plan = columnPlan(participants, options);
  const headers = responseLevelHeaders(plan, options);

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
    summaryColumns: summaryHeaders(plan, options).length,
    responseLevelColumns: responseLevelHeaders(plan, options).length,
    excludedFields: Array.isArray(options.excludedFields) ? options.excludedFields.length : 0,
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
