/**
 * VERIFY-AI — final study submission.
 *
 * Implements the ONE Firestore write per participant, with:
 *   - concurrency-safe sequential ID generation (VA001, VA002, ...)
 *   - idempotent retries (double-click, refresh mid-submission, network
 *     retry) without ever creating a second participant record or
 *     consuming a second ID
 *
 * Chosen approach: a client-side Firestore transaction, secured entirely
 * by Firestore Security Rules (see /firestore.rules) — there is no
 * trusted backend/Cloud Function in this design. That means the rules
 * ARE the security boundary here: they must be the ones enforcing that
 * a client can only ever create its own participant/lock documents, can
 * only increment the counter by exactly 1, and can never read, update,
 * or delete anything after the fact. Treat any change to this function
 * as needing a matching review of the rules file.
 *
 * How idempotency works:
 *   1. Before the first attempt, the caller obtains (and persists) an
 *      idempotency key (see js/utils/local-storage.js). The same key is
 *      reused across retries of the SAME submission attempt.
 *   2. The transaction first checks a `submissionLocks/{idempotencyKey}`
 *      document. If it already exists (a previous attempt already
 *      committed), the transaction returns the participant ID recorded
 *      there instead of generating a new one — no new ID, no new write.
 *   3. Only if the lock doesn't exist does the transaction read the
 *      counter, compute the next ID, and write the counter + lock +
 *      participant record together, atomically.
 * Firestore automatically retries a transaction that loses a
 * read/write race, so two genuinely simultaneous submissions (different
 * idempotency keys) safely serialize on the counter document rather than
 * both getting the same number.
 */
import {
  doc,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { db } from "./config.js";
import {
  getOrCreateSubmissionIdempotencyKey,
  getSubmissionResult,
  saveSubmissionResult,
} from "../utils/local-storage.js";

const COUNTER_DOC = doc(db, "meta", "participantCounter");
const PARTICIPANT_ID_PREFIX = "VA";
const PARTICIPANT_ID_DIGITS = 3;

function formatParticipantId(n) {
  return `${PARTICIPANT_ID_PREFIX}${String(n).padStart(PARTICIPANT_ID_DIGITS, "0")}`;
}

/**
 * Submits the participant's complete local record as the single, final
 * Firestore write. Safe to call more than once for the same in-browser
 * attempt (e.g. the participant double-clicks Submit, or the page is
 * refreshed after Submit was pressed but before a response came back) —
 * it will not create a duplicate record or consume an extra ID.
 *
 * @param {object} researchRecord - the complete approved record fields
 *   (participant information, consent, study responses, timestamps,
 *   studyCondition, university, etc). This function does not invent or
 *   add to this shape — it only attaches participantId/createdAt.
 * @returns {Promise<{participantId: string}>}
 */
export async function submitFinalRecord(researchRecord) {
  // Fast path: a previous call already succeeded (e.g. this is a retry
  // after the success response was lost, or the participant refreshed
  // the confirmation screen). Don't touch Firestore again.
  const existing = getSubmissionResult();
  if (existing && existing.participantId) {
    return existing;
  }

  const idempotencyKey = getOrCreateSubmissionIdempotencyKey();
  const lockRef = doc(db, "submissionLocks", idempotencyKey);

  const result = await runTransaction(db, async (tx) => {
    const lockSnap = await tx.get(lockRef);
    if (lockSnap.exists()) {
      // A previous attempt with this same idempotency key already
      // committed (e.g. the client got a network error after the write
      // actually succeeded, and is now retrying). Reuse its ID rather
      // than generating another one.
      return { participantId: lockSnap.data().participantId };
    }

    const counterSnap = await tx.get(COUNTER_DOC);
    const currentCount = counterSnap.exists() ? counterSnap.data().count : 0;
    const nextCount = currentCount + 1;
    const participantId = formatParticipantId(nextCount);
    const participantRef = doc(db, "participants", participantId);

    tx.set(COUNTER_DOC, { count: nextCount });
    tx.set(lockRef, {
      participantId,
      createdAt: serverTimestamp(),
    });
    tx.set(participantRef, {
      ...researchRecord,
      participantId,
      createdAt: serverTimestamp(),
    });

    return { participantId };
  });

  // Only now — after the transaction has actually committed — is this
  // treated as a successful submission.
  saveSubmissionResult(result);
  return result;
}
