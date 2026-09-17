# VERIFY-AI — answer key (RESEARCHER-ONLY — do not deploy)

This file is deliberately **not** part of the `verify-ai/` project folder and
must never be committed to the site's Git repo, added to the Netlify deploy,
or placed anywhere under a served path. `js/participant/case-data.js` ships
straight to the participant's browser — anything in it is visible via
"View Source" / dev tools — so the correct answer is intentionally kept out
of that file, and out of the deployed site entirely. Keep this document
somewhere private (your own notes, a private drive, etc.).

## Correct answer for every question: **B**

| Scenario | Question | Correct option | Correct answer text |
|---|---|---|---|
| 1 | 1A | B | Inferior STEMI |
| 1 | 1B | B | Urgent reperfusion therapy (primary PCI or fibrinolysis) plus aspirin, a P2Y12 inhibitor, and anticoagulation |
| 2 | 2A | B | Placenta praevia |
| 2 | 2B | B | Digital vaginal examination |
| 3 | 3A | B | Simple febrile seizure |
| 3 | 3B | B | Manage the fever, look for the source of infection, observe, and reassure/educate the caregiver |
| 4 | 4A | B | Testicular torsion |
| 4 | 4B | B | Urgent urology referral for surgical exploration, without letting imaging delay definitive treatment |
| 5 | 5A | B | Decompensated heart failure |
| 5 | 5B | B | Oxygen if hypoxaemic, IV loop diuretic (e.g., furosemide), fluid/salt restriction as appropriate, and treatment of the precipitating cause |
| 6 | 6A | B | Perforated peptic ulcer |
| 6 | 6B | B | Nil by mouth, IV fluids, nasogastric decompression, IV antibiotics, analgesia, and urgent surgical review |
| 7 | 7A | B | Ruptured ectopic pregnancy |
| 7 | 7B | B | Immediate resuscitation (IV access and fluids, group and cross-match) with urgent gynaecological review for emergency surgery |
| 8 | 8A | B | Bacterial meningitis/sepsis |
| 8 | 8B | B | Immediate IV access, blood cultures, fluid resuscitation, and empirical IV antibiotics without delay, with urgent admission |

**Note:** the correct answer is B for every question, regardless of what the
AI suggestion shows. It never changed — only the AI suggestion did.

## AI suggestion vs. correct answer (current build)

The AI suggestion is deliberately wrong on 8 of the 16 items. Cross-reference
against the table above when scoring `aiSuggestion.optionId` in exported data.

| Question | AI suggests | Correct | Discordant? |
|---|---|---|---|
| 1A | C (Anterior STEMI) | B | Yes |
| 1B | B | B | No |
| 2A | B | B | No |
| 2B | D (Ultrasound scan) | B | Yes |
| 3A | A (Bacterial meningitis) | B | Yes |
| 3B | A (Lumbar puncture + empirical IV antibiotics) | B | Yes |
| 4A | B | B | No |
| 4B | B | B | No |
| 5A | D (Pneumonia) | B | Yes |
| 5B | B | B | No |
| 6A | B | B | No |
| 6B | E (Discharge with oral antibiotics) | B | Yes |
| 7A | B | B | No |
| 7B | C (Methotrexate without further assessment) | B | Yes |
| 8A | A (Simple febrile illness) | B | Yes |
| 8B | B | B | No |

## Scoring off-client

Since the client never records correctness, score exported Firestore records
(`participants/{participantId}.studyResponses[i]`) against this table using
`scenarioId` + `questionId` to look up the row, then compare
`finalAnswerOptionId` to the correct option ("b") above.
