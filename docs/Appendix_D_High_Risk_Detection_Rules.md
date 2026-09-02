# Appendix D — High Risk Detection Rules

Consolidated from three ARMMAN-provided sheets: **High risk protocols_Developer's copy** — **ANC HR**, **Infant HR**, and **Dashboard**. Referenced from SRS §3A.2.5 (High Risk Detection) and §3C (Manager Web Dashboard).

- **Part 1 — ANC** covers the pregnancy/mother phase (registration + ANC_VISIT).
- **Part 2 — Infant** covers NN (neonatal, 0–28 days) and INC/CCV (infant/child, 0–24 months). Per SRS §3A.2.4, CCV (13–24m) uses the same clinical fields, HR thresholds, and referral conditions as INC (0–12m) — "Confirmed - CCV visit form and HR thresholds will be same as INC" — so this sheet is the threshold source for both phases, not NN alone.
- **Part 3 — Manager Dashboard** covers the reporting/linelist requirements built on top of Parts 1 and 2's risk data (SRS §3C).

---

# Part 1 — ANC High Risk Detection Rules

Source: **High risk protocols_Developer's copy — ANC HR** sheet.

## 1.1 Parameter measurement method

| HR Parameter                 | How measured                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| Age                          | DoB/Age                                                                                  |
| Undernutrition               | MUAC measurement by Mother-Infant MUAC tape; BMI calculation by wt(kg)/ht(m)²            |
| Bad Obstetric History        | Height in cm; take detailed past obstetric history in ANC registration form              |
| Blood Haemoglobin Levels     | Haemometer readings                                                                      |
| Blood Pressure               | Digital BP apparatus                                                                     |
| Blood Sugar Levels           | Glucometer readings: Random Blood Sugar                                                  |
| Bleeding                     | Ask history of vaginal bleeding at every ANC visit                                       |
| Body temperature             | Oral temperature using digital thermometer                                               |
| Fetal Heart Rate             | Measure using Doppler device                                                             |
| Fundal Height                | Measure from symphysis pubis to uterine fundus using measuring tape                      |
| Poor Gestational Weight gain | Current weight − pre-pregnancy weight (tracked against gestational age and BMI category) |
| Physical Examination         | Palm, Nails, Eyes and Skin check                                                         |
| Urine Analysis               | —                                                                                        |
| All Danger Signs             | —                                                                                        |

## 1.2 HR condition per parameter

| HR Parameter                 | HR Condition                |
| ---------------------------- | --------------------------- |
| Age                          | Underage/Overage            |
| Undernutrition               | MUAC/BMI                    |
| Undernutrition (height)      | Stunting (height)           |
| Bad Obstetric History        | Bad Obstetric History       |
| Blood Haemoglobin Levels     | Anemia                      |
| Blood Pressure               | Hypertension                |
| Blood Pressure               | Hypotension                 |
| Blood Sugar Levels           | Hyperglycemia               |
| Blood Sugar Levels           | Hypoglycemia                |
| Bleeding                     | Antepartum Hemorrhage (APH) |
| Bleeding                     | Postpartum Hemorrhage (PPH) |
| Body temperature             | Hypothermia                 |
| Body temperature             | Hyperthermia                |
| Fetal Heart Rate             | Fetal Heart Rate            |
| Fundal Height                | Fundal Height               |
| Poor Gestational Weight gain | Gestational Weight gain     |
| Physical Examination         | Jaundice                    |

## 1.3 Grade thresholds by condition

Each row below is one HR condition; each column is a severity grade. A blank cell means that condition's protocol does not define a value at that grade.

### Age

| Grade      | Value                                  |
| ---------- | -------------------------------------- |
| Normal/Low | Normal (19–34 years)                   |
| Mild       | Underage <19 years / Overage ≥35 years |
| Moderate   | —                                      |
| Severe     | —                                      |

### Undernutrition — MUAC/BMI

| Grade      | Value                        |
| ---------- | ---------------------------- |
| Normal/Low | ≥ 23 cm / BMI ≥ 18.5         |
| Mild       | <23 cm / BMI <18.5; BMI ≥ 35 |
| Moderate   | —                            |
| Severe     | —                            |

### Undernutrition — Stunting (height)

| Grade      | Value    |
| ---------- | -------- |
| Normal/Low | ≥ 145 cm |
| Mild       | <145 cm  |
| Moderate   | —        |
| Severe     | —        |

### Bad Obstetric History

| Grade      | Value                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Normal/Low | No adverse previous pregnancy outcome                                                                                             |
| Mild       | G>4, L<P, Pre-term, LSCS without spacing, consecutive losses/ABORTIONS ≥2, stillbirth, neonatal death, or recurrent complications |
| Moderate   | —                                                                                                                                 |
| Severe     | —                                                                                                                                 |

### Anemia (Blood Haemoglobin Levels)

| Grade      | Value                                          |
| ---------- | ---------------------------------------------- |
| Normal/Low | No anaemia (>11 g/dl)                          |
| Mild       | Mild (10–10.9 g/dl)                            |
| Moderate   | Moderate (7–9.9 g/dl); sickle cell disease +ve |
| Severe     | Severe (<7 g/dl)                               |

### Hypertension (Blood Pressure)

| Grade      | Value                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------ |
| Normal/Low | Normal (≤120/80 mmHg)                                                                      |
| Mild       | Systolic 135–139 / Diastolic 85–89 and history of Hypertension or Gestational Hypertension |
| Moderate   | Moderate ≥140–159/90–109                                                                   |
| Severe     | Severe ≥160/≥110                                                                           |

### Hypotension (Blood Pressure)

| Grade      | Value                                               |
| ---------- | --------------------------------------------------- |
| Normal/Low | ≥90 systolic                                        |
| Mild       | Systolic <90 mmHg or associated with shock features |
| Moderate   | —                                                   |
| Severe     | —                                                   |

### Hyperglycemia (Blood Sugar Levels)

| Grade      | Value                |
| ---------- | -------------------- |
| Normal/Low | Normal 70–140 mg/dL  |
| Mild       | At risk (>140 mg/dl) |
| Moderate   | —                    |
| Severe     | —                    |

### Hypoglycemia (Blood Sugar Levels)

| Grade      | Value               |
| ---------- | ------------------- |
| Normal/Low | Normal 70–140 mg/dL |
| Mild       | <70 mg/dL           |
| Moderate   | —                   |
| Severe     | —                   |

### Antepartum Hemorrhage — APH (Bleeding)

| Grade      | Value                                                                                                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Normal/Low | No bleeding                                                                                                                                                                                   |
| Mild       | Spotting (few drops, no pain, hemodynamically stable) / bleeding similar to menstrual flow, mild pain, stable vitals / heavy bleeding, clots, severe abdominal pain, dizziness, pallor, shock |
| Moderate   | —                                                                                                                                                                                             |
| Severe     | —                                                                                                                                                                                             |

### Postpartum Hemorrhage — PPH (Bleeding)

| Grade      | Value                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| Normal/Low | Lochia normal: light bleeding, intermittent, red to brown, progressing to pink and white over 6 weeks |
| Mild       | Profuse bleeding, soaking more than 2 pads per hour                                                   |
| Moderate   | —                                                                                                     |
| Severe     | —                                                                                                     |

### Hypothermia (Body temperature)

| Grade      | Value     |
| ---------- | --------- |
| Normal/Low | 96–98.9°F |
| Mild       | <96°F     |
| Moderate   | —         |
| Severe     | —         |

### Hyperthermia (Body temperature)

| Grade      | Value   |
| ---------- | ------- |
| Normal/Low | 97–99°F |
| Mild       | >99°F   |
| Moderate   | —       |
| Severe     | —       |

### Fetal Heart Rate

| Grade      | Value                                    |
| ---------- | ---------------------------------------- |
| Normal/Low | 120–160 bpm                              |
| Mild       | <120 bpm OR >160 bpm OR irregular rhythm |
| Moderate   | —                                        |
| Severe     | —                                        |

### Fundal Height

| Grade      | Value                                |
| ---------- | ------------------------------------ |
| Normal/Low | GA ±2 cm                             |
| Mild       | <>GA ±2 cm OR <GA −2 cm or >GA +2 cm |
| Moderate   | —                                    |
| Severe     | —                                    |

### Gestational Weight gain (Poor Gestational Weight gain)

| Grade      | Value                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------- |
| Normal/Low | 10–12 kg                                                                                          |
| Mild       | Weight gain below recommended range, i.e. 10–12 kg (0.2–0.3 kg per week in 2nd and 3rd trimester) |
| Moderate   | —                                                                                                 |
| Severe     | —                                                                                                 |

### Jaundice (Physical Examination)

| Grade      | Value                                                            |
| ---------- | ---------------------------------------------------------------- |
| Normal/Low | —                                                                |
| Mild       | If yellow +ve in 2/3 out of: Palm and Nails; Sclera (Eyes); Skin |
| Moderate   | —                                                                |
| Severe     | —                                                                |

### Urine Analysis

| Grade | Value                                       |
| ----- | ------------------------------------------- |
| Mild  | Urine protein; Urine Sugar; Urine Infection |

### All Danger Signs

| Grade | Value                                                                                                                                                                                                                                                                        |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mild  | Severe abdominal pain; Abnormal Vaginal discharge (foul smelling and yellow); Vomiting for more than 24 hours; Convulsions; Severe Headaches, blurred vision; Dizziness; Breathlessness; Palpitation; Increased frequency of urination; Vaginal Itching; Burning micturition |

## 1.4 Referral trigger rules (per condition)

| HR Condition                | Referral trigger                                                        |
| --------------------------- | ----------------------------------------------------------------------- |
| Age (Underage/Overage)      | Only first instance                                                     |
| MUAC/BMI                    | Only first instance                                                     |
| Stunting                    | Only first instance                                                     |
| Bad Obstetric History       | Only first instance                                                     |
| Anemia                      | Every instance of Moderate and Severe                                   |
| Hypertension                | Every instance of Moderate and Severe                                   |
| Hypotension                 | Every instance if accompanied by any other flagged high-risk condition  |
| Hyperglycemia               | Every instance                                                          |
| Hypoglycemia                | Every instance if accompanied by any other flagged high-risk condition  |
| Antepartum Hemorrhage (APH) | Every instance                                                          |
| Postpartum Hemorrhage (PPH) | —                                                                       |
| Hypothermia                 | Every instance if accompanied by any other flagged high-risk condition  |
| Hyperthermia                | Every instance                                                          |
| Fetal Heart Rate            | Every instance                                                          |
| Fundal Height               | Every instance                                                          |
| Gestational Weight gain     | Only first instance                                                     |
| Jaundice                    | Only first instance, if yellow +ve in 2/3 out of Palm/Nails/Sclera/Skin |
| Urine Analysis              | Every instance                                                          |
| All Danger Signs            | Every instance                                                          |

## 1.5 HR visit trigger rules (visit generated 15 days later)

| HR Condition                | HR visit (after 15 days) trigger                                       |
| --------------------------- | ---------------------------------------------------------------------- |
| Age (Underage/Overage)      | Regular                                                                |
| MUAC/BMI                    | Regular                                                                |
| Stunting                    | Regular                                                                |
| Bad Obstetric History       | Regular                                                                |
| Anemia                      | Every instance of Moderate and Severe                                  |
| Hypertension                | Every instance of Moderate and Severe                                  |
| Hypotension                 | Every instance if accompanied by any other flagged high-risk condition |
| Hyperglycemia               | Every instance                                                         |
| Hypoglycemia                | Every instance if accompanied by any other flagged high-risk condition |
| Antepartum Hemorrhage (APH) | Every instance                                                         |
| Postpartum Hemorrhage (PPH) | —                                                                      |
| Hypothermia                 | Every instance if accompanied by any other flagged high-risk condition |
| Hyperthermia                | Every instance                                                         |
| Fetal Heart Rate            | Every instance                                                         |
| Fundal Height               | Every instance                                                         |
| Gestational Weight gain     | Every instance                                                         |
| Jaundice                    | Every instance                                                         |
| Urine Analysis              | Every instance                                                         |
| All Danger Signs            | Every instance                                                         |

> Note: per FR-S-5.2/FR-S-5.3, this HR visit anchor is the ACTUAL completion date + 15 days for ANC/INC (cumulative — a new HR visit fires on every qualifying detection).

## 1.6 Counselling-only rules (no referral, no HR visit)

| HR Condition            | Only counselling applies |
| ----------------------- | ------------------------ |
| Age (Underage/Overage)  | For other visits         |
| MUAC/BMI                | For other visits         |
| Stunting                | For other visits         |
| Bad Obstetric History   | For other visits         |
| Anemia                  | For mild                 |
| Hypertension            | For mild                 |
| Hypotension             | As an individual risk    |
| Hypoglycemia            | As an individual risk    |
| Hypothermia             | As an individual risk    |
| Gestational Weight gain | For other visits         |

## 1.7 Developer note

> **Risk condition grade must be captured and stored for all records, irrespective of its value or category.** This confirms FR-behaviour already implemented in `risk_flags` (one row per evaluated condition per visit, including NORMAL grades — see `RiskFlag` model, risk-referral-service).

## 1.8 Open items — resolved via issue #191

Seven clarifications originally left open in this Appendix were confirmed by ARMMAN via GitHub issue #191. `anc-risk.rulesJson.ts` (rules-service) has been updated to match; each item below states the answer and its current implementation status.

1. **Bad Obstetric History — data source.** BOH is graded from MOTHER_REGISTRATION's existing "Did you experience any complications during birth/delivery in previous pregnancies?" question (Row 50 of the Revised App Form) — no new registration-form question is needed for the G>4/L<P/abortions≥2/prior-complications criteria already implemented. **Implemented.** Pre-term delivery and LSCS-without-spacing (also listed as BOH criteria in §1.3) still have no dedicated form field and remain a confirmed, un-actioned gap — ARMMAN's answer did not add a field for either.
2. **Hypertension — history of hypertension.** No new form question is needed: "history of hypertension" is already captured at MOTHER_REGISTRATION under "Have you ever been diagnosed with or treated for any of the following medical conditions?" (Q58, value `hypertension_high_bp`); "Gestational Hypertension" is captured per-visit as part of the current pregnancy assessment. The Mild band ("Systolic 135–139/Diastolic 85–89 AND history of Hypertension or Gestational Hypertension") now requires history OR gestational hypertension in addition to the BP range, not the BP range alone. **Implemented** for the medical-history side (`historyOfHypertension`, merged in by `form.service.ts`); `gestationalHypertension` has no known question_code yet on any per-visit form, so it is accepted as an input but is never populated by a real ANC_VISIT submission today.
3. **Hypotension — "shock features."** Confirmed: use the existing clinical signs/symptoms already captured on the ANC/High-Risk assessment (the shared danger-signs multiselect) rather than adding a new question. **Not yet implemented** — the answer does not name which specific existing signs count as a "shock feature," so Hypotension still grades on the systolic-BP threshold alone pending that one further detail.
4. **Sickle Cell Disease / Trait.** SCD is confirmed to affect risk grading and require referral, per Q60 (Revised App Form). SCT has no separate risk grade defined and should not be assigned one "unless clinically confirmed." **Implemented as before** — this pack already grades SCD as SEVERE with referral (matching the app-form spec) and leaves SCT ungraded; the answer did not explicitly restate SEVERE vs. Appendix D §2.3's Moderate tier for SCD, so that specific tier question is still open.
5. **Neuro-developmental Status.** Confirmed: if the Sakhi's age-appropriate milestone checklist finds all milestones achieved, grade Normal; if any milestone is missed, grade Severe (not the Mild this pack previously used) and trigger an HR visit (previously not triggered). **Implemented** in `infant-risk.rulesJson.ts`.
6. **Infant Activity Level, Feeding Concerns, Deformity.**
   - Activity Level (Revised App Form Q17): `active_and_moving` → Normal, `reduced_movement` → captured as an assessment finding (Mild, no referral), `lethargic` → High Risk + referral (Severe). **Implemented** as a new `ACTIVITY_LEVEL` condition.
   - Feeding Concerns (Revised App Form Q7): any concern other than the mutually-exclusive `no_concerns` value → High Risk, referral + health message. **Implemented** — `FEEDING_ADEQUACY` now reads the dedicated `feeding_concerns` field instead of `current_feeding_practice`.
   - Infant Deformity: a Yes/No question exists, but no Mild/Moderate/Severe or High-Risk threshold is defined — confirmed not to create one without further sign-off. **Not implemented**, by design.
7. **Prematurity in later visits.** Confirmed: prematurity does not affect risk grading in later INC/CCV/NN visits — it remains only a birth/registration record. **No change needed** — `infant-risk.rulesJson.ts` never reads a prematurity field today, which already matches this answer.

---

# Part 2 — Infant High Risk Detection Rules

Source: **High risk protocols_Developer's copy — Infant HR** sheet. Covers **NN (neonatal, 0–28 days)** and **INC/CCV (infant/child, 0–24 months)** — which condition applies at which age is determined by each parameter's own "How" column (e.g. MUAC only after 6 months) and by the visit form's own age-appropriate field set, not by a separate per-phase threshold table.

## 2.1 Parameter measurement method

| Parameter                                     | How (Tool/Method)                                               |
| --------------------------------------------- | --------------------------------------------------------------- |
| Birth Weight                                  | Hospital case paper / self-reported                             |
| Undernutrition (Wasting/Stunting/Underweight) | Infantometer and the infant weighing scale: Z-score calculation |
| MUAC                                          | Infant MUAC tape (Mother-Infant MUAC), after 6 months only      |
| Body Temperature                              | Digital axillary thermometer                                    |
| Umbilical Cord                                | Visual + smell inspection                                       |
| Breathing                                     | Count RR (respiratory rate) for 60 seconds                      |
| Development Milestones                        | Observation + structured maternal interview                     |
| Danger Signs / Infection                      | Head-to-toe examination; IMNCI algorithm                        |
| Breastfeeding & Nutrition                     | Direct observation, mother report, latch assessment             |

## 2.2 Condition per parameter

| Parameter                                     | Condition                          |
| --------------------------------------------- | ---------------------------------- |
| Birth Weight                                  | Low Birth Weight                   |
| Undernutrition (Wasting/Stunting/Underweight) | MUW / SUW / MAM / SAM              |
| MUAC                                          | MAM / SAM                          |
| Body Temperature                              | Hypothermia                        |
| Body Temperature                              | Hyperthermia                       |
| Umbilical Cord                                | Cord infection / omphalitis        |
| Breathing                                     | Respiratory distress               |
| Development Milestones                        | Neuro-developmental status         |
| Danger Signs / Infection                      | (see §2.3 Danger Signs list below) |
| Breastfeeding & Nutrition                     | Feeding adequacy                   |

## 2.3 Grade thresholds by condition

### Low Birth Weight

| Grade          | Value                |
| -------------- | -------------------- |
| Normal/Low     | Birth weight ≥2.5 kg |
| Mild (At Risk) | Birth weight <2.5 kg |
| Moderate       | —                    |
| Severe         | —                    |

### MUW/SUW/MAM/SAM (Undernutrition — Wasting/Stunting/Underweight, Z-score based)

| Grade          | Value                                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Normal/Low     | —                                                                                                                                      |
| Mild (At Risk) | Moderate Acute Malnutrition (MAM), defined as weight-for-height Z-score (WHZ/WAZ/HAZ) between −2 and −3, OR MUW (Moderate Underweight) |
| Moderate       | —                                                                                                                                      |
| Severe         | Severe Acute Malnutrition (SAM), defined as (WHZ/WAZ/HAZ) < −3, OR SUW (Severe Underweight)                                            |

### MAM/SAM (MUAC, 6–24 months only)

| Grade          | Value                                                                 |
| -------------- | --------------------------------------------------------------------- |
| Normal/Low     | ≥13.5 cm (0–6 months); ≥12.5 cm (6–24 months) — no acute malnutrition |
| Mild (At Risk) | 11.5–12.4 cm (6–24 months) — Moderate Acute Malnutrition (MAM)        |
| Moderate       | —                                                                     |
| Severe         | <11.5 cm (0–6 months)                                                 |

> Note: the source sheet gives the Normal-range MUAC cutoff for both 0–6m and 6–24m bands, but MUAC is only measured from 6 months onward per §2.1 — the 0–6m Normal figure (≥13.5 cm) is reference-only and the Severe row's "<11.5 cm (0–6 m)" age label as given should be verified with ARMMAN, since it conflicts with §2.1's "after 6 months only" measurement rule.

### Hypothermia (Body Temperature)

| Grade          | Value                     |
| -------------- | ------------------------- |
| Normal/Low     | Axillary 97–99°F          |
| Mild (At Risk) | Severe hypothermia: <96°F |
| Moderate       | —                         |
| Severe         | —                         |

> Note: the sheet labels this cutoff "Severe hypothermia" but places it in the Mild/At-Risk row — reproduced here exactly as given; flagged as a possible labeling inconsistency to confirm with ARMMAN.

### Hyperthermia (Body Temperature)

| Grade          | Value                       |
| -------------- | --------------------------- |
| Normal/Low     | Axillary 97–99°F            |
| Mild (At Risk) | Severe hyperthermia: >100°F |
| Moderate       | —                           |
| Severe         | —                           |

> Same labeling note as Hypothermia above — "Severe hyperthermia" appears in the Mild/At-Risk row in the source sheet.

### Cord infection / omphalitis (Umbilical Cord)

| Grade          | Value                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Normal/Low     | Cord dry, clean, no discharge, no smell; stump falls off Day 7–10                                  |
| Mild (At Risk) | Spreading redness, red streaks, abdominal wall erythema, pus, systemic sepsis → EMERGENCY referral |
| Moderate       | —                                                                                                  |
| Severe         | —                                                                                                  |

### Respiratory distress (Breathing)

| Grade          | Value                                     |
| -------------- | ----------------------------------------- |
| Normal/Low     | RR 40–60/min (neonate)                    |
| Mild (At Risk) | <40/min OR >60/min OR any chest indrawing |
| Moderate       | —                                         |
| Severe         | —                                         |

### Neuro-developmental status (Development Milestones)

| Grade          | Value                         |
| -------------- | ----------------------------- |
| Normal/Low     | Yes, as per the module shared |
| Mild (At Risk) | No                            |
| Moderate       | —                             |
| Severe         | —                             |

### Danger Signs / Infection

The source sheet lists this as one combined danger-signs/IMNCI checklist (not graded Normal/Mild/Moderate/Severe per item — presence of any listed sign is the At-Risk condition):

- Dry cough / Wet cough / Persistent cough
- Fast breathing (>60 breaths/min), grunting, chest in-drawing
- Severe hypothermia: <96°F
- Severe hyperthermia: >100°F
- Yellow eyes, palms, soles, body, face, etc. (jaundice)
- Blue color (cyanosis) around lips/skin
- Presence of oedema (pitting)
- Convulsions: twitching, fits, or abnormal movements
- Lethargy, floppiness, or inability to wake up
- Not able to drink/feed
- Vomits everything
- Diarrhoea

| Grade          | Value                                       |
| -------------- | ------------------------------------------- |
| Normal/Low     | No                                          |
| Mild (At Risk) | Yes, for any of the conditions listed above |
| Moderate       | —                                           |
| Severe         | —                                           |

### Feeding adequacy (Breastfeeding & Nutrition)

| Grade          | Value                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| Normal/Low     | Exclusive breastfeeding ≤6 months; ≥8 feeds/day; good latch; satisfied after feeds; adequate weight gain |
| Mild (At Risk) | Unable to feed / not breastfeeding at all; no complementary feeds started >6 months                      |
| Moderate       | —                                                                                                        |
| Severe         | —                                                                                                        |

## 2.4 Referral trigger rules (per condition)

| Condition                        | Referral trigger                                                 |
| -------------------------------- | ---------------------------------------------------------------- |
| Low Birth Weight                 | No referral                                                      |
| MUW/SUW/MAM/SAM (Undernutrition) | On first instance, and if no improvement in 3 consecutive visits |
| MAM/SAM (MUAC)                   | On first instance, and if no improvement in 3 consecutive visits |
| Hypothermia                      | Every instance                                                   |
| Hyperthermia                     | Every instance                                                   |
| Cord infection / omphalitis      | Every instance                                                   |
| Respiratory distress             | Every instance                                                   |
| Neuro-developmental status       | Every instance                                                   |
| Danger Signs / Infection         | Every instance                                                   |
| Feeding adequacy                 | Only for no feeding > supplementary feeds                        |

## 2.5 HR visit trigger rules

| Condition                        | HR visit (after 15 days) trigger  |
| -------------------------------- | --------------------------------- |
| Low Birth Weight                 | Every instance till normal        |
| MUW/SUW/MAM/SAM (Undernutrition) | Every instance till normal        |
| MAM/SAM (MUAC)                   | Every instance till normal        |
| Hypothermia                      | Single instance                   |
| Hyperthermia                     | Single instance                   |
| Cord infection / omphalitis      | — (not specified in source sheet) |
| Respiratory distress             | — (not specified in source sheet) |
| Neuro-developmental status       | — (not specified in source sheet) |
| Danger Signs / Infection         | Single instance                   |
| Feeding adequacy                 | No                                |

> Per SRS §3A.2.5 FR-S-5.3, the INC-phase HR visit anchor is 15 days after actual completion (cumulative — a new HR visit fires on every qualifying detection); CCV-phase uses the same thresholds per SRS confirmation but a 30-day anchor, single-instance per detection (see the ANC/INC/CCV HR-visit-scheduling pack, `hr.rulesJson.ts`, for the timing formula itself — this sheet only supplies which conditions trigger an HR visit, not the day-count formula).
>
> Three conditions (Cord infection/omphalitis, Respiratory distress, Neuro-developmental status) have every-instance referral triggers in §2.4 but no HR-visit-trigger value given in the source sheet — reproduced as blank/unspecified rather than guessed; confirm with ARMMAN before this pack governs a live case for these three conditions in production, same treatment as PPH's blank cells in Part 1.

## 2.6 Counselling-only rules

| Condition                        | Only counselling applies |
| -------------------------------- | ------------------------ |
| MUW/SUW/MAM/SAM (Undernutrition) | After every instance     |
| Feeding adequacy                 | Yes                      |

## 2.7 Developer note

> **Risk condition grade must be captured and stored for all records, irrespective of its value or category.** Same convention as Part 1 — every condition is graded and persisted every visit, including Normal/Low results.

## 2.8 Open items to confirm with ARMMAN

The infant rule pack (`infant-risk.rulesJson.ts`, rules-service) has been implemented against documented defaults for all four items below — these are working assumptions in production code, not blockers, but each should still be confirmed with ARMMAN and the pack updated if the real answer differs.

1. The Hypothermia/Hyperthermia grade tables label their single non-Normal threshold "Severe hypothermia"/"Severe hyperthermia" while placing it in the Mild/At-Risk row, with no separate Moderate/Severe bands defined — confirm whether a true Moderate/Severe band exists or whether "Mild (At Risk)" is simply mislabeled and should read "Severe." **Default applied:** graded as SEVERE (trusting the value's own label over its row position).
2. The MUAC Severe row's age label ("<11.5 cm (0–6 m)") conflicts with §2.1's rule that MUAC is only measured after 6 months — confirm the correct age band for the Severe MUAC cutoff. **Default applied:** the Severe cutoff is applied only for ages 6–24 months; the 0–6m figure is never evaluated.
3. No HR-visit-trigger value is given for Cord infection/omphalitis, Respiratory distress, or Neuro-developmental status, despite each having an "every instance" referral trigger — confirm whether these should also generate an HR visit, and on what cadence. **Default applied:** HR-visit trigger is `false` for all three, same treatment as PPH's blank cells in Part 1.
4. MODERATE grade row is entirely blank across every condition in the source sheet — confirm whether a Moderate band is intentionally absent for all infant conditions (unlike ANC, which has real Moderate values for Anemia and Hypertension), or simply not yet supplied. **Default applied:** no Moderate branch exists in the rule pack for any infant condition.

---

# Part 3 — Manager Dashboard: HR Linelist Triggers

Source: **High risk protocols_Developer's copy — Dashboard** sheet. Feeds SRS §3C "Manager Web Dashboard" (Section 3C.2 Dashboard Reports, category "HR Case Management"; Section 3C.4.1 linelists).

This sheet defines two things per beneficiary type (ANC / Child): (1) the **counts/metrics to track** on the dashboard, and (2) the **AS-wise linelist triggers** that must be surfaced to Supervisors and Managers.

## 3.1 ANC

### To track

- Number of women at High Risk of age, undernutrition
- Number of women at High Risk of bad Obstetric History (BOH)
- Progression across all grades in Anemia and Hypertension: separately for ones with permanent risks
- Improvement in Hypotension, Hyperglycemia, Hypoglycemia, Antepartum Hemorrhage (APH), Postpartum Hemorrhage (PPH), Hypothermia, Hyperthermia, Fetal Heart Rate, Fundal Height, Gestational Weight gain: separately for ones with permanent risks
- Improvement in any danger sign: separately for ones with permanent risks

### AS-wise linelist triggers to Supervisors and Managers

- Missed Visits
- Monthly HR cases
- EDD close
- No improvement in HR
- Deterioration of Hypertension and Anemia
- Women at permanent risk factors: Age / Undernutrition / BOH

## 3.2 Child

### To track

- Number of Children at Low Birth Weight Risk
- Progression across all grades in SUW/MUW/MAM/SAM: separate for ones with LOW birth weight risk
- Improvement in Body Temperature, Jaundice, Umbilical Cord, Breathing, Development Milestones, Breastfeeding & Nutrition: separate for ones with permanent risks
- Improvement in any danger sign: separate for ones with permanent risks

### AS-wise linelist triggers to Supervisors and Managers

- Missed Visits
- Monthly HR cases
- Completing 11 months
- No improvement in HR
- Deterioration of MUW/SUW/MAM/SAM
- Children at Low Birth Weight Risk

## 3.3 Notes for implementation

- This is a **reporting/dashboard requirements sheet**, not a per-condition clinical threshold protocol — unlike Parts 1 and 2, it names _what_ must be tracked and surfaced, not the numeric grading rules behind each condition.
- The ANC-side conditions listed here (Age, Undernutrition, BOH, Anemia, Hypertension, Hypotension, Hyperglycemia, Hypoglycemia, APH, PPH, Hypothermia, Hyperthermia, Fetal Heart Rate, Fundal Height, Gestational Weight Gain, danger signs) map 1:1 onto the 18 conditions already graded by `anc-risk.rulesJson.ts` (rules-service) and persisted in `risk_assessments`/`risk_flags` (risk-referral-service) — this dashboard's ANC metrics can be built directly from that existing data.
- The Child-side conditions (SUW/MUW/MAM/SAM nutrition grading, Body Temperature, Jaundice, Umbilical Cord, Breathing, Development Milestones, Breastfeeding & Nutrition) now have a real threshold protocol in Part 2 above — the dashboard metrics/linelists here can be built once an equivalent infant risk rule pack and `risk_conditions` seed rows exist for NN/INC/CCV (mirroring the ANC implementation).
- "Separate for ones with permanent risks" (recurring across both columns) implies the dashboard must distinguish beneficiaries with a _permanent_ risk condition (e.g. Age, BOH, Undernutrition — the "only first instance" conditions) from those with a _transient_ one, when reporting improvement/deterioration/progression — this distinction already exists in principle via each RiskCondition's referral/HR trigger cadence (only-first-instance vs every-instance in §1.4/§1.5 and §2.4/§2.5) but is not yet modeled as an explicit "permanent risk" flag anywhere in the schema.
