/**
 * VERIFY-AI — Participant entry / information / consent form.
 *
 * Scope note: this file only handles client-side form UX (enabling the
 * Continue button, inline validation messages). It does not read or
 * write Firestore, and does not persist participant data anywhere yet.
 *
 * Whether a participant record should be created at this stage, and
 * where the form's data should be stored, is an open question for the
 * research team — see the developer notes shared alongside this page.
 * Until that's decided, submitting this form does not send data
 * anywhere; it only unlocks navigation once the (currently minimal)
 * validation requirements are met.
 *
 * ---------------------------------------------------------------------
 * REQUIRED_FIELD_IDS is the single place that controls which fields
 * must be filled in before "Continue" is enabled. Right now only the
 * consent checkbox is required, because that's the one requirement the
 * brief states explicitly — everything else is pending confirmation
 * from the research team. To make another field mandatory later, add
 * its element id to this array; no other code needs to change.
 * ---------------------------------------------------------------------
 */
const REQUIRED_FIELD_IDS = ["consent-checkbox"];

function getField(id) {
  return document.getElementById(id);
}

/** Returns true if a required field is currently satisfied. */
function isFieldSatisfied(id) {
  const el = getField(id);
  if (!el) return true; // field removed/renamed — don't block on it silently
  if (el.type === "checkbox") return el.checked;
  if (el.type === "radio") {
    const group = document.querySelectorAll(`input[name="${el.name}"]`);
    return Array.from(group).some((input) => input.checked);
  }
  return el.value.trim().length > 0;
}

function allRequiredFieldsSatisfied() {
  return REQUIRED_FIELD_IDS.every(isFieldSatisfied);
}

function setFieldInvalid(fieldWrapper, invalid, controlOverride) {
  if (!fieldWrapper) return;
  fieldWrapper.setAttribute("data-invalid", String(invalid));
  const control = controlOverride || fieldWrapper.querySelector(".field__control, input");
  if (control) control.setAttribute("aria-invalid", String(invalid));
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
      : "Confirm consent above to continue.";
    status.setAttribute("data-state", ready ? "ready" : "");
  }
}

function initConsentValidation() {
  const consentCheckbox = getField("consent-checkbox");
  const consentField = getField("consent-field");
  if (!consentCheckbox) return;

  consentCheckbox.addEventListener("change", () => {
    if (consentCheckbox.checked) {
      setFieldInvalid(consentField, false, consentCheckbox);
    }
    updateContinueButton();
  });
}

function initFormSubmit() {
  const form = getField("participant-form");
  const status = getField("form-status");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!allRequiredFieldsSatisfied()) {
      const consentCheckbox = getField("consent-checkbox");
      const consentField = getField("consent-field");
      setFieldInvalid(consentField, true, consentCheckbox);
      consentCheckbox?.focus();
      return;
    }

    // [RESEARCHER APPROVAL REQUIRED]
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
  // Any change anywhere in the form can affect whether required fields
  // are satisfied, so keep the Continue button state in sync generally,
  // in addition to the consent-specific handling above.
  const form = getField("participant-form");
  if (!form) return;
  form.addEventListener("change", updateContinueButton);
}

function initFooterYear() {
  const el = document.getElementById("footer-year");
  if (el) el.textContent = String(new Date().getFullYear());
}

document.addEventListener("DOMContentLoaded", () => {
  initConsentValidation();
  initFormSubmit();
  initLiveValidationUpdates();
  initFooterYear();
  updateContinueButton();
});
