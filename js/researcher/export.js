/**
 * VERIFY-AI — researcher export page.
 *
 * Uses the same real-time subscription as the other researcher pages
 * (store.js), so a downloaded CSV always reflects the latest available
 * data rather than a separately-synced copy — Firestore stays the only
 * source of truth. Filtering by university/condition happens client-side
 * over that same in-memory array before either CSV is built.
 */
import { requireResearcher, initLogout } from "./guard.js";
import { subscribeToParticipants } from "./store.js";
import { markLoaded, startSlowLoadHint, showLoadError } from "./ui.js";
import { INSTITUTION_LABELS, ARM_LABELS } from "../participant/study-arm.js";
import { buildSummaryCsv, buildResponseLevelCsv, downloadCsv } from "./csv.js";

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

function filteredParticipants() {
  const university = document.getElementById("university-filter").value;
  const condition = document.getElementById("condition-filter").value;
  return allParticipants.filter((p) => {
    if (university && p.university !== university) return false;
    if (condition && p.studyCondition !== condition) return false;
    return true;
  });
}

function updateFilteredCount() {
  const filtered = filteredParticipants();
  document.getElementById("filtered-count").textContent =
    `${filtered.length} of ${allParticipants.length} participants will be exported.`;
}

function timestampForFilename() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function initDownloadButtons() {
  document.getElementById("download-summary-btn").addEventListener("click", () => {
    const csv = buildSummaryCsv(filteredParticipants());
    downloadCsv(csv, `verify-ai_participant-summary_${timestampForFilename()}.csv`);
  });

  document.getElementById("download-responses-btn").addEventListener("click", () => {
    const csv = buildResponseLevelCsv(filteredParticipants());
    downloadCsv(csv, `verify-ai_response-level_${timestampForFilename()}.csv`);
  });
}

function handleData(participants) {
  setLiveState("ok");
  allParticipants = participants;

  hasLoadedOnce = true;
  markLoaded(loadWatchdog);
  document.getElementById("export-content").hidden = false;

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
  updateFilteredCount();
}

function handleError(error) {
  setLiveState("error");
  showLoadError(error, hasLoadedOnce, loadWatchdog);
}

async function init() {
  const researcher = await requireResearcher();
  document.getElementById("researcher-email").textContent = researcher.email;
  initLogout();
  initDownloadButtons();

  ["university-filter", "condition-filter"].forEach((id) => {
    document.getElementById(id).addEventListener("change", updateFilteredCount);
  });

  loadWatchdog = startSlowLoadHint();
  unsubscribe = subscribeToParticipants(handleData, handleError);
}

window.addEventListener("beforeunload", () => {
  if (unsubscribe) unsubscribe();
});

init();
