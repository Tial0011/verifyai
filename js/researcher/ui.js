/**
 * VERIFY-AI — shared loading / error UI for researcher pages.
 */

const SLOW_LOAD_MS = 15000;

function loadingEl() {
  return document.getElementById("loading-state");
}

/**
 * Called once the first snapshot arrives.
 */
export function markLoaded(watchdog) {
  if (watchdog) clearTimeout(watchdog);

  const el = loadingEl();
  if (el) el.hidden = true;
}

/**
 * If Firebase has not returned data after 15 seconds,
 * show a proper connection error instead of loading forever.
 */
export function startSlowLoadHint() {
  return setTimeout(() => {
    const el = loadingEl();

    if (!el || el.hidden || el.classList.contains("r-loading--error")) {
      return;
    }

    el.classList.add("r-loading--error");
    el.setAttribute("role", "alert");

    el.innerHTML = `
      <span>
        <strong>Unable to load research data.</strong>
        <span>
          The study database is taking too long to respond.
          Please check your internet connection and try again.
        </span>
        <button
          type="button"
          id="research-data-retry"
          class="r-retry-btn"
        >
          Retry
        </button>
      </span>
    `;

    document
      .getElementById("research-data-retry")
      ?.addEventListener("click", () => {
        window.location.reload();
      });
  }, SLOW_LOAD_MS);
}

function messageFor(error) {
  const code = error && error.code ? String(error.code) : "";

  if (code === "permission-denied") {
    return {
      title: "Access to participant data was denied.",
      detail:
        "Your researcher account does not currently have permission to read participant data.",
    };
  }

  if (code === "failed-precondition") {
    return {
      title: "The participants query needs setup.",
      detail:
        "Firestore reported a missing index or another required configuration.",
    };
  }

  if (
    code === "unavailable" ||
    code === "network-timeout" ||
    code === "deadline-exceeded"
  ) {
    return {
      title: "Could not reach the study database.",
      detail: "Please check your internet connection and try again.",
    };
  }

  return {
    title: "Could not load research data.",
    detail: "Please check your connection and try again.",
  };
}

export function showLoadError(error, hasLoadedOnce, watchdog) {
  if (watchdog) clearTimeout(watchdog);

  if (hasLoadedOnce) return;

  const el = loadingEl();

  if (!el) return;

  const { title, detail } = messageFor(error);

  el.hidden = false;
  el.classList.add("r-loading--error");
  el.setAttribute("role", "alert");

  el.innerHTML = `
    <span>
      <strong>${title}</strong>
      <span>${detail}</span>
      <button
        type="button"
        id="research-data-retry"
        class="r-retry-btn"
      >
        Retry
      </button>
    </span>
  `;

  document
    .getElementById("research-data-retry")
    ?.addEventListener("click", () => {
      window.location.reload();
    });
}
