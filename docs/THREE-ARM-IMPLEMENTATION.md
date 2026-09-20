# Three-arm implementation notes

## The three conditions

| Arm | `studyCondition` value | AI suggestion | VERIFY-AI workflow |
| --- | --- | --- | --- |
| No-AI | `no_ai` | No | No |
| Standard AI | `standard_ai` | Yes | No |
| AI + VERIFY-AI | `ai_verify_ai` | Yes | Yes |

In the two AI arms the suggestion is **withheld until the participant has
committed to their own answer** (see "Answer-first flow" below). All three run
through the same page (`participant/cases.html`) and the same
runner (`js/participant/cases.js`); the runner branches on the arm returned by
`js/participant/study-arm.js`.

## No AI request is ever made

There is no AI API call anywhere in this application, in any arm. AI output is
pre-generated and locked in `js/participant/case-data.js`, per the README
("the AI recommendations used in the AI arms are pre-generated and locked" /
"the platform should not provide live AI-generated clinical information").

For the No-AI arm the runner additionally never renders any AI markup at all —
`renderAiPanel()` is not called, so there is no AI panel, no AI text and no AI
control in the DOM to find or re-enable.

## Allocation

Allocation is by site, in `ARM_BY_INSTITUTION` (`js/participant/study-arm.js`).
The arm is resolved once on the entry page, stored on the participant draft,
and copied onto the study-progress object at the first question. Refreshing,
navigating back, or a later change to the mapping cannot move a participant
who is already in progress. The arm is never displayed to the participant.

## Answer-first flow (AI arms)

In Standard AI and AI + VERIFY-AI the AI suggestion is withheld until the
participant makes a first pick, all on one screen:

1. The participant sees the scenario, question and options only. No AI markup
   is in the DOM.
2. The moment they pick an answer, that **first pick is recorded**
   (`initialAnswerOptionId`) and the locked AI suggestion appears below the
   options. In the VERIFY-AI arm the six-step check appears with it. The
   confidence rating and the submit button appear at the same time.
3. The participant can **re-pick freely**. The answer submitted is the final
   answer; the first pick is never overwritten.

If the page is refreshed after the reveal, the suggestion is shown again with
the first pick pre-selected. The No-AI arm has a single screen with no
suggestion and no reveal.

## Assessment content

`js/participant/case-data.js` holds 8 scenarios with one question each — 8
questions, presented one per screen with the scenario vignette shown above
each. The earlier follow-up "B" questions were removed; question ids remain
`1A`…`8A` so they stay aligned with the researcher-held answer key, but the
participant only sees "Question 1 of 8" etc. Option order and content are exactly as supplied. Scenario
headings are shown as neutral text ("Scenario 3 of 8") because the diagnostic
headings in the brief would give away Question A.

The answer key is not in the client at all — `case-data.js` never held it, and
it is not shipped with this project folder. It is kept as a separate,
researcher-only document that must never be added to this repo or deployed
(handed to you outside this zip). No correctness feedback is shown at
any point during the assessment.

## Data recorded per question

Saved to `localStorage` as the participant progresses, then written to
Firestore once at final submission:

`scenarioId`, `questionId`, `questionIndex`, `studyArm`, `aiSuggestionShown`,
`aiSuggestion` (option id + label, or `null`), `verifyWorkflowShown`,
`initialAnswerOptionId`, `initialAnswerLabel`, `initialAnswerAt` (AI arms —
the participant's own answer, locked before the suggestion is shown),
`finalAnswerOptionId`, `finalAnswerLabel`, `confidence`, `verifyResponses`
(six step keys, each with a value and optional note), `independentAnswerOptionId`,
`answerChangedAfterAi`, `answerMatchesAiSuggestion`, `startedAt`,
`aiSuggestionShownAt`, `submittedAt`, `completed`.

`aiSuggestionShown`, `aiSuggestion`, `verifyWorkflowShown` and
`aiSuggestionShownAt` are set at the moment the suggestion is revealed (step
2), not when the question first loads.

Participant ID is generated at submission (`VA001`, `VA002`, …) by the existing
transaction in `js/firebase/submission.js`.

## Decisions confirmed by the research team (2026-09-17)

1. **AI answer profile (revised).** AI suggestion is correct on **1A, 4A,
   5A, 7A** and discordant (points at a plausible wrong option) on **2A, 3A,
   6A, 8A**. Changes from the previous profile: 1A and 5A now point at the
   correct option; 2A now points at Placental abruption and 6A at Acute
   pancreatitis (both plausible distractors). 3A, 4A, 7A and 8A are
   unchanged. The suggestion shown/recorded is always the locked value in
   `case-data.js` — no per-arm difference in which items are discordant.
2. **Site-to-arm mapping.** Ibadan → No-AI; Ondo → AI + VERIFY-AI; Babcock →
   Standard AI.
3. **VERIFY-AI wording.** The prompt text and response options in
   `verify-workflow.js` are approved as written.
4. **Standard AI arm — superseded.** Originally no pre-AI answer step was
   added. Now both AI arms record the participant's first pick before the
   suggestion appears, so `answerChangedAfterAi` (first pick vs. final answer)
   is measured in both AI arms and is `null` only in No-AI.

## Still open

- **Confidence rating.** Retained from the existing implementation and asked
  once per question, alongside the final answer; confirm this is wanted on
  all 8 items.
- **VERIFY-AI step 4 (Independently Compare).** Its approved wording is
  unchanged, but it now asks for the answer "on your own reasoning" after the
  participant has already given one. It is still recorded
  (`independentAnswerOptionId`); confirm whether the step should stay as is.
- **Participant-facing time estimate.** `index.html` still says 10–15
  minutes; that copy was written for 16 questions.
