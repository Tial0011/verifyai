# VERIFY-AI — Phase 3: Researcher Dashboard, Data Views & Export

This document describes what was built in Phase 3 (the researcher/admin
side), exactly what needs to be configured by hand in the Firebase
Console before it will work, and how to test it end to end.

**The participant side was not changed in any way that affects the
participant experience.** The only participant-facing edit is two new
"Researcher login" links on `index.html` (header nav + footer) — nothing
in `participant/`, the clinical questions, the AI suggestions, or the
Firestore write path for participants was touched. One non-behavioral
addition was made to `js/participant/study-arm.js`: an `INSTITUTION_LABELS`
export (institution value → display name), added so the researcher pages
don't hard-code the same three institution names a second time. It's a
new export only — nothing existing in that file changed, and no
participant-facing code imports it.

---

## 1. What was built

- **Researcher login** (`researcher/login.html`) — Firebase Authentication
  email/password sign-in. No public registration exists anywhere.
- **Authorization layer** — signing in is not enough. A researcher also
  needs a `/researchers/{uid}` allowlist document (see §3). This is
  enforced both in the UI (`js/researcher/guard.js`) and, more
  importantly, in Firestore Security Rules — the actual security
  boundary.
- **Dashboard** (`researcher/dashboard.html`) — real-time KPI cards (total
  participants, completion count, top universities, top study
  conditions), a live "recent submissions" feed, breakdown bars by
  university and by study condition, and a toast when a new submission
  arrives — all driven by one Firestore `onSnapshot` listener, so nothing
  requires a page refresh.
- **Participants** (`researcher/participants.html`) — a live, searchable,
  filterable table (search by participant ID; filter by university, study
  condition, completion status — filter options are generated from
  whatever values actually exist in the data, never hard-coded).
- **Participant detail** (`researcher/participant-details.html`) — every
  one of the 8 responses for one participant: initial vs. final answer,
  whether the answer changed, confidence, full timing (started / answer
  selected / completed / time taken), the AI suggestion and whether the
  final answer matched it (AI arms), and the full six-step VERIFY-AI
  evaluation (VERIFY-AI arm only). Fields that were never recorded show
  "Not recorded" rather than a blank or a guess. This page is read-only —
  there is no edit or delete control anywhere in it.
- **Export** (`researcher/export.html`) — two CSV downloads, optionally
  filtered by university/study condition, always built from the same live
  data the dashboard shows (see §5 for the exact column structure).

All four protected pages share `js/researcher/guard.js` (auth +
authorization check), `js/researcher/store.js` (the one Firestore
listener), and `js/researcher/format.js` (formatting helpers) — so there's
a single place that decides "is this visitor allowed here" and a single
place that talks to Firestore.

## 2. Files created / modified

**Created**
- `researcher/login.html`, `researcher/dashboard.html`,
  `researcher/participants.html`, `researcher/participant-details.html`,
  `researcher/export.html`
- `js/researcher/guard.js`, `js/researcher/store.js`,
  `js/researcher/format.js`, `js/researcher/csv.js`
- `js/researcher/login.js`, `js/researcher/dashboard.js`,
  `js/researcher/participants.js`, `js/researcher/participant-details.js`,
  `js/researcher/export.js`
- `css/researcher.css`
- `docs/PHASE-3-RESEARCHER-DASHBOARD.md` (this file)

**Modified**
- `index.html` — added a "Researcher login" link to the header nav and
  the footer. No other change.
- `js/firebase/config.js` — added and exported `auth` (Firebase Auth),
  alongside the existing `db` export. Participant-side files never import
  `auth`.
- `js/participant/study-arm.js` — added the `INSTITUTION_LABELS` export
  described above. No existing export changed.
- `firestore.rules` — added read access for authorized researchers (see
  §3). The participant-facing rules (create-once, shape validation,
  counter, locks) are unchanged.
- `README.md` — status line + pointer to this document.

## 3. Firebase Console setup (manual — required)

This app has no backend server and no Cloud Functions — by design (see
the existing README security principles). That means researcher
authorization has to be a manual, console-side step rather than a
self-service sign-up flow. Do this once per researcher:

1. **Create the researcher's sign-in account.**
   Firebase Console → **Authentication** → **Users** → **Add user** →
   enter their email and a temporary password (or send them a password
   reset email after creating the account with any password). They'll
   sign in with this at `researcher/login.html`.

2. **Copy that user's UID.**
   Still on the Authentication → Users list, copy the "User UID" column
   value for the account you just created.

3. **Grant them dashboard access.**
   Firebase Console → **Firestore Database** → **Data** tab → start a new
   document:
   - Collection: `researchers` (create it if it doesn't exist yet)
   - Document ID: paste the UID from step 2 (exactly — this is what the
     security rules check)
   - Fields: anything, or nothing — the rules only check that the
     document *exists*, not its content. A single field like
     `addedAt: <timestamp>` is enough for your own record-keeping.
   - Save.

That researcher can now sign in and reach the dashboard. To revoke
access, delete their `/researchers/{uid}` document (their Firebase Auth
account can stay or be disabled separately) — Firestore rules re-check on
every read, so this takes effect immediately, no redeploy needed.

There is no path anywhere in the website's code that can create, list, or
modify a `/researchers/*` document — the rules make every one of those
client-side operations `false`. The only way in is the Firebase Console
or the Admin SDK.

## 4. Firestore Security Rules

The relevant additions (full file: `firestore.rules`):

```
function isResearcher() {
  return request.auth != null &&
    exists(/databases/$(database)/documents/researchers/$(request.auth.uid));
}

match /participants/{participantId} {
  allow get, list: if isResearcher();
  allow create: if isParticipantShapeValid(request.resource.data);
  allow update, delete: if false;
}

match /researchers/{uid} {
  allow get: if request.auth != null && request.auth.uid == uid;
  allow list, create, update, delete: if false;
}
```

What this guarantees:
- **No public read access to participant data**, at any time, under any
  circumstance — `get`/`list` on `/participants/*` require `isResearcher()`,
  which requires both a signed-in Firebase Auth user AND a matching
  `/researchers/{uid}` document.
- **Researchers get read-only access.** `update` and `delete` on
  `/participants/*` are `false` regardless of who's asking — including an
  authorized researcher. The dashboard UI has no edit/delete controls to
  match.
- **The researcher allowlist can't be self-granted.** A signed-in user
  can `get` (check) only their *own* `/researchers/{uid}` doc; `create`,
  `update`, `delete`, and `list` are all `false` from the client, for
  everyone, always.
- **No secrets in the frontend.** `js/firebase/config.js` still only
  contains the public Firebase Web config (not a secret — see the
  existing comment in that file) and now also the client Auth SDK
  handle. No Admin SDK key or service-account credential exists anywhere
  in this repository.
- Everything from the pre-existing rules (participant create-once shape
  validation, the sequential-ID counter, submission locks, and the
  default-deny fallback) is unchanged.

**Deploy the updated rules** via `firebase deploy --only firestore:rules`
(or paste `firestore.rules` into Console → Firestore Database → Rules →
Publish) before testing researcher access — the previous rules had no
`/researchers/*` match at all and denied all participant reads.

## 5. Firestore indexes

**None required.** The dashboard, participants table, and export page all
use a single query — `participants` ordered by `createdAt` descending —
and every search/filter (by university, study condition, status, or
participant ID) is applied client-side against the data that single query
already returned. Firestore only needs a composite index when a query
combines an equality/inequality filter *with* an `orderBy` on a different
field; since no researcher page does that, `firestore.indexes.json` was
intentionally not added. If a future page needs server-side filtered
queries (e.g. the participant list grows large enough that loading
everything client-side stops being practical), that's the point to
revisit this.

## 6. Export structure

Both exports are UTF-8 with a BOM (for correct accented-character
rendering in Excel), CRLF line endings, RFC-4180-style quoting (any field
containing a comma, quote, or newline is quoted, with internal quotes
doubled), and always reflect the researcher's currently selected
university/condition filter — "all" if none is chosen.

### Export 1 — Participant Summary (one row per participant)

```
participant_id, university, study_condition, submission_date,
submission_timestamp, completion_status,

q1_initial_response, q1_final_response, q1_answer_changed, q1_confidence,
q1_started_at, q1_answered_at, q1_completed_at, q1_time_taken_seconds,
q1_ai_shown, q1_ai_suggestion, q1_answer_matches_ai,
q1_verify_validate, q1_verify_examine, q1_verify_review,
q1_verify_independently_compare, q1_verify_flag, q1_verify_yield,

... (repeated for q2 through q8)
```

`*_answer_changed`, `*_ai_shown`, and `*_answer_matches_ai` are exported
as `yes` / `no` / blank (blank = not applicable or not recorded — e.g.
`answer_changed` is always blank in the No-AI arm, and every `verify_*`
column is blank for participants outside the AI + VERIFY-AI arm).
`*_time_taken_seconds` is a plain integer (seconds from `startedAt` to
`submittedAt`), never a formatted duration string, so it's ready for
spreadsheet arithmetic. Raw ISO-8601 timestamps are exported alongside
it — nothing is overwritten.

### Export 2 — Response-Level Dataset (one row per question response)

```
participant_id, university, study_condition, question_number,
question_id, scenario_id, initial_response, final_response,
answer_changed, confidence, started_at, answered_at, completed_at,
time_taken_seconds, ai_shown, ai_suggestion, answer_matches_ai,
verify_validate, verify_examine, verify_review, verify_review_note,
verify_independently_compare, verify_flag, verify_flag_note, verify_yield
```

One row per participant per question (8 rows per participant). This is
the shape to use for per-response statistical models (e.g. timing or
AI-agreement analysis at the response level rather than the participant
level).

**Import into Google Sheets:** File → Import → Upload → select the CSV →
"Replace spreadsheet" or "Insert new sheet" → separator type "Detect
automatically". Both files have been designed to import cleanly with no
manual cleanup step.

## 7. Testing procedure

1. **Setup.** Complete §3 for one test researcher account. Deploy the
   rules from §4.
2. **Login.**
   - Open `index.html` → confirm "Researcher login" appears in the header
     and footer.
   - Click it → `researcher/login.html` loads.
   - Try an unauthorized email/password (or an account with no
     `/researchers/{uid}` doc) → confirm a clear "not authorized" message
     and no access to the dashboard.
   - Log in with the authorized test account → confirm redirect to
     `researcher/dashboard.html`.
   - Click "Log out" → confirm redirect back to `researcher/login.html`
     and that reloading `dashboard.html` directly redirects to login
     (i.e. the guard runs on every protected page, not just once).
3. **Real-time behavior.**
   - Open `researcher/dashboard.html` in Browser A (logged in).
   - In Browser B, complete a full participant submission through
     `participant/entry.html` → `cases.html` → `complete.html`.
   - Without refreshing Browser A, confirm: total participants count
     increases, the relevant university/condition counts increase, the
     new participant appears at the top of "Recent submissions", and a
     "New submission received" toast appears briefly.
   - Repeat while `researcher/participants.html` is open in Browser A —
     confirm the new row appears in the table without a refresh.
4. **Participant detail.**
   - From the participants table, click "View" on a completed
     participant from each of the three study arms (one No-AI, one
     Standard AI, one AI + VERIFY-AI participant).
   - Confirm all 8 questions render, with per-question timing (Started /
     Answer selected / Completed / Time taken).
   - Confirm the AI arms show "AI recommendation" and whether the final
     answer matched it; confirm only the AI + VERIFY-AI participant shows
     the six VERIFY-AI steps; confirm the No-AI participant shows neither.
   - Confirm there is no way to edit or delete anything on this page.
5. **Search & filters.**
   - On `researcher/participants.html`, search by a partial participant
     ID → confirm the table narrows to matches.
   - Use the university, study condition, and status filters (together
     and separately) → confirm the result count updates and only
     currently-existing values appear as filter options.
6. **Export.**
   - On `researcher/export.html`, download both CSVs with no filter
     applied → open each in Google Sheets and confirm the columns match
     §6 and every row/column lines up (no shifted columns from an
     unescaped comma/quote in a free-text VERIFY-AI answer).
   - Apply a university or study-condition filter → download again →
     confirm only the matching participants are included and the status
     line above the buttons reflects the filtered count.
7. **Security.**
   - Confirm (e.g. via the Firestore Console rules simulator, or by
     signing out and attempting a direct read) that `/participants` is
     not readable without an authorized researcher session.
   - Confirm no Admin SDK key, service-account JSON, or other secret
     exists anywhere in the repository.
   - Confirm the participant-facing pages (`participant/entry.html`,
     `cases.html`, `complete.html`) still work exactly as before — same
     questions, same flow, same single Firestore write.
