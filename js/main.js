/**
 * VERIFY-AI — Landing page behavior.
 *
 * Scope note: this file intentionally does nothing beyond small UI
 * affordances for THIS page. It does not read or write Firestore —
 * a landing page visit must cost zero database operations. Firebase
 * services will be introduced in a later phase, in their own module
 * under js/firebase/, once a specific approved requirement needs them.
 */

function initMobileNav() {
  const toggle = document.getElementById("nav-toggle-btn");
  const nav = toggle?.closest(".site-nav");
  if (!toggle || !nav) return;

  toggle.addEventListener("click", () => {
    const isOpen = nav.getAttribute("data-open") === "true";
    nav.setAttribute("data-open", String(!isOpen));
    toggle.setAttribute("aria-expanded", String(!isOpen));
  });

  // Close the menu after choosing a link, so it doesn't stay open
  // when the page scrolls to the target section.
  nav.querySelectorAll(".site-nav__links a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.setAttribute("data-open", "false");
      toggle.setAttribute("aria-expanded", "false");
    });
  });
}

function initFooterYear() {
  const el = document.getElementById("footer-year");
  if (el) el.textContent = String(new Date().getFullYear());
}

function initGetStarted() {
  // [RESEARCHER APPROVAL REQUIRED]
  // The destination for "Get started" (participant information / sign-in
  // page) is a future phase and has not been built or approved yet.
  // This placeholder prevents a dead link/navigation error in the
  // meantime rather than guessing at a route.
  const primaryStart = document.getElementById("get-started-btn");
  if (!primaryStart) return;

  primaryStart.addEventListener("click", (event) => {
    event.preventDefault();
    // eslint-disable-next-line no-console
    console.info(
      "VERIFY-AI: participant flow is not built yet — this button will link to the participant information page once that phase is approved."
    );
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initMobileNav();
  initFooterYear();
  initGetStarted();
});
