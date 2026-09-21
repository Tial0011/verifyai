/**
 * VERIFY-AI — Researcher route guard.
 *
 * Every protected researcher page (dashboard, participants,
 * participant-details, export) calls requireResearcher() before doing
 * anything else. It resolves once Firebase Auth's initial state is known,
 * then:
 *
 *   - not signed in            → redirect to login.html
 *   - signed in, not authorized → sign out + redirect to login.html with
 *                                  ?denied=1 (login.html shows a message)
 *   - signed in and authorized  → resolves with { uid, email }
 *
 * "Authorized" means a /researchers/{uid} document exists — see
 * firestore.rules. That document can only be created by the project owner
 * (Firebase Console or Admin SDK), never from this website, so a stranger
 * who somehow creates a Firebase Auth account still cannot see any
 * participant data.
 *
 * This module is the ONLY place that decides "is this visitor allowed on
 * a researcher page" — every page defers to it rather than re-implementing
 * the check.
 */
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { auth, db } from "../firebase/config.js";

function goToLogin(reason) {
  const suffix = reason ? `?${reason}=1` : "";
  window.location.href = `login.html${suffix}`;
}

/**
 * Resolves with { uid, email } once an authorized researcher session is
 * confirmed. Never resolves otherwise — it redirects instead. Call this
 * first, before rendering any research data.
 */
export function requireResearcher() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        goToLogin();
        return;
      }

      try {
        const researcherDoc = await getDoc(doc(db, "researchers", user.uid));
        if (!researcherDoc.exists()) {
          await signOut(auth);
          goToLogin("denied");
          return;
        }
      } catch (err) {
        // A permissions error here almost always means "not authorized"
        // (the rules only allow a researcher to read their own doc), so
        // treat it the same as a missing doc rather than leaving the
        // visitor stuck on a blank page.
        // eslint-disable-next-line no-console
        console.error("VERIFY-AI: researcher authorization check failed", err);
        await signOut(auth).catch(() => {});
        goToLogin("denied");
        return;
      }

      resolve({ uid: user.uid, email: user.email || "" });
    });
  });
}

/** Wires up a logout button (or any element) present on every shell page. */
export function initLogout(elementId = "logout-btn") {
  const btn = document.getElementById(elementId);
  if (!btn) return;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      await signOut(auth);
    } finally {
      window.location.href = "login.html";
    }
  });
}
