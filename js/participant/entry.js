/**
 * VERIFY-AI — Participant entry / information / consent form.
 *
 * Scope note: this file only handles client-side form UX (validation,
 * inline error messages, enabling the Continue button). It does not read
 * or write Firestore, and does not persist participant data anywhere yet.
 *
 * Whether a participant record should be created at this stage, and
 * where the form's data should be stored, is an open question for the
 * research team — see the developer notes shared alongside this page.
 * Until that's decided, submitting this form does not send data
 * anywhere; it only unlocks navigation once all required fields pass
 * validation.
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
 */
const FIELD_DEFS = [
  { wrapperId: "institution-field", kind: "text", controlId: "institution" },
  { wrapperId: "clinical-year-field", kind: "text", controlId: "clinical-year" },
  { wrapperId: "age-field", kind: "number", controlId: "age", min: 0, max: 120 },
  { wrapperId: "sex-field", kind: "radio", name: "sex" },
  { wrapperId: "participant-code-field", kind: "text", controlId: "participant-code" },
  { wrapperId: "ai-exposure-field", kind: "radio", name: "ai-exposure" },
  { wrapperId: "ai-frequency-field", kind: "text", controlId: "ai-frequency" },
  { wrapperId: "ai-clinical-use-field", kind: "radio", name: "ai-clinical-use" },
  { wrapperId: "ai-training-field", kind: "radio", name: "ai-training" },
  { wrapperId: "ai-literacy-field", kind: "radio", name: "ai-literacy" },
  { wrapperId: "ai-trust-field", kind: "radio", name: "ai-trust" },
  { wrapperId: "ai-verify-comfort-field", kind: "radio", name: "ai-verify-comfort" },
  { wrapperId: "consent-field", kind: "checkbox", controlId: "consent-checkbox" },
];

function getField(id) {
  return document.getElementById(id);
}

/** Returns the control element(s) relevant to a field definition. */
function getControls(def) {
  if (def.kind === "radio") {
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
  return FIELD_DEFS.every(isFieldSatisfied);
}

/** Applies (or clears) the invalid state on a single field's wrapper + controls. */
function setFieldValidity(def, invalid) {
  const wrapper = getField(def.wrapperId);
  if (wrapper) wrapper.setAttribute("data-invalid", String(invalid));
  getControls(def).forEach((control) => control.setAttribute("aria-invalid", String(invalid)));
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
      const alreadyFlagged = wrapper && wrapper.getAttribute("data-invalid") === "true";
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
        status.textContent = "Please complete the required fields highlighted above.";
        status.setAttribute("data-state", "");
      }
      if (firstInvalidDef) {
        const controls = getControls(firstInvalidDef);
        if (controls[0]) controls[0].focus();
      }
      return;
    }

    // The next stage of the participant journey (randomization / clinical
    // cases) has not been built or approved yet, and it isn't yet decided
    // whether/when participant data should be written to Firebase. So
    // rather than guessing at either, this shows a clear in-page note
    // instead of navigating or writing anything.
    if (status) {
      status.textContent =
        "Thanks — this information has been captured for review. The next stage of the study is not yet available; it will continue once the research team has approved the remaining study steps.";
      status.setAttribute("data-state", "pending");
    }

    // eslint-disable-next-line no-console
    console.info("VERIFY-AI: participant form submitted (not persisted — next stage pending approval).");
  });
}

function initLiveValidationUpdates() {
  FIELD_DEFS.forEach(initLiveValidationForField);
}

function initFooterYear() {
  const el = document.getElementById("footer-year");
  if (el) el.textContent = String(new Date().getFullYear());
}

document.addEventListener("DOMContentLoaded", () => {
  initFormSubmit();
  initLiveValidationUpdates();
  initFooterYear();
  updateContinueButton();
});
