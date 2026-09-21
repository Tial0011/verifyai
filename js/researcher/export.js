/**
 * VERIFY-AI — researcher export page.
 *
 * Uses the same real-time subscription as the other researcher pages
 * (store.js), so a downloaded CSV always reflects the latest available
 * data rather than a separately-synced copy — Firestore stays the only
 * source of truth. Filtering by university/condition happens client-side
 * over that same in-memory array before either CSV is built.
 *
 * This page also decides WHICH COLUMNS the download gets. The three arms
 * don't produce the same variables — a No-AI participant has no AI
 * suggestion and no VERIFY-AI steps — so filtering the selection to a
 * single arm and exporting shouldn't hand back a file padded with
 * columns that are blank by design. csv.js#columnPlan works that out
 * from the arms present in the filtered rows; this file's job is to show
 * the researcher what they're about to get, before they click, so the
 * column set is never a surprise when the file opens.
 */
import { requireResearcher, initLogout } from "./guard.js";
import { subscribeToParticipants } from "./store.js";
import { markLoaded, startSlowLoadHint, showLoadError } from "./ui.js";
import { INSTITUTION_LABELS, ARM_LABELS } from "../participant/study-arm.js";
import { buildSummaryCsv, buildResponseLevelCsv, downloadCsv, describeExport } from "./csv.js";
import { setButtonLoading, withMinimumDelay } from "../utils/loading.js";
import { armLabel } from "./format.js";

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

/** Current export options, read straight from the controls. */
function currentOptions() {
  const checkbox = document.getElementById("applicable-columns-only");
  return { applicableColumnsOnly: checkbox ? checkbox.checked : true };
}

/**
 * Restates the current selection and the resulting column plan in plain
 * language. The point is that a researcher who filters to No-AI and
 * downloads should already know the AI and VERIFY-AI columns won't be in
 * the file — and, equally, that clearing the filter brings them back.
 */
function updateSelectionSummary() {
  const filtered = filteredParticipants();
  const plan = describeExport(filtered, currentOptions());

  document.getElementById("filtered-count").textContent =
    `${filtered.length} of ${allParticipants.length} participants will be exported.`;

  const planEl = document.getElementById("column-plan");
  if (!planEl) return;

  if (filtered.length === 0) {
    planEl.textContent = "No participants match these filters, so there is nothing to export.";
    return;
  }

  const armNames = plan.arms.map((a) => armLabel(a)).join(", ") || "Unknown";
  const parts = [`Conditions in this selection: ${armNames}.`];

  if (plan.omitted.length > 0) {
    parts.push(
      `${plan.omitted.join(" and ")} columns will be left out, because no participant in this selection has data for them.`
    );
  } else if (!plan.applicableOnly) {
    parts.push("Every column will be included, including ones that will be blank for some arms.");
  } else {
    parts.push("All column groups apply to this selection, so every column is included.");
  }

  parts.push(
    `Summary: ${plan.summaryColumns} columns. Response-level: ${plan.responseLevelColumns} columns.`
  );

  planEl.textContent = parts.join(" ");
}

function timestampForFilename() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

/**
 * A filename that says what's inside. A folder holding three separate
 * single-arm exports is otherwise three files distinguishable only by
 * their timestamps.
 */
function filenameFor(kind) {
  const condition = document.getElementById("condition-filter").value;
  const university = document.getElementById("university-filter").value;
  const scope = [condition, university && university.split("-")[1]].filter(Boolean).join("_");
  const scopePart = scope ? `_${scope}` : "_all";
  return `verify-ai_${kind}${scopePart}_${timestampForFilename()}.csv`;
}

/**
 * Builds and downloads a CSV, with a button spinner around it. Building
 * is synchronous and usually instant, but it is O(participants ×
 * questions) string work on the main thread — on a large dataset or a
 * slow machine that is a visible freeze, and a researcher whose click
 * appeared to do nothing will click again. The spinner (held for a
 * minimum beat so it doesn't flash) makes the outcome unambiguous.
 */
async function runDownload(button, build, kind) {
  const participants = filteredParticipants();
  const statusEl = document.getElementById("download-status");

  if (participants.length === 0) {
    statusEl.textContent = "Nothing to export — no participants match the current filters.";
    return;
  }

  setButtonLoading(button, true, "Preparing…");
  statusEl.textContent = "";

  try {
    const csv = await withMinimumDelay(
      // Yield a frame first so the spinner actually paints before the
      // main thread is taken up building the file.
      new Promise((resolve) => {
        requestAnimationFrame(() => resolve(build(participants, currentOptions())));
      })
    );
    downloadCsv(csv, filenameFor(kind));
    statusEl.textContent = `Downloaded ${participants.length} participant${
      participants.length === 1 ? "" : "s"
    }.`;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("VERIFY-AI: CSV export failed", err);
    statusEl.textContent = "We couldn't build that file. Please try again.";
  } finally {
    setButtonLoading(button, false);
  }
}

function initDownloadButtons() {
  const summaryBtn = document.getElementById("download-summary-btn");
  const responsesBtn = document.getElementById("download-responses-btn");

  summaryBtn.addEventListener("click", () =>
    runDownload(summaryBtn, buildSummaryCsv, "participant-summary")
  );
  responsesBtn.addEventListener("click", () =>
    runDownload(responsesBtn, buildResponseLevelCsv, "response-level")
  );
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
  updateSelectionSummary();
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

  ["university-filter", "condition-filter", "applicable-columns-only"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", updateSelectionSummary);
  });

  loadWatchdog = startSlowLoadHint();
  unsubscribe = subscribeToParticipants(handleData, handleError);
}

window.addEventListener("beforeunload", () => {
  if (unsubscribe) unsubscribe();
});

init();
