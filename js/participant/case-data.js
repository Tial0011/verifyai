/**
 * VERIFY-AI — approved clinical assessment content.
 *
 * 8 clinical scenarios × 2 questions (A and B) = 16 questions.
 *
 * This file is intentionally the ONLY place assessment content lives.
 * Nothing in cases.js / verify-workflow.js / complete.js needs to change
 * when content changes, as long as each scenario keeps this shape:
 *
 *   {
 *     id, title, vignette,
 *     questions: [
 *       { id, prompt, options: [{ id, label }, ...], aiSuggestion },
 *       ...
 *     ]
 *   }
 *
 * ⚠️ ANSWER KEY IS NOT IN THIS FILE — BY DESIGN.
 * The correct answer for every question is B, but that key is deliberately
 * NOT shipped to the participant client (README, "Security Principles":
 * gold diagnosis / AI correctness / scoring metadata must not reach the
 * browser). Scoring happens off-client against the research team's key.
 * Nothing in the participant flow ever tells a participant whether an
 * answer was right or wrong.
 *
 * ⚠️ Scenario titles are deliberately NEUTRAL ("Scenario 1 of 8"). The
 * diagnostic headings used in the research brief (e.g. "ACUTE MYOCARDIAL
 * INFARCTION") would give away Question A, so they are not displayed.
 *
 * AI SUGGESTION PROFILE — CONFIRMED BY THE RESEARCH TEAM (2026-09-17):
 * all 16 AI suggestions point at the correct option. Do not introduce
 * discordant AI advice without a further instruction from the research
 * team. Note the consequence for analysis: because the AI is always
 * right, agreement with the AI cannot be separated from a correct
 * independent answer, so this design measures adherence rather than
 * harmful overreliance.
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
            "ST elevation confined to the inferior leads (II, III, aVF) with a markedly raised troponin in a patient with ischaemic risk factors points to infarction in the inferior territory rather than an anterior or non-ischaemic cause.",
        },
      },
      {
        id: "1B",
        prompt:
          "Following the diagnosis in Question 1A, what is the most appropriate immediate management?",
        options: [
          { id: "a", label: "Oral antibiotics and outpatient follow-up" },
          {
            id: "b",
            label:
              "Urgent reperfusion therapy (primary PCI or fibrinolysis) plus aspirin, a P2Y12 inhibitor, and anticoagulation",
          },
          { id: "c", label: "Immediate discharge with lifestyle advice" },
          { id: "d", label: "IV corticosteroids" },
          { id: "e", label: "Observation only, with no pharmacological treatment" },
        ],
        aiSuggestion: {
          optionId: "b",
          optionLabel:
            "Urgent reperfusion therapy (primary PCI or fibrinolysis) plus aspirin, a P2Y12 inhibitor, and anticoagulation",
          rationale:
            "ST-elevation infarction is a time-critical occlusion; restoring flow as early as possible alongside antiplatelet and anticoagulant therapy is the priority.",
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
          optionId: "b",
          optionLabel: "Placenta praevia",
          rationale:
            "Painless bleeding with a soft, non-tender uterus and a reassuring fetal heart rate fits a low-lying placenta rather than abruption or rupture, both of which are typically painful.",
        },
      },
      {
        id: "2B",
        prompt: "In the scenario above, which of the following should be avoided?",
        options: [
          { id: "a", label: "Intravenous access" },
          { id: "b", label: "Digital vaginal examination" },
          { id: "c", label: "Fetal heart rate monitoring" },
          { id: "d", label: "Ultrasound scan" },
          { id: "e", label: "Blood grouping and cross-match" },
        ],
        aiSuggestion: {
          optionId: "b",
          optionLabel: "Digital vaginal examination",
          rationale:
            "Where a low-lying placenta has not been excluded, digital examination risks provoking catastrophic haemorrhage; imaging should come first.",
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
          optionId: "b",
          optionLabel: "Simple febrile seizure",
          rationale:
            "A brief generalized seizure in a febrile toddler with rapid return to baseline, no meningism and no prior seizures is the classic simple pattern.",
        },
      },
      {
        id: "3B",
        prompt:
          "Which of the following is the most appropriate next step for the child in Question 3A?",
        options: [
          { id: "a", label: "Lumbar puncture and empirical IV antibiotics" },
          {
            id: "b",
            label:
              "Manage the fever, look for the source of infection, observe, and reassure/educate the caregiver",
          },
          { id: "c", label: "Immediate CT brain" },
          { id: "d", label: "Start maintenance anticonvulsants" },
          { id: "e", label: "Admit to intensive care" },
        ],
        aiSuggestion: {
          optionId: "b",
          optionLabel:
            "Manage the fever, look for the source of infection, observe, and reassure/educate the caregiver",
          rationale:
            "With a well-looking child and no features of CNS infection, management is supportive: treat the fever, identify the source, observe, and counsel the caregiver.",
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
      {
        id: "4B",
        prompt:
          "What is the most appropriate next step in the management of the boy in Question 4A?",
        options: [
          { id: "a", label: "Wait for scrotal Doppler ultrasound before deciding on treatment" },
          {
            id: "b",
            label:
              "Urgent urology referral for surgical exploration, without letting imaging delay definitive treatment",
          },
          { id: "c", label: "Course of oral antibiotics" },
          { id: "d", label: "Discharge with analgesia and outpatient review" },
          { id: "e", label: "Elective surgery in 1–2 weeks" },
        ],
        aiSuggestion: {
          optionId: "b",
          optionLabel:
            "Urgent urology referral for surgical exploration, without letting imaging delay definitive treatment",
          rationale:
            "Testicular viability falls sharply with time, so exploration should not be delayed for investigations when the clinical picture is already suggestive.",
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
            "Orthopnoea with raised JVP, basal crackles, peripheral oedema, cardiomegaly and pulmonary congestion together describe congestive decompensation, with the fast atrial fibrillation as a likely precipitant.",
        },
      },
      {
        id: "5B",
        prompt:
          "Following the diagnosis in Question 5A, which of the following is the most appropriate initial management?",
        options: [
          { id: "a", label: "Oral antibiotics and outpatient follow-up" },
          {
            id: "b",
            label:
              "Oxygen if hypoxaemic, IV loop diuretic (e.g., furosemide), fluid/salt restriction as appropriate, and treatment of the precipitating cause",
          },
          { id: "c", label: "Immediate anticoagulation alone for atrial fibrillation" },
          { id: "d", label: "IV corticosteroids" },
          { id: "e", label: "Elective discharge with lifestyle advice" },
        ],
        aiSuggestion: {
          optionId: "b",
          optionLabel:
            "Oxygen if hypoxaemic, IV loop diuretic (e.g., furosemide), fluid/salt restriction as appropriate, and treatment of the precipitating cause",
          rationale:
            "Initial care targets congestion and oxygenation while addressing what tipped the patient over — here the uncontrolled ventricular rate.",
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
          optionId: "b",
          optionLabel: "Perforated peptic ulcer",
          rationale:
            "Free gas under the diaphragm with sudden generalized pain and board-like rigidity, on a background of untreated epigastric pain, indicates a perforated viscus of peptic origin.",
        },
      },
      {
        id: "6B",
        prompt: "What is the most appropriate next step for the patient in Question 6A?",
        options: [
          { id: "a", label: "Oral rehydration and antiemetics at home" },
          {
            id: "b",
            label:
              "Nil by mouth, IV fluids, nasogastric decompression, IV antibiotics, analgesia, and urgent surgical review",
          },
          { id: "c", label: "Outpatient endoscopy in 1 week" },
          { id: "d", label: "Laxatives" },
          { id: "e", label: "Discharge with oral antibiotics" },
        ],
        aiSuggestion: {
          optionId: "b",
          optionLabel:
            "Nil by mouth, IV fluids, nasogastric decompression, IV antibiotics, analgesia, and urgent surgical review",
          rationale:
            "Resuscitation, decompression and antibiotics stabilise the patient while definitive surgical management is arranged without delay.",
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
      {
        id: "7B",
        prompt: "What is the most appropriate immediate management for the woman in Question 7A?",
        options: [
          { id: "a", label: "Outpatient ultrasound in 48 hours" },
          {
            id: "b",
            label:
              "Immediate resuscitation (IV access and fluids, group and cross-match) with urgent gynaecological review for emergency surgery",
          },
          { id: "c", label: "Methotrexate without further assessment" },
          { id: "d", label: "Reassurance and discharge" },
          { id: "e", label: "Serial beta-hCG over one week before acting" },
        ],
        aiSuggestion: {
          optionId: "b",
          optionLabel:
            "Immediate resuscitation (IV access and fluids, group and cross-match) with urgent gynaecological review for emergency surgery",
          rationale:
            "The patient is shocked from ongoing bleeding, so resuscitation runs in parallel with arranging definitive surgical control; medical or watchful options are unsafe here.",
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
          optionId: "b",
          optionLabel: "Bacterial meningitis/sepsis",
          rationale:
            "A bulging fontanelle with reduced consciousness, seizures and delayed capillary refill in a febrile infant indicates serious CNS infection with circulatory compromise.",
        },
      },
      {
        id: "8B",
        prompt: "What is the most appropriate immediate management for the infant in Question 8A?",
        options: [
          { id: "a", label: "Antipyretics and review in clinic in 24 hours" },
          {
            id: "b",
            label:
              "Immediate IV access, blood cultures, fluid resuscitation, and empirical IV antibiotics without delay, with urgent admission",
          },
          { id: "c", label: "Oral antibiotics at home" },
          { id: "d", label: "Wait for CSF results before starting antibiotics" },
          { id: "e", label: "Discharge with antipyretic and safety-net advice only" },
        ],
        aiSuggestion: {
          optionId: "b",
          optionLabel:
            "Immediate IV access, blood cultures, fluid resuscitation, and empirical IV antibiotics without delay, with urgent admission",
          rationale:
            "Antibiotics and resuscitation should not wait for investigations when suspicion of bacterial meningitis or sepsis is high; delay increases mortality.",
        },
      },
    ],
  },
];

/**
 * Flat, ordered list of all 16 questions with their scenario context
 * attached. The case runner walks THIS list, so "question N of 16" and
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

export const TOTAL_QUESTIONS = QUESTIONS.length; // 16

/** Confidence rating prompt, asked after every question (pre-existing measure). */
export const CONFIDENCE_PROMPT = "How confident are you in this answer?";
