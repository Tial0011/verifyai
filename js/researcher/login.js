/**
 * VERIFY-AI — researcher login.
 *
 * Signs a researcher in with Firebase Authentication (email/password).
 * Authentication success alone does not imply dashboard access — that's
 * checked by guard.js on the protected pages themselves, using the
 * /researchers/{uid} allowlist. This page's job is only sign-in + surfacing
 * a clear error, plus redirecting an already-signed-in, already-authorized
 * researcher straight past the login form.
 *
 * No public "create account" path exists anywhere in this file or its
 * markup — researcher accounts are created by the project owner in the
 * Firebase Console (Authentication tab), per README.
 */
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { auth, db } from "../firebase/config.js";
import { clearLoggedOutFlag } from "./guard.js";
import { setButtonLoading, isOffline } from "../utils/loading.js";

function showError(message) {
  const el = document.getElementById("auth-error");
  el.textContent = message;
  el.setAttribute("data-visible", "true");
}

function hideError() {
  const el = document.getElementById("auth-error");
  el.setAttribute("data-visible", "false");
}

function friendlyAuthError(err) {
  switch (err.code) {
    case "auth/invalid-email":
      return "That email address doesn't look valid.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
      return "We couldn't reach the authentication service. Check your connection and try again.";
    default:
      return "We couldn't sign you in. Please try again.";
  }
}

async function isAuthorizedResearcher(uid) {
  try {
    const snap = await getDoc(doc(db, "researchers", uid));
    return snap.exists();
  } catch {
    return false;
  }
}

function readDeniedParam() {
  const params = new URLSearchParams(window.location.search);
  return params.get("denied") === "1";
}

document.addEventListener("DOMContentLoaded", () => {
  // Coming to the login page means they want in again — stop treating
  // admin URLs as "just logged out, send to the public site".
  clearLoggedOutFlag();

  if (readDeniedParam()) {
    showError("That account is not authorized for researcher access.");
  }

  // If already signed in AND authorized, skip straight to the dashboard.
  onAuthStateChanged(auth, async (user) => {
    if (user && (await isAuthorizedResearcher(user.uid))) {
      window.location.replace("dashboard.html");
    }
  });

  const form = document.getElementById("login-form");
  const loginBtn = document.getElementById("login-btn");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideError();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!email || !password) {
      showError("Please enter both your email and password.");
      return;
    }

    if (isOffline()) {
      showError("You appear to be offline. Check your connection and try again.");
      return;
    }

    // Sign-in is two round trips (Firebase Auth, then the /researchers
    // allowlist read), so on a poor connection this is a real wait.
    setButtonLoading(loginBtn, true, "Signing in…");

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const authorized = await isAuthorizedResearcher(credential.user.uid);
      if (!authorized) {
        await auth.signOut();
        showError("That account is not authorized for researcher access.");
        return;
      }
      window.location.replace("dashboard.html");
    } catch (err) {
      showError(friendlyAuthError(err));
    } finally {
      setButtonLoading(loginBtn, false);
    }
  });
});
