/**
 * VERIFY-AI — approved clinical assessment content.
 *
 * 8 clinical scenarios × 1 question each = 8 questions. (The follow-up
 * "B" questions were removed; question ids keep their original "1A"…"8A"
 * form so they stay aligned with the researcher-held answer key.)
 *
 * This file is intentionally the ONLY place assessment content lives.
 * Nothing in cases.js / verify-workflow.js / complete.js needs to change
 * when content changes, as long as each scenario keeps this shape:
 *
 *   {
 *     id, title, vignette,
 *     questions: [
 *       { id, prompt, options: [{ id, label }, ...], aiSuggestion },
 *     ]
 *   }
 *
 * ⚠️ ANSWER KEY IS NOT IN THIS FILE — BY DESIGN.
 * The correct answers are deliberately NOT shipped to the participant client (README, "Security Principles":
 * gold diagnosis / AI correctness / scoring metadata must not reach the
 * browser). Scoring happens off-client against the research team's key.
 * Nothing in the participant flow ever tells a participant whether an
 * answer was right or wrong.
 *
 * ⚠️ Scenario titles are deliberately NEUTRAL ("Scenario 1 of 8"). The
 * diagnostic headings used in the research brief (e.g. "ACUTE MYOCARDIAL
 * INFARCTION") would give away Question A, so they are not displayed.
 *
 * AI SUGGESTION PROFILE: some of the AI suggestions are deliberately
 * DISCORDANT (point at a plausible wrong option), so the study can measure
 * whether participants catch and correct a mistaken AI suggestion rather
 * than only measuring adherence to a correct one.
 *
 * Current profile, as specified by the research team (only the
 * `aiSuggestion` on each item differs; the questions and options are
 * unchanged):
 *
 *   AI suggestion correct   (4): 1A, 4A, 5A, 7A
 *   AI suggestion discordant (4): 2A, 3A, 6A, 8A
 *
 * Each wrong suggestion is a plausible clinical distractor already
 * present in that question's own option list, not an arbitrary or absurd
 * choice — the intent is to measure genuine verification, not test
 * whether participants notice an obviously wrong answer. To change which
 * items are discordant, edit only the `aiSuggestion` on the relevant
 * question(s).
 *
 * `aiSuggestion` on each question is the pre-generated, LOCKED AI output
 * shown to the Standard-AI and AI+VERIFY-AI arms (README: "The AI
 * recommendations used in the AI arms are pre-generated and locked" /
 * "The platform should not provide live AI-generated clinical
 * information"). No AI API is called anywhere in this application.
 *
 * Each item's `rationale` string is kept here but is NOT shown to
 * participants — the AI panel displays only the suggested answer (see
 * renderAiPanel in cases.js). Kept as data in case it's wanted later.
 *
 * To change an item later, edit only its `aiSuggestion`.
 */

export const SCENARIOS = [
  {
    id: "scenario-1",
    title: "Scenario 1 of 8",
    vignette:
      "A 58-year-old hypertensive smoker presents with 2 hours of central chest pain radiating to the left arm, with sweating and nausea. ECG shows ST elevation in leads II, III, and aVF. Troponin I is markedly elevated.",
    questions: [
      {
        id: "1A",
        prompt: "What is the most likely diagnosis?",
        options: [
          { id: "a", label: "Unstable angina" },
          { id: "b", label: "Inferior STEMI" },
          { id: "c", label: "Anterior STEMI" },
          { id: "d", label: "Acute pericarditis" },
          { id: "e", label: "Aortic dissection" },
        ],
        aiSuggestion: {
          optionId: "b",
          optionLabel: "Inferior STEMI",
          rationale:
            "ST elevation in leads II, III and aVF with markedly raised troponin and typical ischaemic pain indicates infarction of the inferior wall.",
        },
      },
    ],
  },
  {
    id: "scenario-2",
    title: "Scenario 2 of 8",
    vignette:
      "A 28-year-old woman at 34 weeks gestation presents with sudden painless vaginal bleeding. The uterus is soft and non-tender, and the fetal heart rate is reactive at 140 bpm. She has had no ultrasound scan this pregnancy.",
    questions: [
      {
        id: "2A",
        prompt: "What is the most likely diagnosis?",
        options: [
          { id: "a", label: "Placental abruption" },
          { id: "b", label: "Placenta praevia" },
          { id: "c", label: "Uterine rupture" },
          { id: "d", label: "Vasa praevia" },
          { id: "e", label: "Normal labour" },
        ],
        aiSuggestion: {
          optionId: "a",
          optionLabel: "Placental abruption",
          rationale:
            "Sudden antepartum bleeding in the third trimester is most often due to separation of the placenta from the uterine wall.",
        },
      },
    ],
  },
  {
    id: "scenario-3",
    title: "Scenario 3 of 8",
    vignette:
      "A previously well 2-year-old has a 3-minute generalized tonic-clonic seizure during a febrile illness (temperature 39.2°C) with coryza. He returns to baseline within 15 minutes, is alert and playful, with no neck stiffness and no prior seizure history.",
    questions: [
      {
        id: "3A",
        prompt: "What is the most likely diagnosis?",
        options: [
          { id: "a", label: "Bacterial meningitis" },
          { id: "b", label: "Simple febrile seizure" },
          { id: "c", label: "Epilepsy" },
          { id: "d", label: "Febrile status epilepticus" },
          { id: "e", label: "Breath-holding spell" },
        ],
        aiSuggestion: {
          optionId: "a",
          optionLabel: "Bacterial meningitis",
          rationale:
            "Any seizure occurring with fever in a young child should be treated as bacterial meningitis until proven otherwise, given how serious a missed diagnosis would be.",
        },
      },
    ],
  },
  {
    id: "scenario-4",
    title: "Scenario 4 of 8",
    vignette:
      "A 15-year-old boy has sudden severe left scrotal pain and swelling for 4 hours, with nausea and vomiting. The left testis is high-riding and horizontal, with an absent cremasteric reflex. There is no fever or dysuria.",
    questions: [
      {
        id: "4A",
        prompt: "What is the most likely diagnosis?",
        options: [
          { id: "a", label: "Epididymo-orchitis" },
          { id: "b", label: "Testicular torsion" },
          { id: "c", label: "Inguinal hernia" },
          { id: "d", label: "Hydrocele" },
          { id: "e", label: "Varicocele" },
        ],
        aiSuggestion: {
          optionId: "b",
          optionLabel: "Testicular torsion",
          rationale:
            "Abrupt severe pain with a high-riding, horizontally lying testis and an absent cremasteric reflex, without fever or urinary symptoms, is a torsion picture rather than infection.",
        },
      },
    ],
  },
  {
    id: "scenario-5",
    title: "Scenario 5 of 8",
    vignette:
      "A 62-year-old diabetic, hypertensive man presents with 3 weeks of exertional dyspnoea, orthopnoea, and ankle swelling. Examination shows elevated JVP, bilateral basal crackles, and pitting oedema. ECG shows atrial fibrillation with a rate of 110 bpm. Chest X-ray shows cardiomegaly and pulmonary congestion.",
    questions: [
      {
        id: "5A",
        prompt: "What is the most likely diagnosis?",
        options: [
          { id: "a", label: "COPD exacerbation" },
          { id: "b", label: "Decompensated heart failure" },
          { id: "c", label: "Pulmonary embolism" },
          { id: "d", label: "Pneumonia" },
          { id: "e", label: "Pericardial effusion" },
        ],
        aiSuggestion: {
          optionId: "b",
          optionLabel: "Decompensated heart failure",
          rationale:
            "Orthopnoea, raised JVP, basal crackles, peripheral oedema, cardiomegaly and pulmonary congestion together indicate fluid overload from a failing heart.",
        },
      },
    ],
  },
  {
    id: "scenario-6",
    title: "Scenario 6 of 8",
    vignette:
      "A 42-year-old man with longstanding untreated epigastric pain develops sudden severe generalized abdominal pain, guarding, and board-like rigidity, with absent bowel sounds. Erect chest X-ray shows free subdiaphragmatic air.",
    questions: [
      {
        id: "6A",
        prompt: "What is the most likely diagnosis?",
        options: [
          { id: "a", label: "Acute gastroenteritis" },
          { id: "b", label: "Perforated peptic ulcer" },
          { id: "c", label: "Acute pancreatitis" },
          { id: "d", label: "Acute appendicitis" },
          { id: "e", label: "Bowel obstruction" },
        ],
        aiSuggestion: {
          optionId: "c",
          optionLabel: "Acute pancreatitis",
          rationale:
            "Severe epigastric-onset pain with guarding and absent bowel sounds is consistent with an acute inflammatory process of the pancreas.",
        },
      },
    ],
  },
  {
    id: "scenario-7",
    title: "Scenario 7 of 8",
    vignette:
      "A 29-year-old woman with 7 weeks of amenorrhoea presents with lower abdominal pain, scanty vaginal bleeding, and dizziness. Pulse is 118/min, BP 88/56. There is right iliac fossa tenderness, cervical motion tenderness, and a positive pregnancy test.",
    questions: [
      {
        id: "7A",
        prompt: "What is the most likely diagnosis?",
        options: [
          { id: "a", label: "Threatened miscarriage" },
          { id: "b", label: "Ruptured ectopic pregnancy" },
          { id: "c", label: "Ovarian cyst rupture" },
          { id: "d", label: "Acute appendicitis" },
          { id: "e", label: "Urinary tract infection" },
        ],
        aiSuggestion: {
          optionId: "b",
          optionLabel: "Ruptured ectopic pregnancy",
          rationale:
            "A positive pregnancy test with adnexal and cervical motion tenderness plus haemodynamic instability points to intraperitoneal bleeding from an extrauterine pregnancy.",
        },
      },
    ],
  },
  {
    id: "scenario-8",
    title: "Scenario 8 of 8",
    vignette:
      "A 7-month-old boy has 2 days of fever, poor feeding, and irritability, with two brief seizure-like episodes and increasing lethargy. Examination shows a bulging anterior fontanelle, poor response to pain, and prolonged capillary refill time.",
    questions: [
      {
        id: "8A",
        prompt: "What is the most likely diagnosis?",
        options: [
          { id: "a", label: "Simple febrile illness" },
          { id: "b", label: "Bacterial meningitis/sepsis" },
          { id: "c", label: "Teething" },
          { id: "d", label: "Viral gastroenteritis" },
          { id: "e", label: "Breakthrough fever from vaccination" },
        ],
        aiSuggestion: {
          optionId: "a",
          optionLabel: "Simple febrile illness",
          rationale:
            "Fever with irritability and poor feeding in an infant is most often a self-limiting viral illness, and the episodes described are consistent with febrile fussiness rather than a focal neurological process.",
        },
      },
    ],
  },
];

/**
 * Flat, ordered list of all 8 questions with their scenario context
 * attached. The case runner walks THIS list, so "question N of 8" and
 * scenario grouping both stay derived from one source.
 */
export const QUESTIONS = SCENARIOS.flatMap((scenario, scenarioIndex) =>
  scenario.questions.map((question, questionIndex) => ({
    scenarioId: scenario.id,
    scenarioIndex,
    scenarioTitle: scenario.title,
    vignette: scenario.vignette,
    questionIndexInScenario: questionIndex,
    ...question,
  }))
);

export const TOTAL_QUESTIONS = QUESTIONS.length; // 8

/** Confidence rating prompt, asked after every question (pre-existing measure). */
export const CONFIDENCE_PROMPT = "How confident are you in this answer?";
