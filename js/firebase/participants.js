/**
 * VERIFY-AI — Participant registration (Firestore data access).
 *
 * This module owns the two things that must stay consistent with
 * /firestore.rules:
 *   1. The university → study-condition mapping.
 *   2. The concurrency-safe VA### participant-ID counter.
 *
 * Only "no_ai" (University of Ibadan) is implemented end-to-end right
 * now — see IMPLEMENTED_STUDY_CONDITIONS. The other two mappings are
 * listed for documentation/forward-reference only; Firestore Security
 * Rules do not currently accept a create for either of them, so calling
 * registerParticipant() for an unimplemented condition will fail even if
 * this client-side check were bypassed.
 */
import { db } from "./config.js";
import {
  doc,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const COUNTER_DOC_PATH = ["counters", "participants"];
const PARTICIPANTS_COLLECTION = "participants";
const ID_PREFIX = "VA";
const ID_MIN_DIGITS = 3;

/**
 * University → study-condition mapping, per the research brief.
 * Keys must match the <option value="..."> values used on
 * participant/entry.html's institution field.
 */
export const UNIVERSITY_STUDY_CONDITIONS = {
  "university-of-ibadan": "no_ai",
  "babcock-university-ilishan-remo": "standard_ai",
  "university-of-medical-sciences-ondo": "verify_ai",
};

/**
 * Study conditions that have an actual participant-facing flow built and
 * an accepting Firestore Security Rules branch. Update this only once a
 * condition's real page + rules branch both exist.
 */
export const IMPLEMENTED_STUDY_CONDITIONS = new Set(["no_ai"]);

function formatParticipantId(number) {
  return `${ID_PREFIX}${String(number).padStart(ID_MIN_DIGITS, "0")}`;
}

/**
 * Atomically allocates the next VA### participant ID and creates the
 * participant record, in a single Firestore transaction.
 *
 * Why this is concurrency-safe: the transaction reads counters/participants
 * as part of the transaction. If a second submission commits first and
 * changes that document, Firestore detects the conflict and automatically
 * retries this transaction with a fresh read — so two near-simultaneous
 * submissions can never compute the same next number. This is the
 * standard Firestore atomic-counter pattern, not a read-then-write race.
 *
 * Call this only after the participant has passed consent/form validation
 * — never on page load — so an abandoned session never consumes an ID.
 *
 * @param {{ university: string }} params
 * @returns {Promise<{ participantId: string, studyCondition: string }>}
 * @throws {Error} with message "UNIMPLEMENTED_STUDY_CONDITION" if the
 *   university does not map to a currently implemented study condition.
 */
export async function registerParticipant({ university }) {
  const studyCondition = UNIVERSITY_STUDY_CONDITIONS[university];
  if (!studyCondition || !IMPLEMENTED_STUDY_CONDITIONS.has(studyCondition)) {
    throw new Error("UNIMPLEMENTED_STUDY_CONDITION");
  }

  const counterRef = doc(db, ...COUNTER_DOC_PATH);

  const participantId = await runTransaction(db, async (transaction) => {
    const counterSnap = await transaction.get(counterRef);
    if (!counterSnap.exists()) {
      // The counter document is intentionally not client-creatable (see
      // firestore.rules) — it must be seeded once, manually, before the
      // study goes live. See README → "Before pilot testing".
      throw new Error("COUNTER_NOT_SEEDED");
    }

    const currentNumber = counterSnap.data().lastNumber;
    const nextNumber = currentNumber + 1;
    const nextId = formatParticipantId(nextNumber);
    const participantRef = doc(db, PARTICIPANTS_COLLECTION, nextId);

    // Minimum schema for this phase only — see docs/RESEARCHER-REVIEW-UI-NO-AI.md
    // for the fields (baseline questionnaire, case responses, etc.) that
    // are intentionally NOT written here yet, pending the final data
    // dictionary from the research team.
    transaction.set(participantRef, {
      participantId: nextId,
      university,
      studyCondition,
      consentStatus: true,
      createdAt: serverTimestamp(),
    });
    transaction.update(counterRef, { lastNumber: nextNumber });

    return nextId;
  });

  return { participantId, studyCondition };
}
