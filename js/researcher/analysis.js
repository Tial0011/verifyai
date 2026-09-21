/**
 * VERIFY-AI — descriptive analysis dashboard.
 *
 * This page is intentionally separate from the existing researcher
 * dashboard. It reads the same real-time participants listener and never
 * writes to Firestore.
 *
 * All numbers are descriptive summaries only. No inferential tests,
 * rankings, clinical judgments, or causal claims are generated here.
 */
import { requireResearcher, initLogout } from "./guard.js";
import { subscribeToParticipants } from "./store.js";
import {
  escapeHtml,
  armLabel,
  formatDuration,
  completionStatus,
  deriveDurations,
  median,
} from "./format.js";
import { INSTITUTION_LABELS, ARMS } from "../participant/study-arm.js";
import { QUESTIONS } from "../participant/case-data.js";
import { secondsBetween } from "../utils/duration.js";

const ARM_ORDER = [ARMS.NO_AI, ARMS.STANDARD_AI, ARMS.VERIFY_AI];
const ARM_COLORS = {
  [ARMS.NO_AI]: "teal",
  [ARMS.STANDARD_AI]: "violet",
  [ARMS.VERIFY_AI]: "orange",
};

const VERIFY_STEPS = [
  ["validate", "Validate"],
  ["examine", "Examine"],
  ["review", "Review"],
  ["independentlyCompare", "Independently compare"],
  ["flag", "Flag"],
  ["yield", "Yield"],
];

let allParticipants = [];
let unsubscribe = null;
let loadWatchdog = null;
let hasLoadedOnce = false;
let timingMetric = "assessment";

const $ = (id) => document.getElementById(id);

function setLiveState(state) {
  const pill = $("analysis-live-pill");
  const label = $("analysis-live-label");
  if (!pill || !label) return;
  pill.dataset.state = state;
  label.textContent = state === "error" ? "Connection interrupted" : "Live";
}

function showLoadError(error) {
  if (loadWatchdog) clearTimeout(loadWatchdog);
  const el = $("loading-state");
  if (!el) return;
  const code = error?.code || "";
  const detail =
    code === "permission-denied"
      ? "Your researcher account does not currently have access to participant data."
      : "The study database could not be reached. Check your connection and try again.";

  el.classList.add("r-loading--error");
  el.setAttribute("role", "alert");
  el.innerHTML = `
    <span>
      <strong>Unable to load analysis data.</strong>
      <span>${escapeHtml(detail)}</span>
      <button type="button" class="r-retry-btn" id="analysis-retry">Retry</button>
    </span>`;
  $("analysis-retry")?.addEventListener("click", () => window.location.reload());
}

function startWatchdog() {
  return setTimeout(() => {
    if (hasLoadedOnce) return;
    showLoadError({ code: "network-timeout" });
  }, 15000);
}

function dateOf(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function responseList(p) {
  return Array.isArray(p?.studyResponses)
    ? p.studyResponses
    : Array.isArray(p?.responses)
      ? p.responses
      : [];
}

function completedResponses(p) {
  return responseList(p).filter((r) => r && r.completed);
}

function conditionGroups(participants) {
  const map = new Map(ARM_ORDER.map((arm) => [arm, 0]));
  participants.forEach((p) => {
    if (map.has(p.studyCondition)) map.set(p.studyCondition, map.get(p.studyCondition) + 1);
  });
  return ARM_ORDER.map((arm) => ({
    key: arm,
    label: armLabel(arm),
    count: map.get(arm) || 0,
  })).filter((g) => g.count > 0);
}

function universityGroups(participants) {
  const map = new Map();
  participants.forEach((p) => {
    const key = p.university || "unknown";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return [...map.entries()]
    .map(([key, count]) => ({
      key,
      label: INSTITUTION_LABELS[key] || key,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

function percent(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function average(values) {
  const nums = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function medianDuration(participants, field) {
  return median(
    participants
      .filter((p) => completionStatus(p) === "Complete")
      .map((p) => deriveDurations(p)[field])
  );
}

function renderKpis(participants) {
  const total = participants.length;
  const completed = participants.filter((p) => completionStatus(p) === "Complete").length;
  const completionRate = percent(completed, total);
  const medianAssessment = medianDuration(participants, "assessmentSeconds");
  const medianActive = medianDuration(participants, "activeSeconds");

  $("analysis-kpis").innerHTML = [
    ["Participants", total, "Filtered dataset"],
    ["Completed", completed, `${completionRate}% completion`],
    ["Median assessment", medianAssessment == null ? "—" : formatDuration(medianAssessment), "Completed sessions"],
    ["Median active time", medianActive == null ? "—" : formatDuration(medianActive), "Question time only"],
    ["Universities", universityGroups(participants).length, "Sites represented"],
    ["AI responses", aiResponseCount(participants), "Recorded AI-exposed responses"],
  ].map(([label, value, meta], i) => `
    <article class="r-analysis-kpi r-analysis-kpi--${i % 5}">
      <p>${escapeHtml(label)}</p>
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(meta)}</span>
    </article>
  `).join("");
}

function aiResponseCount(participants) {
  return participants.reduce(
    (sum, p) => sum + responseList(p).filter((r) => r?.aiSuggestionShown).length,
    0
  );
}

function renderBars(elementId, groups, options = {}) {
  const el = $(elementId);
  if (!el) return;
  if (!groups.length) {
    el.innerHTML = `<div class="r-analysis-no-data">No usable data for this view.</div>`;
    return;
  }

  const max = Math.max(...groups.map((g) => Number(g.value) || 0), 1);
  const unit = options.unit || "";
  el.innerHTML = groups.map((g) => {
    const value = Number(g.value) || 0;
    const width = Math.max(2, (value / max) * 100);
    const color = g.color || "teal";
    const display = options.format ? options.format(value) : `${value}${unit}`;
    const sub = g.sub ? `<span class="r-analysis-bar__sub">${escapeHtml(g.sub)}</span>` : "";
    return `
      <button class="r-analysis-bar" type="button" title="${escapeHtml(`${g.label}: ${display}`)}">
        <span class="r-analysis-bar__top">
          <span class="r-analysis-bar__label">${escapeHtml(g.label)}</span>
          <strong>${escapeHtml(display)}</strong>
        </span>
        <span class="r-analysis-bar__track">
          <span class="r-analysis-bar__fill r-analysis-bar__fill--${color}" style="width:${width}%"></span>
        </span>
        ${sub}
      </button>`;
  }).join("");
}

function renderArmChart(participants) {
  const groups = conditionGroups(participants).map((g) => ({
    ...g,
    value: g.count,
    color: ARM_COLORS[g.key],
    sub: `${percent(g.count, participants.length)}% of filtered participants`,
  }));
  renderBars("arm-chart", groups);
  $("arm-total-caption").textContent = `${participants.length} participant${participants.length === 1 ? "" : "s"}`;
}

function renderUniversityChart(participants) {
  renderBars(
    "university-chart",
    universityGroups(participants).map((g, i) => ({
      ...g,
      value: g.count,
      color: ["teal", "violet", "orange"][i % 3],
      sub: `${percent(g.count, participants.length)}% of filtered participants`,
    }))
  );
}

function renderCompletionChart(participants) {
  const groups = conditionGroups(participants).map((g) => {
    const rows = participants.filter((p) => p.studyCondition === g.key);
    const complete = rows.filter((p) => completionStatus(p) === "Complete").length;
    return {
      label: g.label,
      value: percent(complete, rows.length),
      color: ARM_COLORS[g.key],
      sub: `${complete}/${rows.length} complete`,
    };
  });
  renderBars("completion-chart", groups, { unit: "%" });
}

function renderConfidenceChart(participants) {
  const groups = conditionGroups(participants).map((g) => {
    const values = participants
      .filter((p) => p.studyCondition === g.key)
      .flatMap((p) => responseList(p).map((r) => r?.confidence))
      .filter((v) => typeof v === "number" && v >= 1 && v <= 5);
    return {
      label: g.label,
      value: average(values) ?? 0,
      color: ARM_COLORS[g.key],
      sub: `${values.length} ratings`,
    };
  }).filter((g) => g.value > 0);

  renderBars("confidence-chart", groups, {
    format: (v) => `${v.toFixed(2)} / 5`,
  });
}

function timingValues(participants, metric) {
  const field = {
    assessment: "assessmentSeconds",
    active: "activeSeconds",
    total: "totalSeconds",
  }[metric];

  return conditionGroups(participants).map((g) => {
    const rows = participants.filter((p) => p.studyCondition === g.key);
    return {
      label: g.label,
      value: medianDuration(rows, field) || 0,
      color: ARM_COLORS[g.key],
      sub: `${rows.filter((p) => deriveDurations(p)[field] != null).length} usable sessions`,
    };
  }).filter((g) => g.value > 0);
}

function renderTimingChart(participants) {
  const labels = {
    assessment: "assessment time",
    active: "active question time",
    total: "total session time",
  };
  const values = timingValues(participants, timingMetric);
  renderBars("timing-chart", values, { format: (v) => formatDuration(v) });
  $("timing-footnote").textContent =
    `Median ${labels[timingMetric]} among completed sessions.`;
}

function aiMetrics(participants) {
  const aiRows = participants
    .flatMap((p) => responseList(p).map((r) => ({ p, r })))
    .filter(({ r }) => r?.aiSuggestionShown);

  const changed = aiRows.filter(({ r }) => r.answerChangedAfterAi === true).length;
  const unchanged = aiRows.filter(({ r }) => r.answerChangedAfterAi === false).length;
  const matched = aiRows.filter(({ r }) => r.answerMatchesAiSuggestion === true).length;
  const notMatched = aiRows.filter(({ r }) => r.answerMatchesAiSuggestion === false).length;

  return { aiRows, changed, unchanged, matched, notMatched };
}

function renderAiCharts(participants) {
  const m = aiMetrics(participants);
  const aiTotal = m.aiRows.length;

  $("ai-change-summary").innerHTML = aiTotal
    ? `<strong>${percent(m.changed, aiTotal)}%</strong><span>${m.changed} of ${aiTotal} AI-exposed responses changed their initial answer.</span>`
    : `<strong>—</strong><span>No AI-exposed responses in the current filter.</span>`;

  $("ai-match-summary").innerHTML = aiTotal
    ? `<strong>${percent(m.matched, aiTotal)}%</strong><span>${m.matched} of ${aiTotal} final answers matched the shown AI suggestion.</span>`
    : `<strong>—</strong><span>No AI-exposed responses in the current filter.</span>`;

  renderBars("ai-change-chart", [
    { label: "Changed", value: percent(m.changed, aiTotal), color: "orange", sub: `${m.changed} responses` },
    { label: "Not changed", value: percent(m.unchanged, aiTotal), color: "teal", sub: `${m.unchanged} responses` },
  ], { unit: "%" });

  renderBars("ai-match-chart", [
    { label: "Matched AI", value: percent(m.matched, aiTotal), color: "violet", sub: `${m.matched} responses` },
    { label: "Did not match", value: percent(m.notMatched, aiTotal), color: "teal", sub: `${m.notMatched} responses` },
  ], { unit: "%" });
}

function responseTimingForCase(participants, questionIndex) {
  const values = participants
    .flatMap((p) => responseList(p)[questionIndex] ? [responseList(p)[questionIndex]] : [])
    .map((r) => secondsBetween(r.startedAt, r.submittedAt))
    .filter((v) => v != null);
  return median(values);
}

function renderCaseTimeChart(participants) {
  const groups = QUESTIONS.map((q, i) => ({
    label: `Q${i + 1}`,
    value: responseTimingForCase(participants, i) || 0,
    color: ["teal", "violet", "orange"][i % 3],
    sub: q.id,
  })).filter((g) => g.value > 0);
  renderBars("case-time-chart", groups, { format: (v) => formatDuration(v) });
}

function renderCoverageChart(participants) {
  const groups = QUESTIONS.map((q, i) => {
    const completed = participants.filter((p) => responseList(p)[i]?.completed).length;
    return {
      label: `Q${i + 1}`,
      value: percent(completed, participants.length),
      color: ["teal", "violet", "orange"][i % 3],
      sub: `${completed}/${participants.length} completed`,
    };
  });
  renderBars("coverage-chart", groups, { unit: "%" });
}

function renderVerifyChart(participants) {
  const rows = participants
    .flatMap((p) => responseList(p))
    .filter((r) => r?.verifyWorkflowShown);

  const groups = VERIFY_STEPS.map(([key, label], i) => {
    const recorded = rows.filter((r) => {
      const entry = r.verifyResponses?.[key];
      return entry && entry.value !== null && entry.value !== undefined && entry.value !== "";
    }).length;
    return {
      label,
      value: percent(recorded, rows.length),
      color: ["teal", "violet", "orange", "teal", "violet", "orange"][i],
      sub: `${recorded}/${rows.length} recorded`,
    };
  });

  renderBars("verify-chart", groups, { unit: "%" });
}

function renderAll() {
  const university = $("filter-university").value;
  const arm = $("filter-arm").value;

  const filtered = allParticipants.filter((p) => {
    const universityMatch = university === "all" || p.university === university;
    const armMatch = arm === "all" || p.studyCondition === arm;
    return universityMatch && armMatch;
  });

  $("filter-count").textContent = `${filtered.length} participant${filtered.length === 1 ? "" : "s"}`;
  $("analysis-empty").hidden = filtered.length !== 0;
  $("analysis-content").hidden = filtered.length === 0;

  if (!filtered.length) return;

  renderKpis(filtered);
  renderArmChart(filtered);
  renderUniversityChart(filtered);
  renderCompletionChart(filtered);
  renderConfidenceChart(filtered);
  renderTimingChart(filtered);
  renderAiCharts(filtered);
  renderCaseTimeChart(filtered);
  renderVerifyChart(filtered);
  renderCoverageChart(filtered);

  $("analysis-updated").textContent =
    `Updated ${new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date())}`;
}

function populateFilters(participants) {
  const universitySelect = $("filter-university");
  const armSelect = $("filter-arm");
  const currentUniversity = universitySelect.value;
  const currentArm = armSelect.value;

  const universities = universityGroups(participants);
  universitySelect.innerHTML =
    `<option value="all">All universities</option>` +
    universities.map((g) => `<option value="${escapeHtml(g.key)}">${escapeHtml(g.label)}</option>`).join("");

  armSelect.innerHTML =
    `<option value="all">All conditions</option>` +
    conditionGroups(participants).map((g) => `<option value="${escapeHtml(g.key)}">${escapeHtml(g.label)}</option>`).join("");

  if ([...universitySelect.options].some((o) => o.value === currentUniversity)) {
    universitySelect.value = currentUniversity;
  }
  if ([...armSelect.options].some((o) => o.value === currentArm)) {
    armSelect.value = currentArm;
  }
}

function handleData(participants) {
  if (loadWatchdog) clearTimeout(loadWatchdog);
  hasLoadedOnce = true;
  $("loading-state").hidden = true;
  $("analysis-content").hidden = false;
  setLiveState("ok");
  allParticipants = participants;
  populateFilters(participants);
  renderAll();
}

function handleError(error) {
  setLiveState("error");
  if (!hasLoadedOnce) showLoadError(error);
}

function bindEvents() {
  $("filter-university").addEventListener("change", renderAll);
  $("filter-arm").addEventListener("change", renderAll);

  $("reset-filters").addEventListener("click", () => {
    $("filter-university").value = "all";
    $("filter-arm").value = "all";
    renderAll();
  });

  document.querySelectorAll("[data-time-metric]").forEach((button) => {
    button.addEventListener("click", () => {
      timingMetric = button.dataset.timeMetric;
      document.querySelectorAll("[data-time-metric]").forEach((b) => b.classList.remove("is-active"));
      button.classList.add("is-active");
      renderTimingChart(allParticipantsFiltered());
    });
  });
}

function allParticipantsFiltered() {
  const university = $("filter-university").value;
  const arm = $("filter-arm").value;
  return allParticipants.filter((p) =>
    (university === "all" || p.university === university) &&
    (arm === "all" || p.studyCondition === arm)
  );
}

async function init() {
  const researcher = await requireResearcher();
  $("researcher-email").textContent = researcher.email;
  initLogout();
  bindEvents();
  loadWatchdog = startWatchdog();
  unsubscribe = subscribeToParticipants(handleData, handleError);
}

window.addEventListener("beforeunload", () => {
  if (unsubscribe) unsubscribe();
});

init();
