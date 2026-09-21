/**
 * VERIFY-AI — shared loading / error UI for researcher pages that use the
 * live participants listener (dashboard, participants, export).
 *
 * Without this, a failed listener (rules not deployed, researcher doc
 * missing, bad Firebase config, network) left the page on the
 * "Loading research data…" spinner forever with no explanation.
 */

const SLOW_LOAD_MS = 10000;

function loadingEl() {
  return document.getElementById("loading-state");
}

/** Called once the first snapshot arrives — hides the loader, cancels the watchdog. */
export function markLoaded(watchdog) {
  if (watchdog) clearTimeout(watchdog);
  const el = loadingEl();
  if (el) el.hidden = true;
}

/**
 * If no data has arrived after 10s, replace the spinner text with a hint
 * instead of spinning silently. Returns the timer id (pass to markLoaded).
 * The spinner is left in place — data may still arrive on a slow network.
 */
export function startSlowLoadHint() {
  return setTimeout(() => {
    const el = loadingEl();
    if (!el || el.hidden || el.classList.contains("r-loading--error")) return;
    const text = el.querySelector("span:last-child");
    if (text) {
      text.textContent =
        "Still connecting to the study database… If this doesn't clear, check your connection and the Firebase config.";
    }
  }, SLOW_LOAD_MS);
}

function messageFor(error) {
  const code = error && error.code ? String(error.code) : "";
  if (code === "permission-denied") {
    return {
      title: "Access to participant data was denied.",
      detail:
        "The published Firestore rules must allow reads for researchers, and your account needs a document at researchers/{your UID} in Firestore.",
    };
  }
  if (code === "failed-precondition") {
    return {
      title: "The participants query needs setup.",
      detail: "Firestore reported a missing index or precondition. See the browser console for the exact link.",
    };
  }
  if (code === "unavailable") {
    return {
      title: "Could not reach the study database.",
      detail: "Check your internet connection and reload the page.",
    };
  }
  return {
    title: "Could not load research data.",
    detail: "See the browser console for details, then reload the page.",
  };
}

/**
 * Shows a readable error in place of the spinner — but only if data has
 * never loaded. If content is already on screen (a later connection
 * drop), the caller's live-pill "interrupted" state is enough and the
 * stale-but-valid data stays visible.
 *
 * @param {Error & {code?: string}} error
 * @param {boolean} hasLoadedOnce
 * @param {number} [watchdog] timer id from startSlowLoadHint
 */
export function showLoadError(error, hasLoadedOnce, watchdog) {
  if (watchdog) clearTimeout(watchdog);
  if (hasLoadedOnce) return;
  const el = loadingEl();
  if (!el) return;
  const { title, detail } = messageFor(error);
  el.hidden = false;
  el.classList.add("r-loading--error");
  el.setAttribute("role", "alert");
  el.innerHTML = `<span><strong></strong><span></span></span>`;
  el.querySelector("strong").textContent = title;
  el.querySelector("span > span").textContent = detail;
}
