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

function chartHost(elementId) {
  const el = $(elementId);
  if (!el) return null;
  el.classList.add("r-analysis-chart-host");
  return el;
}

function chartEmpty(el) {
  el.innerHTML = `<div class="r-analysis-no-data">No usable data for this view.</div>`;
}

function chartLabel(label, maxChars) {
  const text = String(label ?? "");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

function renderBars(elementId, groups, options = {}) {
  const el = chartHost(elementId);
  if (!el) return;
  if (!groups.length) {
    chartEmpty(el);
    return;
  }

  const max = options.max ?? Math.max(...groups.map((g) => Number(g.value) || 0), 1);
  const unit = options.unit || "";
  const format = options.format || ((v) => `${v}${unit}`);
  // Size the SVG to the actual card width so charts stay readable on phones.
  // The viewBox remains vector-based, so labels do not become tiny desktop-scaled text.
  const availableWidth = el.clientWidth || 760;
  const width = Math.max(300, Math.min(760, availableWidth - 4));
  const rowH = width < 430 ? 58 : 64;
  const left = width < 430 ? 132 : 178;
  const right = width < 430 ? 62 : 92;
  const chartW = Math.max(90, width - left - right);
  const height = Math.max(150, groups.length * rowH + 24);

  el.innerHTML = `
    <div class="r-svg-chart-wrap">
      <svg class="r-svg-chart r-svg-bars" viewBox="0 0 ${width} ${height}" role="img"
        aria-label="${escapeHtml(options.ariaLabel || "Bar chart")}">
        ${groups.map((g, i) => {
          const value = Number(g.value) || 0;
          const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
          const y = 18 + i * rowH;
          const displayLabel = chartLabel(g.label, width < 430 ? 21 : 30);
          const barW = Math.max(value > 0 ? 6 : 0, ratio * chartW);
          const color = g.color || "teal";
          return `
            <g class="r-bar-group" tabindex="0" role="button"
              data-chart-label="${escapeHtml(g.label)}"
              data-chart-value="${escapeHtml(format(value))}"
              data-chart-sub="${escapeHtml(g.sub || "")}">
              <text x="${left - 14}" y="${y + 15}" text-anchor="end" class="r-svg-label">${escapeHtml(displayLabel)}</text>
              <rect x="${left}" y="${y}" width="${chartW}" height="18" rx="9" class="r-svg-track"></rect>
              <rect x="${left}" y="${y}" width="${barW}" height="18" rx="9" class="r-svg-fill r-svg-fill--${color}">
                <title>${escapeHtml(g.label)}: ${escapeHtml(format(value))}</title>
              </rect>
              <text x="${left + chartW + 12}" y="${y + 15}" class="r-svg-value">${escapeHtml(format(value))}</text>
            </g>`;
        }).join("")}
      </svg>
    </div>
    <div class="r-chart-interaction" aria-live="polite">
      <span>Select a bar</span>
      <strong>Details appear here</strong>
    </div>`;

  const interaction = el.querySelector(".r-chart-interaction");
  el.querySelectorAll(".r-bar-group").forEach((group) => {
    const select = () => {
      el.querySelectorAll(".r-bar-group.is-selected").forEach((g) => g.classList.remove("is-selected"));
      group.classList.add("is-selected");
      const label = group.dataset.chartLabel || "";
      const value = group.dataset.chartValue || "";
      const sub = group.dataset.chartSub || "";
      interaction.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${sub ? `<em>${escapeHtml(sub)}</em>` : ""}`;
    };
    group.addEventListener("click", select);
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    });
  });
}

function renderDonut(elementId, groups, options = {}) {
  const el = chartHost(elementId);
  if (!el) return;
  if (!groups.length) {
    chartEmpty(el);
    return;
  }

  const total = groups.reduce((sum, g) => sum + Math.max(0, Number(g.value) || 0), 0);
  if (!total) {
    chartEmpty(el);
    return;
  }

  const stops = [];
  let cursor = 0;
  groups.forEach((g, i) => {
    const value = Math.max(0, Number(g.value) || 0);
    const start = (cursor / total) * 360;
    cursor += value;
    const end = (cursor / total) * 360;
    stops.push(`var(--chart-${g.color || ["teal","violet","orange"][i % 3]}) ${start}deg ${end}deg`);
  });

  const center = options.centerLabel || total;
  el.innerHTML = `
    <div class="r-donut-layout">
      <button type="button" class="r-donut" aria-label="${escapeHtml(options.ariaLabel || "Circular chart")}"
        style="background:conic-gradient(${stops.join(", ")});">
        <span class="r-donut__inner">
          <strong>${escapeHtml(String(center))}</strong>
          <small>${escapeHtml(options.centerSub || "total")}</small>
        </span>
      </button>
      <div class="r-donut-legend">
        ${groups.map((g, i) => {
          const value = Math.max(0, Number(g.value) || 0);
          const pct = percent(value, total);
          return `
            <button type="button" class="r-donut-legend__item" data-index="${i}">
              <span class="r-donut-legend__dot r-donut-legend__dot--${g.color || ["teal","violet","orange"][i % 3]}"></span>
              <span class="r-donut-legend__text"><strong>${escapeHtml(g.label)}</strong><small>${escapeHtml(formatChartValue(g, value))} · ${pct}%</small></span>
            </button>`;
        }).join("")}
      </div>
    </div>
    <div class="r-chart-interaction" aria-live="polite">
      <span>Click a segment or label</span>
      <strong>${escapeHtml(groups[0].label)}</strong>
      <em>${escapeHtml(formatChartValue(groups[0], Number(groups[0].value) || 0))} · ${percent(Number(groups[0].value) || 0, total)}%</em>
    </div>`;

  const update = (index) => {
    const g = groups[index];
    const value = Number(g.value) || 0;
    el.querySelectorAll(".r-donut-legend__item.is-selected").forEach((x) => x.classList.remove("is-selected"));
    el.querySelector(`.r-donut-legend__item[data-index="${index}"]`)?.classList.add("is-selected");
    const interaction = el.querySelector(".r-chart-interaction");
    interaction.innerHTML = `<span>${escapeHtml(g.label)}</span><strong>${escapeHtml(formatChartValue(g, value))}</strong><em>${percent(value, total)}% of ${total}</em>`;
  };

  el.querySelectorAll(".r-donut-legend__item").forEach((item) => {
    item.addEventListener("click", () => update(Number(item.dataset.index)));
  });
  el.querySelector(".r-donut")?.addEventListener("click", () => {
    const selected = el.querySelector(".r-donut-legend__item.is-selected");
    update(selected ? Number(selected.dataset.index) : 0);
  });
}

function formatChartValue(group, value) {
  if (typeof group.display === "string") return group.display;
  if (typeof group.format === "function") return group.format(value);
  return `${value}${group.unit || ""}`;
}

function renderLine(elementId, groups, options = {}) {
  const el = chartHost(elementId);
  if (!el) return;
  if (!groups.length) {
    chartEmpty(el);
    return;
  }

  // Keep the case-time chart genuinely responsive instead of forcing
  // a 760px canvas that becomes unreadable when squeezed onto a phone.
  const availableWidth = el.clientWidth || 760;
  const width = Math.max(300, Math.min(760, availableWidth - 4));
  const height = width < 430 ? 250 : 300;
  const left = width < 430 ? 38 : 52;
  const right = width < 430 ? 14 : 24;
  const top = 20;
  const bottom = width < 430 ? 58 : 52;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const max = options.max ?? Math.max(...groups.map((g) => Number(g.value) || 0), 1);
  const min = options.min ?? 0;
  const range = Math.max(1, max - min);
  const points = groups.map((g, i) => {
    const x = groups.length === 1 ? left + plotW / 2 : left + (i / (groups.length - 1)) * plotW;
    const value = Number(g.value) || 0;
    const y = top + plotH - ((value - min) / range) * plotH;
    return { ...g, x, y, value };
  });
  const path = points.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");

  el.innerHTML = `
    <div class="r-svg-chart-wrap">
      <svg class="r-svg-chart r-svg-line" viewBox="0 0 ${width} ${height}" role="img"
        aria-label="${escapeHtml(options.ariaLabel || "Line chart")}">
        <line x1="${left}" y1="${top + plotH}" x2="${left + plotW}" y2="${top + plotH}" class="r-svg-axis"></line>
        <line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotH}" class="r-svg-axis"></line>
        <line x1="${left}" y1="${top + plotH / 2}" x2="${left + plotW}" y2="${top + plotH / 2}" class="r-svg-grid"></line>
        <path d="${path}" class="r-svg-line-path"></path>
        ${points.map((p, i) => `
          <g class="r-line-point" tabindex="0" role="button"
             data-label="${escapeHtml(p.label)}" data-value="${escapeHtml(options.format ? options.format(p.value) : String(p.value))}" data-sub="${escapeHtml(p.sub || "")}">
            <circle cx="${p.x}" cy="${p.y}" r="6"></circle>
            <text x="${p.x}" y="${height - 24}" text-anchor="middle" class="r-svg-label">${escapeHtml(p.label)}</text>
            <title>${escapeHtml(p.label)}: ${escapeHtml(options.format ? options.format(p.value) : String(p.value))}</title>
          </g>`).join("")}
      </svg>
    </div>
    <div class="r-chart-interaction" aria-live="polite">
      <span>Select a point</span>
      <strong>Case timing</strong>
      <em>${escapeHtml(options.format ? options.format(points[0].value) : String(points[0].value))}</em>
    </div>`;

  const interaction = el.querySelector(".r-chart-interaction");
  el.querySelectorAll(".r-line-point").forEach((point) => {
    const select = () => {
      el.querySelectorAll(".r-line-point.is-selected").forEach((p) => p.classList.remove("is-selected"));
      point.classList.add("is-selected");
      interaction.innerHTML = `<span>${escapeHtml(point.dataset.label || "")}</span><strong>${escapeHtml(point.dataset.value || "")}</strong>${point.dataset.sub ? `<em>${escapeHtml(point.dataset.sub)}</em>` : ""}`;
    };
    point.addEventListener("click", select);
    point.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    });
  });
}

function renderArmChart(participants) {
  const groups = conditionGroups(participants).map((g) => ({
    ...g,
    value: g.count,
    color: ARM_COLORS[g.key],
    sub: `${percent(g.count, participants.length)}% of filtered participants`,
  }));
  renderDonut("arm-chart", groups, { centerSub: "participants", ariaLabel: "Participants by study condition" });
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
  renderBars("completion-chart", groups, { unit: "%", max: 100 });
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
    max: 5,
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

  renderDonut("ai-change-chart", [
    { label: "Changed", value: percent(m.changed, aiTotal), color: "orange", sub: `${m.changed} responses` },
    { label: "Not changed", value: percent(m.unchanged, aiTotal), color: "teal", sub: `${m.unchanged} responses` },
  ], { centerSub: "AI responses", ariaLabel: "Response changes after AI" });

  renderDonut("ai-match-chart", [
    { label: "Matched AI", value: percent(m.matched, aiTotal), color: "violet", sub: `${m.matched} responses` },
    { label: "Did not match", value: percent(m.notMatched, aiTotal), color: "teal", sub: `${m.notMatched} responses` },
  ], { centerSub: "AI responses", ariaLabel: "Final answers compared with AI suggestions" });
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
  renderLine("case-time-chart", groups, { format: (v) => formatDuration(v), ariaLabel: "Median time spent on each case" });
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

  renderBars("verify-chart", groups, { unit: "%", max: 100 });
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

// Rebuild the SVGs when the viewport changes (rotation, split-screen, etc.).
// This keeps labels and chart proportions readable instead of relying on
// horizontal scrolling on small screens.
let resizeTimer = null;
window.addEventListener("resize", () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (allParticipants.length) renderAll();
  }, 120);
});

init();
