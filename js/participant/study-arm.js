/**
 * VERIFY-AI — study arm assignment.
 *
 * The three arms of the study, and the single place that decides which
 * one a participant is in. Everything else (entry, case runner, final
 * submission) imports from here rather than hard-coding an institution
 * name or a condition string.
 *
 *   NO_AI       — no AI suggestion, no VERIFY-AI workflow
 *   STANDARD_AI — AI suggestion, no VERIFY-AI workflow
 *   VERIFY_AI   — AI suggestion + structured VERIFY-AI verification
 *
 * Allocation strategy
 * -------------------
 * Allocation is by SITE (institution), which is what the existing code
 * already did — cases.js/complete.js previously hard-coded "University of
 * Ibadan = No-AI arm". That fact is preserved below; the other two
 * institutions are mapped to the remaining two arms.
 *
 * The full mapping was confirmed by the research team (2026-09-17):
 *   University of Ibadan               → No-AI
 *   University of Medical Sciences,    → AI + VERIFY-AI
 *     Ondo
 *   Babcock University, Ilishan-Remo   → Standard AI
 * Changing it is a one-line edit to ARM_BY_INSTITUTION — no other file
 * needs to change.
 *
 * Because allocation is deterministic per site, it is automatically
 * refresh-stable (README: "A participant must not receive a different
 * group simply by refreshing"). It is also persisted with the participant
 * draft on first assignment, so that even if the mapping were later
 * changed mid-study, an in-progress participant keeps the arm they
 * started in.
 */

export const ARMS = {
  NO_AI: "no_ai",
  STANDARD_AI: "standard_ai",
  VERIFY_AI: "ai_verify_ai",
};

/** Human-readable labels — researcher/debug use, never shown to participants. */
export const ARM_LABELS = {
  [ARMS.NO_AI]: "No-AI",
  [ARMS.STANDARD_AI]: "Standard AI",
  [ARMS.VERIFY_AI]: "AI + VERIFY-AI",
};

export const ARM_BY_INSTITUTION = {
  // Confirmed by the pre-existing implementation.
  "university-of-ibadan": ARMS.NO_AI,
  // Confirmed by the research team.
  "university-of-medical-sciences-ondo": ARMS.VERIFY_AI,
  // Confirmed by the research team.
  "babcock-university-ilishan-remo": ARMS.STANDARD_AI,
};

/**
 * Human-readable institution names, exactly as the entry form's <option>
 * labels read (see participant/entry.html). Added for the researcher
 * dashboard (Phase 3) — participants never see this export used anywhere;
 * it only saves the researcher pages from hard-coding the same three
 * strings a second time. Keyed the same as ARM_BY_INSTITUTION.
 */
export const INSTITUTION_LABELS = {
  "university-of-ibadan": "University of Ibadan",
  "university-of-medical-sciences-ondo": "University of Medical Sciences, Ondo",
  "babcock-university-ilishan-remo": "Babcock University, Ilishan-Remo",
};

/**
 * Older/parallel spellings of the same three arms that may exist in
 * stored records. js/firebase/participants.js, for instance, writes the
 * VERIFY arm as "verify_ai" rather than "ai_verify_ai". Mapping them
 * here means a single participant document written under either spelling
 * still resolves to the right condition everywhere — including in the
 * researcher exports, which decide which columns apply by looking at the
 * arms present in the data.
 */
const ARM_ALIASES = {
  verify_ai: ARMS.VERIFY_AI,
  noai: ARMS.NO_AI,
  "no-ai": ARMS.NO_AI,
  standardai: ARMS.STANDARD_AI,
};

/** Canonical ARMS value for an arm string, or null if unrecognised. */
export function normalizeArm(arm) {
  if (!arm) return null;
  if (Object.values(ARMS).includes(arm)) return arm;
  return ARM_ALIASES[arm] || null;
}

/** True if the given arm value is one of the three defined arms. */
export function isValidArm(arm) {
  return Object.values(ARMS).includes(arm);
}

/**
 * Resolves the study arm for an institution value (as submitted by the
 * entry form). Returns null for an unknown institution rather than
 * guessing — callers decide how to handle that.
 */
export function armForInstitution(institution) {
  return ARM_BY_INSTITUTION[institution] || null;
}

/**
 * Reads the arm already recorded on a participant draft, falling back to
 * the site mapping. An arm stored on the draft always wins, so a
 * participant's condition never changes part-way through a session.
 */
export function resolveArm(draft) {
  if (!draft) return null;
  if (isValidArm(draft.studyArm)) return draft.studyArm;
  return armForInstitution(draft.institution);
}

/** Whether this arm sees the locked AI suggestion. */
export function armShowsAi(arm) {
  const normalized = normalizeArm(arm);
  return normalized === ARMS.STANDARD_AI || normalized === ARMS.VERIFY_AI;
}

/** Whether this arm completes the structured VERIFY-AI workflow. */
export function armShowsVerifyWorkflow(arm) {
  return normalizeArm(arm) === ARMS.VERIFY_AI;
}
