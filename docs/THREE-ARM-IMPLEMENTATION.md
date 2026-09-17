# Three-arm implementation notes

## The three conditions

| Arm | `studyCondition` value | AI suggestion | VERIFY-AI workflow |
| --- | --- | --- | --- |
| No-AI | `no_ai` | No | No |
| Standard AI | `standard_ai` | Yes | No |
| AI + VERIFY-AI | `ai_verify_ai` | Yes | Yes |

All three run through the same page (`participant/cases.html`) and the same
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

## Assessment content

`js/participant/case-data.js` holds 8 scenarios, each with Question A and
Question B — 16 questions, presented one per screen with the scenario vignette
shown above each. Option order and content are exactly as supplied. Scenario
headings are shown as neutral text ("Scenario 3 of 8") because the diagnostic
headings in the brief would give away Question A.

The answer key is not in the client at all. No correctness feedback is shown at
any point during the assessment.

## Data recorded per question

Saved to `localStorage` as the participant progresses, then written to
Firestore once at final submission:

`scenarioId`, `questionId`, `questionIndex`, `studyArm`, `aiSuggestionShown`,
`aiSuggestion` (option id + label, or `null`), `verifyWorkflowShown`,
`finalAnswerOptionId`, `finalAnswerLabel`, `confidence`, `verifyResponses`
(six step keys, each with a value and optional note), `independentAnswerOptionId`,
`answerChangedAfterAi`, `answerMatchesAiSuggestion`, `startedAt`,
`aiSuggestionShownAt`, `submittedAt`, `completed`.

Participant ID is generated at submission (`VA001`, `VA002`, …) by the existing
transaction in `js/firebase/submission.js`.

## Decisions confirmed by the research team (2026-09-17)

1. **AI answer profile.** All 16 locked AI suggestions point at the correct
   option. No discordant AI advice is used. Analysis consequence: agreement with
   the AI cannot be separated from a correct independent answer, so the AI arms
   measure adherence to correct AI advice rather than harmful overreliance.
2. **Site-to-arm mapping.** Ibadan → No-AI; Ondo → AI + VERIFY-AI; Babcock →
   Standard AI.
3. **VERIFY-AI wording.** The prompt text and response options in
   `verify-workflow.js` are approved as written.
4. **Standard AI arm.** No pre-AI answer step is added; the flow stays as
   specified in the brief. `answerChangedAfterAi` is therefore `null` in that
   arm, and `answerMatchesAiSuggestion` (agreement with the AI) is the recorded
   measure. A genuine switch measure exists only in the AI + VERIFY-AI arm, via
   the "Independently Compare" step.

## Still open

- **Confidence rating.** Retained from the existing implementation and asked
  after every question; confirm this is wanted on all 16 items.
