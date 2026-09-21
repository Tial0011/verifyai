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
import {
  buildSummaryCsv,
  buildResponseLevelCsv,
  downloadCsv,
  describeExport,
  columnPlan,
  fieldCatalogue,
} from "./csv.js";
import { setButtonLoading, withMinimumDelay } from "../utils/loading.js";
import { armLabel, escapeHtml } from "./format.js";

let allParticipants = [];
let unsubscribe = null;
let loadWatchdog = null;
let hasLoadedOnce = false;

/* --------------------------------------------------------------------
   Field selection
   --------------------------------------------------------------------
   Which fields the researcher has switched OFF. Stored as exclusions
   rather than inclusions on purpose: a field added to the study later
   (a new VERIFY step, a new baseline variable) then appears in the
   export by default instead of being silently missing because it wasn't
   in a saved inclusion list.

   Persisted in localStorage so a researcher who always exports the same
   reduced field set doesn't rebuild it every session. This is a UI
   preference on the researcher's own machine — no participant data is
   involved, and nothing here is written to Firestore.
   -------------------------------------------------------------------- */

const EXCLUDED_FIELDS_KEY = "verifyAI_researcher_excluded_export_fields";

let excludedFields = new Set();

function loadExcludedFields() {
  try {
    const raw = localStorage.getItem(EXCLUDED_FIELDS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveExcludedFields() {
  try {
    localStorage.setItem(EXCLUDED_FIELDS_KEY, JSON.stringify([...excludedFields]));
  } catch {
    // A full or blocked localStorage must never stop an export — the
    // selection simply won't survive a reload.
  }
}

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
  return {
    applicableColumnsOnly: checkbox ? checkbox.checked : true,
    excludedFields: [...excludedFields],
  };
}

/* --------------------------------------------------------------------
   The field picker
   -------------------------------------------------------------------- */

/** Which export the picker is currently showing fields for. */
function currentPickerKind() {
  const active = document.querySelector(".r-tab[aria-selected=\"true\"]");
  return active ? active.dataset.kind : "summary";
}

/**
 * Renders the picker from csv.js#fieldCatalogue. Only fields the current
 * selection can populate are listed — there is no point offering to
 * deselect an AI column in a No-AI-only export — so the picker changes
 * as the filters above it change.
 */
function renderFieldPicker() {
  const root = document.getElementById("field-picker");
  if (!root) return;

  const kind = currentPickerKind();
  const plan = columnPlan(filteredParticipants(), currentOptions());
  const sections = fieldCatalogue(kind, plan, currentOptions());

  root.innerHTML = sections
    .map(
      (section) => `
        <fieldset class="r-fieldset">
          <legend>${escapeHtml(section.title)}</legend>
          <div class="r-field-list">
            ${section.fields
              .map((field) => {
                const id = `field-${kind}-${field.key}`;
                const columnNote =
                  field.columnsEach > 1 ? ` <span class="r-field__note">×${field.columnsEach}</span>` : "";
                return `
                  <label class="r-field-toggle" for="${id}"${
                  field.locked ? ' data-locked="true"' : ""
                }>
                    <input
                      type="checkbox"
                      id="${id}"
                      data-field-key="${escapeHtml(field.key)}"
                      ${field.selected ? "checked" : ""}
                      ${field.locked ? "disabled" : ""}
                    />
                    <span>
                      <span class="r-field__label">${escapeHtml(field.label)}${columnNote}</span>
                      <code class="r-field__key">${escapeHtml(field.key)}</code>
                    </span>
                  </label>`;
              })
              .join("")}
          </div>
        </fieldset>`
    )
    .join("");

  root.querySelectorAll("input[data-field-key]").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.fieldKey;
      if (input.checked) excludedFields.delete(key);
      else excludedFields.add(key);
      saveExcludedFields();
      updateSelectionSummary();
    });
  });
}

/** Select-all / clear-all, scoped to the fields currently on screen. */
function setAllFields(selected) {
  const root = document.getElementById("field-picker");
  if (!root) return;
  root.querySelectorAll("input[data-field-key]:not(:disabled)").forEach((input) => {
    if (selected) excludedFields.delete(input.dataset.fieldKey);
    else excludedFields.add(input.dataset.fieldKey);
  });
  saveExcludedFields();
  renderFieldPicker();
  updateSelectionSummary();
}

function initFieldPickerControls() {
  document.querySelectorAll(".r-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".r-tab").forEach((t) => t.setAttribute("aria-selected", "false"));
      tab.setAttribute("aria-selected", "true");
      renderFieldPicker();
    });
  });

  document.getElementById("select-all-fields").addEventListener("click", () => setAllFields(true));
  document.getElementById("clear-all-fields").addEventListener("click", () => setAllFields(false));
  document.getElementById("reset-fields").addEventListener("click", () => {
    excludedFields = new Set();
    saveExcludedFields();
    renderFieldPicker();
    updateSelectionSummary();
  });
}

/**
 * Restates the current selection and the resulting column plan in plain
 * language. The point is that a researcher who filters to No-AI and
 * downloads should already know the AI and VERIFY-AI columns won't be in
 * the file — and, equally, that clearing the filter brings them back.
 */
function updateSelectionSummary({ rerenderPicker = false } = {}) {
  if (rerenderPicker) renderFieldPicker();
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

  if (plan.excludedFields > 0) {
    parts.push(
      `You have switched off ${plan.excludedFields} field${
        plan.excludedFields === 1 ? "" : "s"
      } in Choose fields below.`
    );
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
  // The picker only lists fields the current selection can populate, so
  // it has to be rebuilt whenever the underlying data or filters change.
  updateSelectionSummary({ rerenderPicker: true });
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

  excludedFields = loadExcludedFields();
  initFieldPickerControls();

  ["university-filter", "condition-filter", "applicable-columns-only"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", () => updateSelectionSummary({ rerenderPicker: true }));
  });

  loadWatchdog = startSlowLoadHint();
  unsubscribe = subscribeToParticipants(handleData, handleError);
}

window.addEventListener("beforeunload", () => {
  if (unsubscribe) unsubscribe();
});

init();
