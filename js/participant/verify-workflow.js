/**
 * VERIFY-AI — structured verification workflow (AI + VERIFY-AI arm only).
 *
 * Six steps, completed by the participant AFTER seeing the locked AI
 * suggestion and BEFORE their final answer can be submitted:
 *
 *   1. Validate              — does the suggestion match the findings?
 *   2. Examine               — which findings did you check it against?
 *   3. Review                — is there a plausible alternative?
 *   4. Independently Compare — what would you answer on your own?
 *   5. Flag                  — any concern to raise about the suggestion?
 *   6. Yield                 — accept the AI's answer, or go with your own?
 *
 * The workflow cannot be bypassed: every step is required, and the case
 * runner refuses to accept a final answer until validateResponses()
 * returns no missing steps (see cases.js).
 *
 * WORDING APPROVED BY THE RESEARCH TEAM (2026-09-17). The six step names
 * are fixed by the study design; the prompt text and response options
 * below were reviewed and accepted as written. Any future change to
 * wording or response options is confined to STEPS below.
 *
 * Note: step 4 ("Independently Compare") captures the participant's own
 * answer before they commit to a final one. Together with the final
 * answer this is what makes "did the participant change their answer
 * after seeing the AI suggestion?" measurable in this arm.
 *
 * Nothing here reveals the correct answer, scores a response, or tells
 * the participant whether the AI is right.
 */

export const VERIFY_STEPS_COUNT = 6;

/**
 * Step definitions.
 *   key      — stored field name in the saved response
 *   letter   — the VERIFY-AI letter shown in the UI
 *   name     — step name
 *   prompt   — question text
 *   kind     — "choice" (one option required) or "text" (free text required)
 *   options  — for kind "choice"
 *   note     — optional follow-up free text; `requiredWhen` lists the
 *              option ids that make the note mandatory
 *   usesQuestionOptions — for kind "choice", render the question's own
 *              answer options instead of a fixed option list
 */
export const STEPS = [
  {
    key: "validate",
    letter: "V",
    name: "Validate",
    prompt:
      "Does the AI's suggested answer match the key clinical findings described in the scenario?",
    kind: "choice",
    options: [
      { id: "fully", label: "Yes — it matches the findings" },
      { id: "partly", label: "Partly — some findings fit, some do not" },
      { id: "no", label: "No — it does not match the findings" },
    ],
  },
  {
    key: "examine",
    letter: "E",
    name: "Examine",
    prompt:
      "Which specific findings in the scenario did you check the AI's suggestion against?",
    kind: "text",
    placeholder: "List the findings you used to check the suggestion.",
  },
  {
    key: "review",
    letter: "R",
    name: "Review",
    prompt:
      "Is there a plausible alternative answer the AI may have overlooked?",
    kind: "choice",
    options: [
      { id: "yes", label: "Yes — there is a plausible alternative" },
      { id: "no", label: "No — I could not identify a plausible alternative" },
    ],
    note: {
      prompt: "Which alternative, and why?",
      requiredWhen: ["yes"],
      placeholder: "Name the alternative you considered.",
    },
  },
  {
    key: "independentlyCompare",
    letter: "I",
    name: "Independently Compare",
    prompt:
      "Setting the AI's suggestion aside, which answer would you choose on your own reasoning?",
    kind: "choice",
    usesQuestionOptions: true,
  },
  {
    key: "flag",
    letter: "F",
    name: "Flag",
    prompt: "Do you want to flag any concern about the AI's suggestion?",
    kind: "choice",
    options: [
      { id: "yes", label: "Yes — I have a concern" },
      { id: "no", label: "No concern to flag" },
    ],
    note: {
      prompt: "What is your concern?",
      requiredWhen: ["yes"],
      placeholder: "Describe the concern.",
    },
  },
  {
    key: "yield",
    letter: "Y",
    name: "Yield",
    prompt: "After this check, how will you use the AI's suggestion?",
    kind: "choice",
    options: [
      { id: "accept", label: "Accept the AI's suggested answer" },
      { id: "reject", label: "Reject it and use my own answer" },
      { id: "modify", label: "Use it only partly, adjusted by my own reasoning" },
    ],
  },
];

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
}

/**
 * Renders the workflow markup for one question. `question` supplies the
 * answer options used by the "Independently Compare" step.
 */
export function renderVerifyWorkflow(question) {
  const stepsHtml = STEPS.map((step, index) => {
    const options = step.usesQuestionOptions ? question.options : step.options || [];
    const fieldId = `verify-${step.key}-field`;

    const controlHtml =
      step.kind === "text"
        ? `<textarea class="field__control verify-step__text" id="verify-${step.key}" name="verify-${step.key}" rows="2" placeholder="${escapeHtml(
            step.placeholder || ""
          )}" aria-describedby="verify-${step.key}-error"></textarea>`
        : `<div class="choice-options choice-options--stacked" role="radiogroup" aria-label="${escapeHtml(
            step.name
          )}" aria-describedby="verify-${step.key}-error">
             ${options
               .map(
                 (opt) =>
                   `<label class="choice-option"><input type="radio" name="verify-${step.key}" value="${escapeHtml(
                     opt.id
                   )}" /> ${escapeHtml(opt.label)}</label>`
               )
               .join("")}
           </div>`;

    const noteHtml = step.note
      ? `<div class="verify-step__note">
           <label class="field__label" for="verify-${step.key}-note">${escapeHtml(
          step.note.prompt
        )}</label>
           <textarea class="field__control verify-step__text" id="verify-${step.key}-note" name="verify-${step.key}-note" rows="2" placeholder="${escapeHtml(
          step.note.placeholder || ""
        )}"></textarea>
         </div>`
      : "";

    return `
      <fieldset class="field choice-fieldset verify-step" id="${fieldId}" data-invalid="false">
        <legend>
          <span class="verify-step__letter" aria-hidden="true">${step.letter}</span>
          <span class="verify-step__index">Step ${index + 1} of ${VERIFY_STEPS_COUNT}</span>
          <span class="verify-step__name">${escapeHtml(step.name)}</span>
        </legend>
        <p class="verify-step__prompt">${escapeHtml(step.prompt)}</p>
        ${controlHtml}
        ${noteHtml}
        <p class="field__error" id="verify-${step.key}-error">This step is required before you can submit your final answer.</p>
      </fieldset>
    `;
  }).join("");

  return `
    <section class="verify-panel" aria-labelledby="verify-panel-heading">
      <h2 class="verify-panel__heading" id="verify-panel-heading">VERIFY-AI check</h2>
      <p class="verify-panel__intro">
        Work through all six steps below to evaluate the AI suggestion. Every
        step must be completed before you can submit your final answer.
      </p>
      ${stepsHtml}
    </section>
  `;
}

/** Reads the current value of one step from the DOM. */
function readStep(step) {
  if (step.kind === "text") {
    const el = document.getElementById(`verify-${step.key}`);
    return { value: el ? el.value.trim() : "", note: null };
  }
  const checked = document.querySelector(`input[name="verify-${step.key}"]:checked`);
  const noteEl = step.note ? document.getElementById(`verify-${step.key}-note`) : null;
  return {
    value: checked ? checked.value : null,
    note: noteEl ? noteEl.value.trim() : null,
  };
}

/**
 * Validates every step, reflects invalid state in the UI, and returns
 * { valid, responses, firstInvalidId }.
 *
 * `responses` is the object saved with the question's research record:
 * one entry per step key, each { value, note }.
 */
export function collectAndValidate() {
  let valid = true;
  let firstInvalidId = null;
  const responses = {};

  STEPS.forEach((step) => {
    const { value, note } = readStep(step);
    let stepValid = step.kind === "text" ? value.length > 0 : Boolean(value);

    if (stepValid && step.note && step.note.requiredWhen.includes(value)) {
      stepValid = Boolean(note && note.length > 0);
    }

    const wrapper = document.getElementById(`verify-${step.key}-field`);
    if (wrapper) wrapper.setAttribute("data-invalid", String(!stepValid));

    if (!stepValid) {
      valid = false;
      if (!firstInvalidId) firstInvalidId = `verify-${step.key}-field`;
    }

    responses[step.key] = { value, note: note || null };
  });

  return { valid, responses, firstInvalidId };
}

/** The participant's own (pre-commitment) answer, from the Compare step. */
export function independentAnswerFrom(responses) {
  const entry = responses && responses.independentlyCompare;
  return entry ? entry.value : null;
}
