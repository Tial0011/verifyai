/**
 * VERIFY-AI — client-side loading & network-state UI.
 *
 * Every point where the app waits on something the participant can't see
 * — the final Firestore write, a page transition, a researcher sign-in —
 * should go through this module, so the whole platform gives the same
 * feedback instead of each page inventing its own.
 *
 * Why this matters for the study specifically: the single Firestore write
 * at the end is the ONLY moment a participant's entire session can be
 * lost to a bad connection. A participant who sees a frozen button is
 * likely to double-click it, reload, or close the tab mid-write. So the
 * submit path needs to say, unambiguously: we're working, it's slow, your
 * answers are still safe, don't close this.
 *
 * Nothing here touches Firebase, localStorage, or study logic — it is
 * presentation only, and safe to import from any page.
 *
 * Contents
 *   setButtonLoading   busy state on a button (spinner + label swap)
 *   showOverlay        full-page "please wait" for page transitions
 *   startSlowHint      "this is taking longer than usual" after a delay
 *   initNetworkBanner  offline/online banner, driven by browser events
 *   isOffline          browser's current online status
 *   withMinimumDelay   avoids sub-200ms spinner flashes
 */

/* --------------------------------------------------------------------
   Buttons
   -------------------------------------------------------------------- */

const ORIGINAL_LABEL = "vaOriginalLabel";

/**
 * Puts a button into (or out of) a busy state: inserts a spinner,
 * optionally swaps the label, and disables it so the action can't be
 * fired twice while it's in flight.
 *
 * The original label is stashed on the element itself, so calling
 * setButtonLoading(btn, false) always restores exactly what was there —
 * callers never have to remember the text.
 *
 * @param {HTMLButtonElement|null} button
 * @param {boolean} isLoading
 * @param {string} [loadingLabel] text to show while busy; omit to keep
 *   the existing label and only add the spinner.
 */
export function setButtonLoading(button, isLoading, loadingLabel) {
  if (!button) return;

  if (isLoading) {
    if (button.dataset[ORIGINAL_LABEL] === undefined) {
      button.dataset[ORIGINAL_LABEL] = button.textContent.trim();
    }
    button.classList.add("btn--loading");
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
    // aria-busy tells a screen reader the control is working rather than
    // permanently unavailable.
    button.setAttribute("aria-busy", "true");
    const label = loadingLabel || button.dataset[ORIGINAL_LABEL] || "";
    button.innerHTML = `<span class="btn__spinner" aria-hidden="true"></span><span>${escapeHtml(
      label
    )}</span>`;
    return;
  }

  button.classList.remove("btn--loading");
  button.disabled = false;
  button.setAttribute("aria-disabled", "false");
  button.removeAttribute("aria-busy");
  if (button.dataset[ORIGINAL_LABEL] !== undefined) {
    button.textContent = button.dataset[ORIGINAL_LABEL];
    delete button.dataset[ORIGINAL_LABEL];
  }
}

/* --------------------------------------------------------------------
   Full-page overlay (page transitions)
   -------------------------------------------------------------------- */

let overlayEl = null;

/**
 * Shows a full-page "working" overlay. The CSS delays its fade-in by
 * ~150ms, so a transition that completes quickly never flashes a spinner
 * at the participant — only a genuinely slow one becomes visible.
 *
 * @param {string} message
 * @returns {() => void} a function that removes the overlay again.
 */
export function showOverlay(message) {
  hideOverlay();
  overlayEl = document.createElement("div");
  overlayEl.className = "va-overlay";
  overlayEl.setAttribute("role", "status");
  overlayEl.setAttribute("aria-live", "polite");
  overlayEl.innerHTML = `
    <span class="va-overlay__spinner" aria-hidden="true"></span>
    <p class="va-overlay__message">${escapeHtml(message || "Loading…")}</p>
  `;
  document.body.appendChild(overlayEl);
  return hideOverlay;
}

export function hideOverlay() {
  if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
  overlayEl = null;
}

/* --------------------------------------------------------------------
   Slow-operation hint
   -------------------------------------------------------------------- */

/**
 * Shows an extra reassurance message if an operation hasn't finished
 * within `delayMs`. Used on the submission screen so a participant on a
 * weak connection is told their answers are still safe rather than
 * assuming the app has died.
 *
 * @param {HTMLElement|null} container element the hint is appended to
 * @param {string} message
 * @param {number} [delayMs=6000]
 * @returns {() => void} cancel function — ALWAYS call it in a `finally`,
 *   whether the operation succeeded or failed, or the hint can appear
 *   after the fact.
 */
export function startSlowHint(container, message, delayMs = 6000) {
  if (!container) return () => {};

  let hintEl = null;
  const timer = setTimeout(() => {
    hintEl = document.createElement("p");
    hintEl.className = "va-slow-hint";
    hintEl.setAttribute("role", "status");
    hintEl.textContent = message;
    container.appendChild(hintEl);
  }, delayMs);

  return () => {
    clearTimeout(timer);
    if (hintEl && hintEl.parentNode) hintEl.parentNode.removeChild(hintEl);
    hintEl = null;
  };
}

/* --------------------------------------------------------------------
   Network status
   -------------------------------------------------------------------- */

/** The browser's current view of connectivity. */
export function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * Installs a sticky top banner that appears when the browser goes
 * offline and briefly confirms when the connection returns.
 *
 * Note on scope: navigator.onLine only knows about the network
 * interface, not whether Firestore is actually reachable. It is a useful
 * early warning, not a guarantee — the submission path still has to
 * handle a failed write on its own (see complete.js).
 *
 * @param {{offlineMessage?: string, onlineMessage?: string}} [options]
 */
export function initNetworkBanner(options = {}) {
  const offlineMessage =
    options.offlineMessage ||
    "You appear to be offline. Your answers are saved on this device — keep this page open and they'll be submitted once you're back online.";
  const onlineMessage = options.onlineMessage || "You're back online.";

  let bar = null;

  function removeBar() {
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    bar = null;
  }

  function showBar(text, state) {
    removeBar();
    bar = document.createElement("div");
    bar.className = "va-netbar";
    bar.setAttribute("role", "status");
    bar.setAttribute("aria-live", "polite");
    if (state) bar.setAttribute("data-state", state);
    bar.textContent = text;
    document.body.appendChild(bar);
  }

  window.addEventListener("offline", () => showBar(offlineMessage, "offline"));
  window.addEventListener("online", () => {
    showBar(onlineMessage, "back");
    setTimeout(removeBar, 3000);
  });

  // Cover the case where the page was loaded while already offline.
  if (isOffline()) showBar(offlineMessage, "offline");
}

/* --------------------------------------------------------------------
   Misc
   -------------------------------------------------------------------- */

/**
 * Resolves a promise no sooner than `minMs`. A spinner that appears and
 * disappears within ~100ms reads as a glitch rather than as feedback, so
 * fast local operations that still show a spinner are held briefly.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} [minMs=350]
 * @returns {Promise<T>}
 */
export function withMinimumDelay(promise, minMs = 350) {
  const delay = new Promise((resolve) => setTimeout(resolve, minMs));
  return Promise.all([promise, delay]).then(([value]) => value);
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
}
