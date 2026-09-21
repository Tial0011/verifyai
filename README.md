# VERIFY-AI Clinical Research Platform

## Project Overview

This project is a controlled web-based research platform for a multicentre randomized study investigating whether structured AI verification can reduce harmful overreliance on AI in clinical decision-making.

The platform is **not** intended to be a normal educational AI application, chatbot, diagnostic assistant, tutor, LMS, or gamified quiz platform. Its purpose is to provide a controlled experimental environment in which participants complete standardized clinical cases and their decision pathway is recorded for research.

The research team owns the study logic, clinical content, randomization specification, approved participant fields, and outcome definitions. The developer implements the approved specification and should not invent clinical or research logic.

## Confirmed Technology Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend / database / authentication:** Firebase
- **Hosting/deployment:** Netlify
- **Architecture:** Modular, organized, maintainable files
- **JavaScript:** ES modules where appropriate

The project should avoid putting application logic directly inside HTML.

### HTML rule

HTML files should contain only the necessary page structure and references to external resources, for example:

- CSS `<link>` references
- JavaScript `<script type="module">` references
- Semantic HTML markup

Do not place large JavaScript blocks, Firebase logic, styling, configuration, or business logic directly inside HTML.

## Project Organization Principles

Keep responsibilities separated.

A possible structure (to be refined as development progresses):

```text
verify-ai/
├── index.html
├── participant/
│   ├── entry.html
│   ├── baseline.html
│   ├── cases.html
│   ├── ai.html
│   ├── verify.html
│   └── complete.html
├── researcher/
│   ├── login.html
│   ├── dashboard.html
│   ├── participants.html
│   ├── cases.html
│   └── exports.html
├── css/
│   ├── main.css
│   ├── landing.css
│   ├── participant.css
│   └── researcher.css
├── js/
│   ├── main.js
│   ├── firebase/
│   │   ├── config.js
│   │   ├── auth.js
│   │   └── firestore.js
│   ├── participant/
│   ├── researcher/
│   ├── components/
│   ├── services/
│   └── utils/
├── assets/
│   ├── images/
│   └── icons/
├── firestore.rules
├── firestore.indexes.json
├── netlify.toml
└── README.md
```

This is a **possible structure, not a final locked structure**. Files should only be created when they have a clear responsibility.

## Current UI Scope

### Phase 1: Landing Page Only

The first implementation/design task is **ONLY the landing page**.

Do not build the participant entry page, baseline questionnaire, randomization screen, clinical case interface, AI screen, VERIFY-AI flow, researcher dashboard, or other later screens yet.

The landing page should introduce the research study and give participants enough information to understand what they are about to do before selecting **Get Started**.

The exact wording, required information, study branding, consent language, and any other research-specific content remain subject to approval by the research team.

The landing page should therefore be designed in a way that allows approved content to be inserted without requiring a redesign.

## Research Flow Confirmed at a High Level

The broader platform is expected to eventually follow this general flow:

```text
Landing Page
    ↓
Participant Information / Entry
    ↓
Approved Baseline Questions
    ↓
Randomization
    ↓
Clinical Cases
    ↓
 ┌──────────────┬──────────────────┬─────────────────────┐
 │ No-AI        │ Standard AI      │ AI + VERIFY-AI      │
 └──────────────┴──────────────────┴─────────────────────┘
    ↓
Final decisions / required research measurements
    ↓
Completion / debriefing
```

This broader flow is documented here for architectural context only. **It is not a request to build all of these screens now.**

## Important Research Constraints

The research brief establishes several important principles:

- The platform is a controlled research environment.
- Participants are assigned to one of three study groups.
- Randomization must be automatic and concealed as much as possible.
- A participant must not receive a different group simply by refreshing.
- The AI recommendations used in the AI arms are pre-generated and locked.
- Groups receiving AI must receive the same corresponding locked AI outputs.
- Clinical cases and research logic will be supplied/approved by the research team.
- Raw participant decision data must be preserved.
- The platform should not provide live AI-generated clinical information.
- The platform should not turn into a chatbot, tutor, diagnostic engine, or normal learning application.

## Firebase Usage and Cost/Quota Awareness

Firebase usage must be handled carefully.

We need to **actively monitor Firebase reads and writes** during development and testing because unnecessary database operations can consume quota and increase costs or create avoidable limits.

### Development rules

- Do not repeatedly read the same Firestore document when the data can be cached locally.
- Do not use Firestore listeners (`onSnapshot`) everywhere by default.
- Prefer one-time reads where real-time updates are not required.
- Avoid unnecessary writes caused by every keystroke or UI change.
- Do not repeatedly write temporary UI state to Firestore.
- Batch related writes where appropriate.
- Keep participant data writes intentional and tied to actual research events.
- Avoid polling Firestore when it is not necessary.
- Be careful with page refreshes so they do not create duplicate reads/writes or duplicate records.
- Separate participant-facing data from researcher-only data.
- Use Firestore Security Rules to restrict access.
- Test database behavior before large-scale pilot testing.
- Monitor Firebase console usage during development and pilot testing.
- Keep the number of reads/writes predictable and documented.

### Important

Firebase should **not** be treated like local application state.

We should decide deliberately:

> What must be stored in Firebase?

> When exactly should it be written?

> When can data remain in browser memory/session state?

> When does the participant actually need to read from Firebase?

This is especially important because the research platform may eventually have many participants completing multiple cases.

## Security Principles

Security is part of the architecture from the beginning.

Never expose sensitive research metadata unnecessarily to the participant client, especially information such as:

- Gold diagnosis
- AI correctness
- Hidden scoring metadata
- Research-only variables
- Researcher/admin data

Participant-facing data and researcher-only data should be separated wherever practical.

Firebase configuration values intended for client-side Firebase initialization are not a replacement for Firestore Security Rules. Access control must be enforced by the backend/security rules rather than relying only on hidden frontend code.

## Development Rules

1. Follow the research brief.
2. Do not invent research variables or clinical logic.
3. Ask the research team for approval when a required research detail is unspecified.
4. Keep the frontend modular.
5. Keep HTML clean.
6. Keep CSS in external stylesheets.
7. Keep JavaScript in organized external modules.
8. Avoid unnecessary dependencies.
9. Keep participant and researcher functionality separated.
10. Preserve raw research data.
11. Think about Firebase reads/writes before implementing database operations.
12. Test refresh/reload behavior carefully.
13. Do not build future screens prematurely when the current task is only one approved screen.
14. Prioritize research integrity over flashy features.

## Current Development Task

**Design and implement the landing page only.**

The landing page is the first experience a participant has with the study.

It should be professional, trustworthy, accessible, responsive, and clearly communicate the purpose and expectations of the study without revealing experimental group allocation or unnecessary research information.

The primary call to action is:

**Get Started**

The destination and exact behavior of the button will be implemented when the participant entry page is approved.

## Future Architecture Notes

As development progresses, the application should eventually have clear separation between:

- UI/page rendering
- Firebase services
- authentication
- Firestore data access
- participant session state
- research-case logic
- timing
- randomization integration
- validation
- researcher/admin functions
- exports
- utility functions

Do not create all of these modules just for the sake of creating folders. Add them as their responsibilities become necessary.

## Source of Truth

The research team's approved protocol and developer brief are the source of truth for:

- participant eligibility
- participant information collected
- randomization
- clinical cases
- AI recommendations
- VERIFY-AI procedure
- outcome definitions
- timing requirements
- data fields
- pilot/main-study separation
- privacy and research requirements

Technical implementation decisions may be made by the developer, but they must not change the approved research design.

---

**Status:** Participant flow implemented for all three study arms.
Researcher dashboard, participant data views, and CSV export implemented
(Phase 3).

### Recent additions

**Loading / network states.** `js/utils/loading.js` is the single source
of loading UI (button spinners, page-transition overlay, slow-operation
hint, offline banner). The final submission screen has explicit idle /
busy / offline / failed / success states: a failed submit never clears
local state, always says so in plain language, and its retry reuses the
same idempotency key, so retrying cannot create a duplicate record or
consume a second VA ID.

**Filter-aware exports.** The three arms don't produce the same
variables, so exporting a No-AI-only selection no longer attaches 8
questions' worth of structurally-blank AI and VERIFY-AI columns. The
export page's "Only include columns that apply to this selection"
option (on by default) drops column groups no participant in the
selection can populate — 63 columns for a No-AI export vs 159 for an
unfiltered one. Turning it off always gives the full set. The rule
depends only on which arms are present, never on whether an individual
left a field blank, so two exports of the same selection are always
identical. See the header comment in `js/researcher/csv.js`.

**Session duration.** `js/utils/duration.js` records three durations
rather than one — `totalSeconds` (entry form → submit), `assessmentSeconds`
(first question → last question) and `activeSeconds` (sum of per-question
time, excluding gaps between questions). All three are derivable from the
raw timestamps, so records written before this change still report timing
correctly. Shown on the participant's confirmation screen, the
participants table, the participant detail page, the dashboard (median),
and both CSV exports.

> **Open item for the research team:** which of the three durations is
> the primary timing outcome for the protocol. All three are exported
> rather than one being chosen, since that is a research-design decision.


**Stack:** HTML + CSS + JavaScript + Firebase (Firestore + Authentication) + Netlify

**Current scope:** Landing page → participant entry/consent → 8-question
clinical assessment in one of three conditions (No-AI, Standard AI,
AI + VERIFY-AI) → single final Firestore submission. A separate
`researcher/` area gives the research team a real-time dashboard,
participant search/filter/detail views, and two analysis-ready CSV
exports — all read-only, gated by Firebase Authentication plus a manual
researcher allowlist.

See `docs/THREE-ARM-IMPLEMENTATION.md` for how the arms are implemented,
what data is recorded, and the open items awaiting research-team sign-off.

See `docs/PHASE-3-RESEARCHER-DASHBOARD.md` for the researcher dashboard's
architecture, the Firebase Console setup required (creating a researcher
account, granting it access), the security model, and a step-by-step test
procedure.
