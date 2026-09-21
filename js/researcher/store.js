/**
 * VERIFY-AI — real-time participants data source (researcher pages only).
 *
 * One onSnapshot listener, ordered by createdAt descending. All
 * filtering/searching for the dashboard and participants pages happens
 * client-side against the array this keeps in memory — the study's
 * expected participant count is small enough (dozens to a few hundred)
 * that this is simpler and cheaper than maintaining several composite
 * Firestore indexes for every filter combination, and it means Firestore
 * stays the single source of truth with no separate sync step.
 *
 * Firestore is the source of truth; nothing here is ever written back to
 * it (the researcher pages are read-only by design — see firestore.rules).
 */
import {
  collection,
  query,
  orderBy,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { db } from "../firebase/config.js";

/**
 * Subscribes to the participants collection.
 *
 * @param {(participants: object[], meta: {fromCache: boolean}) => void} onData
 *   Called with the full, current array (each item has `id` = the
 *   participantId doc id) every time the collection changes, including
 *   once immediately with the initial snapshot.
 * @param {(error: Error) => void} onError
 *   Called if the listener fails (e.g. permission revoked, network down
 *   in a way Firestore treats as a hard error).
 * @returns {() => void} unsubscribe function — call it when the page/view
 *   using this data is torn down, so exactly one listener is ever active.
 */
export function subscribeToParticipants(onData, onError) {
  const q = query(collection(db, "participants"), orderBy("createdAt", "desc"));

  let settled = false;

  const timeoutId = setTimeout(() => {
    if (settled) return;

    settled = true;

    const error = new Error(
      "Research data could not be loaded. Please check your internet connection and try again.",
    );

    error.code = "network-timeout";

    if (onError) onError(error);
  }, 10000);

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutId);
      }

      const participants = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      onData(participants, {
        fromCache: snapshot.metadata.fromCache,
      });
    },
    (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutId);
      }

      console.error("VERIFY-AI: participants listener failed", error);

      if (onError) onError(error);
    },
  );

  return () => {
    clearTimeout(timeoutId);
    unsubscribe();
  };
}
