/**
 * VERIFY-AI — researcher dashboard.
 *
 * Real-time overview: total participants, per-university and
 * per-study-condition counts, and a live "recent submissions" feed. All
 * of it is driven by one Firestore listener (see store.js) — nothing
 * here is fetched once and left to go stale; every re-render below
 * happens because subscribeToParticipants called back with fresh data.
 */
import { requireResearcher, initLogout } from "./guard.js";
import { subscribeToParticipants } from "./store.js";
import { INSTITUTION_LABELS } from "../participant/study-arm.js";
import { armLabel, escapeHtml, formatRelative, completionStatus } from "./format.js";

let previousIds = null; // null = first load (don't toast for the initial batch)
let unsubscribe = null;

function setLiveState(state) {
  const pill = document.getElementById("live-pill");
  const label = document.getElementById("live-label");
  if (!pill || !label) return;
  pill.setAttribute("data-state", state);
  label.textContent =
    state === "error" ? "Live data connection interrupted" : "Live";
}

function groupCounts(participants, key, labelMap) {
  const counts = new Map();
  participants.forEach((p) => {
    const raw = p[key];
    if (!raw) return;
    counts.set(raw, (counts.get(raw) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([value, count]) => ({
      value,
      label: (labelMap && labelMap[value]) || value,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

function renderKpis(participants) {
  const grid = document.getElementById("kpi-grid");
  const total = participants.length;
  const completeCount = participants.filter((p) => completionStatus(p) === "Complete").length;

  const universityCounts = groupCounts(participants, "university", INSTITUTION_LABELS);
  const conditionCounts = groupCounts(participants, "studyCondition", null).map((c) => ({
    ...c,
    label: armLabel(c.value),
  }));

  const cards = [
    { label: "Total participants", value: total },
    { label: "Complete", value: completeCount },
    ...universityCounts.slice(0, 3).map((u) => ({ label: u.label, value: u.count })),
    ...conditionCounts.slice(0, 3).map((c) => ({ label: c.label, value: c.count })),
  ];

  grid.innerHTML = cards
    .map(
      (c) => `
        <div class="r-kpi-card">
          <p class="r-kpi-card__label">${escapeHtml(c.label)}</p>
          <p class="r-kpi-card__value">${c.value}</p>
        </div>`
    )
    .join("");
}

function renderBreakdown(elementId, groups, total) {
  const el = document.getElementById(elementId);
  if (!groups.length) {
    el.innerHTML = `<p class="r-empty">No data yet.</p>`;
    return;
  }
  el.innerHTML = groups
    .map((g) => {
      const pct = total > 0 ? Math.round((g.count / total) * 100) : 0;
      return `
        <div class="r-breakdown__row">
          <span class="r-breakdown__label">${escapeHtml(g.label)}</span>
          <span class="r-breakdown__value">${g.count}</span>
          <div class="r-breakdown__track">
            <div class="r-breakdown__fill" style="width:${pct}%"></div>
          </div>
        </div>`;
    })
    .join("");
}

function renderBreakdowns(participants) {
  const total = participants.length;
  renderBreakdown(
    "university-breakdown",
    groupCounts(participants, "university", INSTITUTION_LABELS),
    total
  );
  renderBreakdown(
    "condition-breakdown",
    groupCounts(participants, "studyCondition", null).map((c) => ({
      ...c,
      label: armLabel(c.value),
    })),
    total
  );
}

function feedItemHtml(p, isNew) {
  const university = INSTITUTION_LABELS[p.university] || p.university || "Unknown site";
  const condition = armLabel(p.studyCondition);
  const when = (p.timestamps && p.timestamps.submittedAt) || p.createdAt;
  return `
    <li>
      <a class="r-feed__item" data-new="${isNew}" href="participant-details.html?id=${encodeURIComponent(
    p.id
  )}">
        <span class="r-feed__main">
          <span class="r-feed__id">${escapeHtml(p.participantId || p.id)}</span>
          <span class="r-feed__meta">${escapeHtml(university)} · ${escapeHtml(condition)}</span>
        </span>
        <span class="r-feed__time">${escapeHtml(formatRelative(when))}</span>
      </a>
    </li>`;
}

function renderFeed(participants, newIds) {
  const list = document.getElementById("recent-feed");
  if (!participants.length) {
    list.innerHTML = `
      <li>
        <div class="r-empty">
          <p class="r-empty__title">No participant submissions yet.</p>
          <p>New completed submissions will appear here automatically.</p>
        </div>
      </li>`;
    return;
  }
  const recent = participants.slice(0, 8);
  list.innerHTML = recent.map((p) => feedItemHtml(p, newIds.has(p.id))).join("");
}

function showToast(participant) {
  const stack = document.getElementById("toast-stack");
  if (!stack) return;
  const toast = document.createElement("div");
  toast.className = "r-toast";
  toast.innerHTML = `
    <span class="r-toast__dot" aria-hidden="true"></span>
    <span>New submission received — ${escapeHtml(participant.participantId || participant.id)}</span>
  `;
  stack.appendChild(toast);
  setTimeout(() => toast.remove(), 4200);
}

function handleData(participants) {
  setLiveState("ok");
  document.getElementById("loading-state").hidden = true;
  document.getElementById("dashboard-content").hidden = false;

  const currentIds = new Set(participants.map((p) => p.id));
  let newIds = new Set();

  if (previousIds !== null) {
    newIds = new Set([...currentIds].filter((id) => !previousIds.has(id)));
    newIds.forEach((id) => {
      const p = participants.find((x) => x.id === id);
      if (p) showToast(p);
    });
  }
  previousIds = currentIds;

  renderKpis(participants);
  renderBreakdowns(participants);
  renderFeed(participants, newIds);
}

function handleError() {
  setLiveState("error");
}

async function init() {
  const researcher = await requireResearcher();
  document.getElementById("researcher-email").textContent = researcher.email;
  initLogout();

  unsubscribe = subscribeToParticipants(handleData, handleError);
}

window.addEventListener("beforeunload", () => {
  if (unsubscribe) unsubscribe();
});

init();
