/**
 * VERIFY-AI — No-AI clinical case content.
 *
 * ⚠️ PLACEHOLDER CONTENT — NOT APPROVED CLINICAL MATERIAL. ⚠️
 *
 * Per the project's development rules, the developer does not invent
 * clinical or research logic. The three cases below exist only so the
 * case-runner template (js/participant/cases.js) has something concrete
 * to render, validate against, and be tested with. Every vignette,
 * prompt, and field here must be replaced with research-team-approved
 * content before this is used with real participants.
 *
 * This file is intentionally the ONLY place case content lives. To swap
 * in the approved case set, replace the CASES array below — nothing else
 * in cases.js/cases.html should need to change, as long as each case
 * keeps the same shape: { id, title, vignette, diagnosisPrompt,
 * confidencePrompt }.
 *
 * No AI recommendation, AI explanation, VERIFY-AI checklist, or AI
 * confidence field belongs anywhere in this file or in the No-AI case
 * flow — that's the defining property of this study arm (see README,
 * "University of Ibadan condition").
 */
export const CASES = [
  {
    id: "case-1",
    title: "Case 1 of 3",
    vignette:
      "[PLACEHOLDER VIGNETTE — approved clinical case text will be inserted here by the research team.]",
    diagnosisPrompt: "What is your initial diagnosis for this case?",
    confidencePrompt: "How confident are you in this diagnosis?",
  },
  {
    id: "case-2",
    title: "Case 2 of 3",
    vignette:
      "[PLACEHOLDER VIGNETTE — approved clinical case text will be inserted here by the research team.]",
    diagnosisPrompt: "What is your initial diagnosis for this case?",
    confidencePrompt: "How confident are you in this diagnosis?",
  },
  {
    id: "case-3",
    title: "Case 3 of 3",
    vignette:
      "[PLACEHOLDER VIGNETTE — approved clinical case text will be inserted here by the research team.]",
    diagnosisPrompt: "What is your initial diagnosis for this case?",
    confidencePrompt: "How confident are you in this diagnosis?",
  },
];
