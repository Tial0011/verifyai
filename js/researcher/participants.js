/**
 * VERIFY-AI — researcher participants page.
 *
 * One real-time subscription (store.js) feeds an in-memory array; search
 * and filters below are pure client-side array operations over that same
 * array — no extra Firestore queries/listeners are created per filter
 * change, so this stays a single-listener page as the study grows.
 */
import { requireResearcher, initLogout } from "./guard.js";
import { subscribeToParticipants } from "./store.js";
import { markLoaded, startSlowLoadHint, showLoadError } from "./ui.js";
import { INSTITUTION_LABELS, ARM_LABELS } from "../participant/study-arm.js";
import { armLabel, escapeHtml, formatDateTime, completionStatus } from "./format.js";

let allParticipants = [];
let unsubscribe = null;
let loadWatchdog = null;
let hasLoadedOnce = false;

function setLiveState(state) {
  const pill = document.getElementById("live-pill");
  const label = document.getElementById("live-label");
  if (!pill || !label) return;
  pill.setAttribute("data-state", state);
  label.textContent = state === "error" ? "Live data connection interrupted" : "Live";
}

/** Populates a <select>'s options from the values actually present in the
 * data — never a hard-coded list, so a filter never shows an option with
 * zero matching participants. */
function populateFilterOptions(selectEl, values, labelMap) {
  const current = selectEl.value;
  const unique = Array.from(new Set(values)).sort();
  const placeholder = selectEl.querySelector('option[value=""]');
  selectEl.innerHTML = "";
  if (placeholder) selectEl.appendChild(placeholder);
  unique.forEach((value) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = (labelMap && labelMap[value]) || value;
    selectEl.appendChild(opt);
  });
  if (unique.includes(current)) selectEl.value = current;
}

function statusBadgeHtml(status) {
  const cls = status === "Complete" ? "r-badge--good" : "r-badge--warn";
  return `<span class="r-badge ${cls}">${escapeHtml(status)}</span>`;
}

function rowHtml(p) {
  const status = completionStatus(p);
  const university = INSTITUTION_LABELS[p.university] || p.university || "Unknown";
  const submitted = (p.timestamps && p.timestamps.submittedAt) || p.createdAt;
  return `
    <tr>
      <td class="r-td-id">${escapeHtml(p.participantId || p.id)}</td>
      <td>${escapeHtml(university)}</td>
      <td>${escapeHtml(armLabel(p.studyCondition))}</td>
      <td>${escapeHtml(formatDateTime(submitted))}</td>
      <td>${statusBadgeHtml(status)}</td>
      <td><a class="r-view-link" href="participant-details.html?id=${encodeURIComponent(p.id)}">View</a></td>
    </tr>`;
}

function currentFilters() {
  return {
    search: document.getElementById("search-input").value.trim().toLowerCase(),
    university: document.getElementById("university-filter").value,
    condition: document.getElementById("condition-filter").value,
    status: document.getElementById("status-filter").value,
  };
}

function applyFiltersAndRender() {
  const { search, university, condition, status } = currentFilters();

  const filtered = allParticipants.filter((p) => {
    if (search) {
      const id = String(p.participantId || p.id || "").toLowerCase();
      if (!id.includes(search)) return false;
    }
    if (university && p.university !== university) return false;
    if (condition && p.studyCondition !== condition) return false;
    if (status && completionStatus(p) !== status) return false;
    return true;
  });

  const tbody = document.getElementById("participants-tbody");
  const emptyEl = document.getElementById("empty-filtered");
  const countEl = document.getElementById("result-count");

  countEl.textContent = `${filtered.length} of ${allParticipants.length} participants`;

  if (filtered.length === 0) {
    tbody.innerHTML = "";
    emptyEl.hidden = false;
  } else {
    emptyEl.hidden = true;
    tbody.innerHTML = filtered.map(rowHtml).join("");
  }
}

function refreshFilterOptions() {
  populateFilterOptions(
    document.getElementById("university-filter"),
    allParticipants.map((p) => p.university).filter(Boolean),
    INSTITUTION_LABELS
  );
  populateFilterOptions(
    document.getElementById("condition-filter"),
    allParticipants.map((p) => p.studyCondition).filter(Boolean),
    ARM_LABELS
  );
  populateFilterOptions(
    document.getElementById("status-filter"),
    allParticipants.map((p) => completionStatus(p)),
    null
  );
}

function handleData(participants) {
  setLiveState("ok");
  allParticipants = participants;

  hasLoadedOnce = true;
  markLoaded(loadWatchdog);
  document.getElementById("participants-panel").hidden = false;

  refreshFilterOptions();
  applyFiltersAndRender();
}

function handleError(error) {
  setLiveState("error");
  showLoadError(error, hasLoadedOnce, loadWatchdog);
}

function initControls() {
  ["search-input", "university-filter", "condition-filter", "status-filter"].forEach((id) => {
    document.getElementById(id).addEventListener("input", applyFiltersAndRender);
    document.getElementById(id).addEventListener("change", applyFiltersAndRender);
  });
}

async function init() {
  const researcher = await requireResearcher();
  document.getElementById("researcher-email").textContent = researcher.email;
  initLogout();
  initControls();

  loadWatchdog = startSlowLoadHint();
  unsubscribe = subscribeToParticipants(handleData, handleError);
}

window.addEventListener("beforeunload", () => {
  if (unsubscribe) unsubscribe();
});

init();
