/**
 * VERIFY-AI — Participant entry / information / consent form.
 *
 * Per the approved "local storage + single Firestore write" architecture:
 * this page never talks to Firestore. On Continue, once all required
 * fields validate, the form's data is saved as a local draft snapshot
 * (see js/utils/local-storage.js) so it survives refreshes/navigation
 * during the session, and the participant is sent on to the case flow
 * (cases.html) if their institution's arm has been built. The
 * participant record itself is written to Firestore exactly once, later,
 * at final study submission (complete.html) — see "Not yet built" below
 * for what's still missing from that path.
 *
 * ---------------------------------------------------------------------
 * FIELD_DEFS is the single place that controls which fields are
 * required and how each is validated. Each entry describes:
 *   - wrapperId: id of the .field / fieldset.field element that gets
 *     data-invalid toggled and contains the .field__error message
 *   - kind: "text" (input/select, checked for a non-empty value),
 *     "number" (input, checked for a non-empty value within min/max),
 *     "radio" (a named group of radio inputs, checked that one is
 *     selected), or "checkbox" (checked that it's ticked)
 *   - controlId / name: how to find the control(s) for this field
 * To add or remove a required field later, edit this array; no other
 * code needs to change.
 * ---------------------------------------------------------------------
 *
 * Study arm: the participant's condition is resolved here, once, from
 * their institution (see js/participant/study-arm.js) and stored on the
 * draft. Storing it — rather than re-deriving it on every page — is what
 * guarantees a participant can't land in a different arm by refreshing or
 * by the site mapping changing mid-study. The arm is never displayed to
 * the participant; allocation stays concealed.
 */
import {
  saveParticipantDraft,
  getParticipantDraft,
  clearStudyProgress,
} from "../utils/local-storage.js";
import { armForInstitution } from "./study-arm.js";
import { showOverlay, initNetworkBanner } from "../utils/loading.js";

const FIELD_DEFS = [
  { wrapperId: "institution-field", kind: "text", controlId: "institution" },
  {
    wrapperId: "clinical-year-field",
    kind: "text",
    controlId: "clinical-year",
  },
  {
    wrapperId: "age-field",
    kind: "number",
    controlId: "age",
    min: 0,
    max: 120,
  },
  { wrapperId: "sex-field", kind: "radio", name: "sex" },
  {
    wrapperId: "marital-status-field",
    kind: "text",
    controlId: "marital-status",
  },
  {
    wrapperId: "clinical-rotations-field",
    kind: "checkbox-group",
    name: "clinical-rotations",
  },
  { wrapperId: "ai-exposure-field", kind: "radio", name: "ai-exposure" },
  { wrapperId: "ai-frequency-field", kind: "text", controlId: "ai-frequency" },
  {
    wrapperId: "ai-clinical-use-field",
    kind: "radio",
    name: "ai-clinical-use",
  },
  { wrapperId: "ai-training-field", kind: "radio", name: "ai-training" },
  { wrapperId: "ai-literacy-field", kind: "radio", name: "ai-literacy" },
  { wrapperId: "ai-trust-field", kind: "radio", name: "ai-trust" },
  {
    wrapperId: "ai-verify-comfort-field",
    kind: "radio",
    name: "ai-verify-comfort",
  },
  {
    wrapperId: "consent-field",
    kind: "checkbox",
    controlId: "consent-checkbox",
  },
];

function getField(id) {
  return document.getElementById(id);
}

/** Returns the control element(s) relevant to a field definition. */
function getControls(def) {
  if (def.kind === "radio" || def.kind === "checkbox-group") {
    return Array.from(document.querySelectorAll(`input[name="${def.name}"]`));
  }
  const el = getField(def.controlId);
  return el ? [el] : [];
}

/** Returns true if a field definition's requirement is currently satisfied. */
function isFieldSatisfied(def) {
  const controls = getControls(def);
  if (controls.length === 0) return true; // field removed/renamed — don't block on it silently

  if (def.kind === "checkbox") {
    return controls[0].checked;
  }
  if (def.kind === "radio") {
    return controls.some((input) => input.checked);
  }
  if (def.kind === "checkbox-group") {
    return controls.some((input) => input.checked);
  }
  if (def.kind === "number") {
    const raw = controls[0].value.trim();
    if (raw.length === 0) return false;
    const value = Number(raw);
    if (Number.isNaN(value)) return false;
    if (typeof def.min === "number" && value < def.min) return false;
    if (typeof def.max === "number" && value > def.max) return false;
    return true;
  }
  // "text" covers text inputs and selects alike
  return controls[0].value.trim().length > 0;
}

function allRequiredFieldsSatisfied() {
  return FIELD_DEFS.every(isFieldSatisfied) && isOtherAiToolSatisfied();
}

function isOtherAiToolSatisfied() {
  const toggle = getField("ai-tools-other-toggle");
  const otherTool = getField("ai-tools-other");
  return (
    !toggle ||
    !toggle.checked ||
    (otherTool && otherTool.value.trim().length > 0)
  );
}

/** Reads a single control's current value, regardless of its kind. */
function readControlValue(def) {
  const controls = getControls(def);
  if (controls.length === 0) return null;
  if (def.kind === "checkbox") return controls[0].checked;
  if (def.kind === "radio") {
    const checked = controls.find((input) => input.checked);
    return checked ? checked.value : null;
  }
  if (def.kind === "checkbox-group") {
    return controls
      .filter((input) => input.checked)
      .map((input) => input.value);
  }
  if (def.kind === "number") {
    const raw = controls[0].value.trim();
    return raw.length ? Number(raw) : null;
  }
  return controls[0].value.trim();
}

/**
 * Builds the participant draft object from the current form state: every
 * field in FIELD_DEFS (keyed by controlId or radio-group name), plus any
 * approved optional fields collected alongside them. This is the object
 * that gets saved to localStorage — nothing here is sent to Firestore.
 */
function collectParticipantData() {
  const data = {};
  FIELD_DEFS.forEach((def) => {
    const key = def.controlId || def.name;
    data[key] = readControlValue(def);
  });

  // Optional fields not in FIELD_DEFS (not required, but worth capturing
  // if the participant filled them in).
  const aiTools = Array.from(
    document.querySelectorAll('input[name="ai-tools"]:checked'),
  ).map((input) => input.value);
  const otherToolToggle = getField("ai-tools-other-toggle");
  const otherTool = getField("ai-tools-other");
  if (otherToolToggle && otherToolToggle.checked && otherTool.value.trim()) {
    aiTools[aiTools.indexOf("Other")] = `Other: ${otherTool.value.trim()}`;
  }
  data["ai-tools"] = aiTools.join(", ");

  // Concealed allocation: resolved once here and carried with the draft.
  data.studyArm = armForInstitution(data.institution);
  data.savedAt = new Date().toISOString();
  return data;
}

/** Applies (or clears) the invalid state on a single field's wrapper + controls. */
function setFieldValidity(def, invalid) {
  const wrapper = getField(def.wrapperId);
  if (wrapper) wrapper.setAttribute("data-invalid", String(invalid));
  getControls(def).forEach((control) =>
    control.setAttribute("aria-invalid", String(invalid)),
  );
}

/** Validates one field and reflects the result in the UI. Returns whether it passed. */
function validateField(def) {
  const satisfied = isFieldSatisfied(def);
  setFieldValidity(def, !satisfied);
  return satisfied;
}

/** Validates every field, reflects results in the UI, and returns overall validity. */
function validateAllFields() {
  let allValid = true;
  let firstInvalidDef = null;
  FIELD_DEFS.forEach((def) => {
    const satisfied = validateField(def);
    if (!satisfied && !firstInvalidDef) firstInvalidDef = def;
    if (!satisfied) allValid = false;
  });
  const otherToolValid = isOtherAiToolSatisfied();
  const otherToolField = getField("ai-tools-other-field");
  if (otherToolField) {
    otherToolField.setAttribute("data-invalid", String(!otherToolValid));
  }
  if (!otherToolValid) allValid = false;
  return { allValid, firstInvalidDef };
}

function updateContinueButton() {
  const continueBtn = getField("continue-btn");
  const status = getField("form-status");
  if (!continueBtn) return;

  const ready = allRequiredFieldsSatisfied();
  continueBtn.disabled = !ready;
  continueBtn.setAttribute("aria-disabled", String(!ready));

  if (status && status.getAttribute("data-state") !== "pending") {
    status.textContent = ready
      ? "You're ready to continue."
      : "Complete the required fields above to continue.";
    status.setAttribute("data-state", ready ? "ready" : "");
  }
}

/** Wires up live (on-change) validation for a single field definition. */
function initLiveValidationForField(def) {
  getControls(def).forEach((control) => {
    control.addEventListener("change", () => {
      // Only clear/re-show this field's own error as the user interacts with
      // it; don't force errors to appear on fields the user hasn't touched.
      const wrapper = getField(def.wrapperId);
      const alreadyFlagged =
        wrapper && wrapper.getAttribute("data-invalid") === "true";
      if (alreadyFlagged || isFieldSatisfied(def)) {
        validateField(def);
      }
      updateContinueButton();
    });
  });
}

function initFormSubmit() {
  const form = getField("participant-form");
  const status = getField("form-status");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const { allValid, firstInvalidDef } = validateAllFields();
    updateContinueButton();

    if (!allValid) {
      if (status) {
        status.textContent =
          "Please complete the required fields highlighted above.";
        status.setAttribute("data-state", "");
      }
      if (firstInvalidDef) {
        const controls = getControls(firstInvalidDef);
        if (controls[0]) controls[0].focus();
      } else {
        getField("ai-tools-other")?.focus();
      }
      return;
    }

    // Save the participant's information + consent locally. Nothing is
    // written to Firestore here or anywhere before final study submission.
    //
    // Resubmitting entry (e.g. the participant — or a tester — goes back
    // and picks a different institution) starts a new attempt. Any study
    // progress left over from a PRIOR attempt under a different
    // institution belongs to that earlier attempt's arm, not this one, so
    // it must not be carried forward — otherwise the case runner's
    // refresh-stability guard (which deliberately keeps an in-progress
    // participant's arm fixed) would keep the stale arm instead of the
    // one just selected here.
    const previousDraft = getParticipantDraft();
    const participantData = collectParticipantData();
    if (
      previousDraft &&
      previousDraft.institution !== participantData.institution
    ) {
      clearStudyProgress();
    }
    saveParticipantDraft(participantData);

    if (participantData.studyArm) {
      // All three arms run through the same case runner, which renders
      // the condition-appropriate flow.
      //
      // Nothing is written to Firestore here, so this is a fast local
      // hand-off — but the next page still has to be fetched, which on a
      // poor connection is exactly where the participant would otherwise
      // sit looking at an unresponsive Continue button. The overlay fades
      // in only after ~150ms, so a fast transition never flashes it.
      showOverlay("Loading the assessment…");
      window.location.href = "cases.html";
      return;
    }

    // Institution not present in the allocation map — don't guess at a
    // condition. The draft is saved; the research team can correct the
    // mapping in js/participant/study-arm.js.
    if (status) {
      status.textContent =
        "Thanks — your information has been saved for this session. The next stage of the study is not yet available for your institution.";
      status.setAttribute("data-state", "pending");
    }

    // eslint-disable-next-line no-console
    console.info(
      "VERIFY-AI: participant draft saved locally (no Firestore write).",
    );
  });
}

function initLiveValidationUpdates() {
  FIELD_DEFS.forEach(initLiveValidationForField);
}

function initOtherAiToolField() {
  const toggle = getField("ai-tools-other-toggle");
  const otherTool = getField("ai-tools-other");
  if (!toggle || !otherTool) return;

  const updateOtherToolState = () => {
    otherTool.disabled = !toggle.checked;
    otherTool.required = toggle.checked;
    otherTool.closest(".ai-tools-other").hidden = !toggle.checked;
    if (!toggle.checked) otherTool.value = "";
  };

  toggle.addEventListener("change", updateOtherToolState);
  updateOtherToolState();
}

function initFooterYear() {
  const el = document.getElementById("footer-year");
  if (el) el.textContent = String(new Date().getFullYear());
}

document.addEventListener("DOMContentLoaded", () => {
  initNetworkBanner();
  initFormSubmit();
  initLiveValidationUpdates();
  initOtherAiToolField();
  initFooterYear();
  updateContinueButton();
});
