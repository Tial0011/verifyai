# Case Runner & Final Submission — Items for Researcher/Project-Owner Confirmation

This covers `participant/cases.html` + `js/participant/cases.js`,
`participant/complete.html` + `js/participant/complete.js`, and the
supporting `js/firebase/` modules. Built to the "local storage + single
Firestore write" architecture. Please confirm:

1. **Case content is entirely placeholder.** `js/participant/case-data.js`
   has 3 template cases with dummy vignettes — replace `CASES` there with
   the approved case set. The rest of the code doesn't need to change as
   long as each case keeps the shape `{ id, title, vignette,
   diagnosisPrompt, confidencePrompt }`.

2. **Diagnosis field is free text; confidence is a 1–5 scale.** Confirm
   this matches the approved instrument — e.g. whether diagnosis should
   instead be a structured/select list, and whether 1–5 is the right
   confidence scale (the entry-page AI-literacy/trust questions already
   use 1–5, so this matches that precedent, but hasn't been separately
   confirmed for case-level confidence).

3. **Final record shape (`assembleResearchRecord` in `complete.js`) is
   provisional.** It currently produces: `university`, `studyCondition`,
   `consent`, `participantInformation` (the rest of the entry-form
   fields), `studyResponses` (the array of per-case answers), and
   `timestamps.enteredAt` / `timestamps.submittedAt`. This has not been
   checked against an approved data dictionary — confirm field names and
   whether anything is missing (e.g. per-case timestamps beyond
   started/submitted) or shouldn't be collected.

4. **Firebase project is not yet connected.** `js/firebase/config.js`
   has placeholder values — it needs the real Firebase Web config for
   the VERIFY-AI project before any of this can actually run against
   Firestore.

5. **Submission architecture is the client-trusted transaction**, not a
   backend/Cloud Function: `js/firebase/submission.js` runs a Firestore
   transaction directly from the participant's browser to generate the
   sequential `VA###` ID and write the participant record, with
   `firestore.rules` as the entire security boundary. This was the
   explicit choice made for this build — flagging it here because it
   means the rules file is doing real security work, not just
   convenience validation, and should be reviewed/tested (ideally against
   the Firestore emulator: duplicate submissions, concurrent submissions,
   malformed writes, counter tampering) before this goes anywhere near
   real participants.

6. **Researcher-side read access is intentionally undefined.**
   `firestore.rules` denies `get`/`list` on `participants/*` entirely.
   Building researcher dashboards/exports will need an actual
   authenticated-researcher design (custom claims or similar) added to
   the rules — not opened up as a side effect of this change.

## What was deliberately not built

- The Standard-AI and AI+VERIFY-AI arms (Babcock, UNIMED) — `cases.js`
  and `complete.js` both check the institution and show a plain "not
  built yet" message for anything other than University of Ibadan.
- Any researcher-facing page (login, dashboard, exports).
- Retry/backoff tuning beyond "the button re-enables and the same
  idempotency key is reused" — if real-world testing shows a need for
  e.g. exponential backoff or a max-retry message, that's a follow-up.
