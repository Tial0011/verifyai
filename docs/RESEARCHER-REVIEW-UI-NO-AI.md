# University of Ibadan No-AI Study Page — Items for Researcher Confirmation

This page (`participant/ui-no-ai.html`) implements the template requested
for the first No-AI clinical-case activity, plus the concurrency-safe
VA### participant-ID generation and minimal participant record that entry
now writes to Firestore on successful submission. Nothing below has been
decided by the developer — it's built so any of it can change without a
redesign. Please confirm:

1. **Clinical case content.** The vignette, diagnosis question, and any
   instructions are shown as `PLACEHOLDER — RESEARCHER CONTENT REQUIRED`.
   None of this is finalized study material.

2. **Diagnosis input format.** Currently a free-text field. Should this
   be structured (e.g. a fixed list, ICD code lookup, multi-part answer)?

3. **Confidence scale.** Currently an illustrative 1–5 scale, marked
   `PLACEHOLDER SCALE — RESEARCHER APPROVAL REQUIRED`. Confirm the scale,
   its anchors/labels, and whether 1–5 is even the right range.

4. **Exact number of cases.** `TOTAL_CASES` in
   `js/config/study-config.js` is set to 8 per the current protocol, but
   is explicitly a working number pending pilot/researcher confirmation.

5. **Case-response schema and persistence.** The Continue button on this
   page currently validates nothing and writes nothing to Firestore — it
   only shows an in-page confirmation message. `initialDiagnosis`,
   `initialConfidence`, timestamps, etc. are not implemented until the
   research team confirms the final data dictionary (see phase-2 brief
   §15/§20).

6. **Baseline-questionnaire fields.** The AI-experience/background
   questions collected on `participant/entry.html` (age, sex, AI
   exposure, etc.) are still NOT written to Firestore. Only the minimal
   schema specified in the phase-2 brief (`participantId`, `university`,
   `studyCondition`, `consentStatus`, `createdAt`) is persisted right
   now. Confirm whether/when the baseline answers should also be stored,
   and under what field names.

7. **Whether study condition should ever be shown to participants.** The
   status bar deliberately shows only Participant ID and study name —
   never "Study Arm: No AI" — per the brief's default-to-internal
   instruction. Confirm this is correct for the full study, not just
   this page.

8. **Whether the participant ID should be shown permanently** (e.g. also
   emailed, or re-displayed later) or only at the moment of registration.

9. **Exact timestamps required beyond `createdAt`** (e.g. per-case
   decision time) — not implemented yet, pending the case engine.

10. **Consent/privacy wording specific to the case activity itself** (as
    distinct from the entry-page consent) — not included on this page.

## What was deliberately not built

- Babcock University (`standard_ai`) and University of Medical Sciences
  (`verify_ai`) participant pages and flows.
- Any form of participant-level randomization or participant choice of
  study condition.
- Participant login/authentication of any kind.
- The clinical case engine beyond this first case's template.
- Any AI recommendation, AI panel (even an empty one), or AI-related
  control — this page has none, and none should be added while the
  participant is in the no_ai condition.
- A researcher dashboard or any researcher-facing read access to
  `participants`.

## Notes on how this is built, for easy revision

- The university → study-condition mapping and the set of *implemented*
  conditions both live in `js/firebase/participants.js`
  (`UNIVERSITY_STUDY_CONDITIONS`, `IMPLEMENTED_STUDY_CONDITIONS`). Adding
  Babcock or UNIMED later means building their page, adding their
  `firestore.rules` branch, and adding their condition to
  `IMPLEMENTED_STUDY_CONDITIONS` — in that order, so a condition never
  goes live in the UI before its rules branch does.
- `firestore.rules` is the actual enforcement point for the mapping
  (there's no Cloud Functions layer in this stack yet) — a participant
  document can only be created if its `university`/`studyCondition` pair
  matches an approved branch there, regardless of what the client sends.
- Participant-ID allocation and the participant-record write happen in
  one Firestore transaction (`registerParticipant` in
  `js/firebase/participants.js`), so concurrent submissions can't
  collide. See that file's comments for how the retry-on-conflict
  behavior guarantees uniqueness.
- The participant ID is only ever generated inside that transaction, which
  only runs after the entry form passes validation — never on page load.
- `js/config/study-config.js` isolates the case count and current case
  number so they can change without touching markup or logic.
