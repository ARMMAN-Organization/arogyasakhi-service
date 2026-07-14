# ARMMAN

## Software Requirements Specification

### Arogya Sakhi Digital Platform

| Field               | Value                                                 |
| ------------------- | ----------------------------------------------------- |
| **Project Name**    | Arogya Sakhi Digital Platform                         |
| **Vendor**          | Navadhiti Business Consultancy Services Pvt Ltd       |
| **SRS Version**     | v3.0 — Updated Draft                                  |
| **Prepared By**     | Chandrachur Palchaudhuri, Business Analyst, Navadhiti |
| **Submission Date** | 6th May 2026                                          |
| **Classification**  | CONFIDENTIAL — ARMMAN Internal and Vendor Use Only    |
| **Supersedes**      | SRS v3.0 — May 2026                                   |

> **IMPORTANT:** Items marked PENDING require ARMMAN written confirmation before development. Items marked ASSUMPTION are Navadhiti design decisions that require ARMMAN sign-off. All other items are CONFIRMED.

---

## Document Version History

| Version | Date        | Author                   | Summary of Changes                                                                                                                                                                                                                                                                                                                                                                          | Status    |
| ------- | ----------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| v0.1    | 09 Apr 2026 | Chandrachur Palchaudhuri | Initial draft — Sakhi app and Supervisor app sections. Manager dashboard framework.                                                                                                                                                                                                                                                                                                         | Draft     |
| v1.0    | 16 Apr 2026 | Chandrachur Palchaudhuri | SRS v1.0 submitted to ARMMAN with pending items flagged.                                                                                                                                                                                                                                                                                                                                    | Submitted |
| v2.0    | 06 May 2026 | Chandrachur Palchaudhuri | Major update incorporating confirmed rules from working sessions 22–29 April and 5 May 2026. PP schedule corrected to Day 45/75/105. INC formula updated (two-formula approach). HR anchor updated to actual date. CCV phase (13–24m) added. Section 3C Manager Dashboard written from dashboard requirements document. Incentive structure fully documented. Notification rules confirmed. | Submitted |
| v3.0    | 25 May 2026 | Chandrachur Palchaudhuri | All changes as per the comments added following the review completed by the Armman program team on May 18th and follow up clarifications call on 22nd May.<br>Added Section 9 - App Analytics and Product Metrics                                                                                                                                                                           | Submitted |

## Approval Signatures

| Role                  | Name | Signature | Date |
| --------------------- | ---- | --------- | ---- |
| ARMMAN Representative |      |           |      |
| ARMMAN Representative |      |           |      |

---

## 1. Introduction

### 1.1 Purpose

This Software Requirements Specification defines all functional requirements, business rules, operating constraints, and non-functional requirements for the Arogya Sakhi Digital Platform, to be developed by Navadhiti Business Consultancy Services Pvt Ltd for ARMMAN. This document governs WHAT the system must do. HOW it will be built is documented in the companion Architecture and Design Document (ADD).

**System Name:** Arogya Sakhi Digital Platform

**System Purpose:** A mobile and web-based platform that digitises the Arogya Sakhi program — enabling community health workers (Arogya Sakhis) to manage beneficiary enrolment, conduct structured home visits, detect high-risk conditions, escalate critical cases to supervisors. The platform replaces the current paper-based register system and introduces automated visit scheduling, real-time risk classification, and incentive calculation across the full 1000-day maternal and child care journey.

**Intended Audience:** ARMMAN Team, Navadhiti Development Team, Navadhiti QA.

**Scope of this SRS:** This document covers all three components of the Arogya Sakhi Digital Platform:

1. Arogya Sakhi Mobile Application (Android) — used by Arogya Sakhis in the field. Covered in Section 3A.
2. Supervisor Mobile Application (Android) — used by Supervisors to monitor and manage Sakhis. Covered in Section 3B.
3. Manager Web Dashboard (Browser-based) — used by Managers for program-level monitoring and reporting. Covered in Section 3C.

### 1.2 Project Background and Context

**Business Problem:** The Arogya Sakhi program delivers maternal and child healthcare in remote, tribal, and underserved areas of India where access to health facilities is limited. Sakhis currently directly enter data in offline application and maintain register to track beneficiaries test related parameters only. This results in data loss, inability to systematically track missed visits, no real-time supervisor visibility, and delayed identification of high-risk cases requiring urgent attention.

The program covers the full 1000-day care journey — from early pregnancy through the child's second birthday. The digital platform must support the complete journey including the extended 13–24 month child care phase introduced by ARMMAN's 1000 Days approach (confirmed in scope for initial release, April 2026).

### 1.3 Definitions, Acronyms, and Abbreviations

| Term / Acronym | Definition                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------- |
| ADD            | Architecture and Design Document — companion document defining HOW the system is built         |
| ANC            | Antenatal Care — visits conducted during pregnancy                                             |
| ANC-HR         | High-risk ANC visit — generated when a high-risk condition is detected at an ANC visit         |
| ARMMAN         | Commissioning client organisation                                                              |
| AS / Sakhi     | Arogya Sakhi — the community health worker and primary user of the Sakhi app                   |
| BR             | Business Rule                                                                                  |
| CCV            | Child Care Visit — visits conducted for children in the 13–24 month phase (1000 Days approach) |
| CCV-HR         | High-risk Child Care Visit — generated when HR condition detected at a CCV visit (13–24m)      |
| DOB            | Date of Birth                                                                                  |
| DPDPA          | Digital Personal Data Protection Act 2023 (India)                                              |
| EDD            | Expected Date of Delivery — calculated as LMP + 280 days                                       |
| FR             | Functional Requirement                                                                         |
| HR             | High Risk — a clinical condition exceeding defined thresholds                                  |
| INC            | Infant Care — visits conducted for children from birth to 12 months of age                     |
| INC-HR         | High-risk INC visit — generated when HR condition detected at an INC visit                     |
| LMP            | Last Menstrual Period — anchor date for ANC schedule generation                                |
| MAM            | Moderate Acute Malnutrition                                                                    |
| MUAC           | Mid-Upper Arm Circumference — diagnostic measurement                                           |
| NFR            | Non-Functional Requirement                                                                     |
| NN1 / NN2      | Neonatal Visit 1 / 2 — visits within the first 28 days after birth                             |
| Pada           | A hamlet or sub-village unit — geographic unit of Sakhi assignment                             |
| PP1–PP5        | Postpartum visits 1 through 5 — conducted after delivery                                       |
| PRD            | Product Requirements Document                                                                  |
| RTM            | Requirement Traceability Matrix                                                                |
| SAM            | Severe Acute Malnutrition                                                                      |
| SR             | System Rule — a rule governing specific system behaviour                                       |
| SRS            | Software Requirements Specification — this document                                            |
| VAPT           | Vulnerability Assessment and Penetration Testing                                               |

### 1.4 References

| #   | Document                                     | Version / Date             | Relevance                                           |
| --- | -------------------------------------------- | -------------------------- | --------------------------------------------------- |
| 1   | IEEE 830 / ISO/IEC 29148                     | ISO/IEC 29148:2018         | SRS structure and quality                           |
| 2   | OWASP ASVS                                   | v4.0                       | Security requirements baseline                      |
| 3   | Digital Personal Data Protection Act (DPDPA) | 2023                       | Data protection compliance                          |
| 4   | ARMMAN Architecture Roadmap                  | April 2026                 | Mandatory technology stack                          |
| 5   | PRD 1 — Arogya Sakhi Mobile Application      | v2.3, March 2026           | High-level requirements — Sakhi app                 |
| 6   | PRD 2 — Supervisor Mobile Application        | v1.1 updated 23 April 2026 | High-level requirements — Supervisor app            |
| 7   | Arogya Sakhi Dashboard Requirements          | April 2026                 | Manager Dashboard report specifications             |
| 8   | Revised App Form Final 20.3.26               | March 2026                 | Authoritative form field specifications             |
| 9   | High Risk Protocols — Developer Copy         | Updated April 2026         | HR detection thresholds and referral rules          |
| 10  | 1000 Days Visit Flow and Logic               | April 2026                 | 13–24 month child care phase rules                  |
| 11  | PRD Discrepancy and Update Register          | v1.0, May 2026             | Record of confirmed rules superseding PRD documents |
| 12  | INC Formula Discussion Meeting               | 5 May 2026                 | INC visit formula confirmation transcript           |

---

## 2. Overall Description

### 2.1 Product Perspective

**System Classification:** Re-engineering and enhancement of existing system with new mobile application for Sakhis covering the full 1000-day care journey from early pregnancy to the child's second birthday.

**Architecture mandate:** ARMMAN has mandated the following technology stack for all Arogya Sakhi applications. This is not vendor-selected — it is prescribed by ARMMAN's Architecture Roadmap (April 2026).

| Component             | Mandated Technology    | Notes                                                                                                              |
| --------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Backend               | Node.js                | Python permitted for data engineering / ML only                                                                    |
| Mobile apps           | React Native (Android) | Implied by JS stack mandate                                                                                        |
| Manager UI            | ReactJS (Web browser)  | Explicitly stated                                                                                                  |
| Database (OLTP)       | PostgresSQL            | Explicitly stated                                                                                                  |
| Analytics (OLAP)      | ClickHouse             | Open source data warehouse                                                                                         |
| ETL pipeline          | Apache Airflow         | PostgresSQL → ClickHouse migration                                                                                 |
| Reporting             | Metabase               | SQL-based report builder. All SQL queries to be shared with ARMMAN                                                 |
| Rules engine          | gorules                | Mandatory for ALL workflow rules — scheduling, HR detection, escalation, incentives. Config-driven. No hardcoding. |
| CMS / Media           | Strapi                 | Health education content, Learn More, binary assets                                                                |
| CI/CD                 | GitHub Actions         | Jenkins explicitly discouraged                                                                                     |
| Monitoring            | Grafana                |                                                                                                                    |
| External integrations | Single wrapper API     | ArtPark (LLM) (LLM inference — future scope)                                                                       |

### 2.2 User Classes and Characteristics

| User Class           | Technical Level | Frequency | Primary Goals                                                         | Special Needs                                                               |
| -------------------- | --------------- | --------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Arogya Sakhi         | Low             | Daily     | Enrol beneficiaries, conduct visits, fill forms, manage referrals     | No reliable network. Low literacy. Works in field. Offline-first mandatory. |
| Supervisor           | Mid             | Daily     | Monitor Sakhis, approve requests, manage escalations, track inventory | Mobile app. Manages 10–15 Sakhis. Intermittent connectivity.                |
| Program Manager      | Mid             | Weekly    | Monitor program performance, view analytics, generate reports         | Web dashboard. Reliable connectivity. Role-based access.                    |
| System Administrator | High            | As needed | User management, configuration, system health                         | Full admin access. Web-based.                                               |

### 2.3 Operating Environment Constraints

| Constraint                   | Requirement                                                                                                                                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosting                      | All data at rest must be hosted within India.                                                                                                                                                                                |
| Sakhi App — Platform         | Android 10 and above.                                                                                                                                                                                                        |
| Supervisor App — Platform    | Android 10 and above.                                                                                                                                                                                                        |
| Manager Dashboard — Browser  | Chrome 120+, Firefox 118+, Safari 16+, Edge 120+.                                                                                                                                                                            |
| Network — Sakhi / Supervisor | System must be fully functional with zero network connectivity. All forms, schedules, rules, and media cached offline. Data synced when connectivity available.                                                              |
| Network — Manager Dashboard  | Online-only.                                                                                                                                                                                                                 |
| Technology Stack             | Mandated by ARMMAN Architecture Roadmap. See Section 2.1. Vendor does not have discretion on technology selection.                                                                                                           |
| gorules mandate              | All workflow rules must be config-driven using gorules. No business logic hardcoded. Rules deployed as centralised microservice or npm package reusable across all ARMMAN programs.                                          |
| Multi-program architecture   | Enrollment must be built as a reusable component. Common PII fields in shared backend table. Program-specific fields in extension tables. Extensible to support other ARMMAN programs (MMitra, Swasth Kadam etc.) in future. |

### 2.4 Assumptions and Dependencies

#### 2.4.1 Assumptions

- ARMMAN will provide all health education media files and Marathi translations by end of May 2026.
- ARMMAN will provide Learn More content structure (section names, topics, content) before inner screen design begins. Learn More feature will be built as the last development item. The feature shell will be built and deployed with a 'Content coming soon' placeholder. ARMMAN to provide content structure (section names, topics, content) before inner screens are populated. [Confirmed Niharika Vyas 12 May 2026]
- Monthly retainer (Rs 500, Nandurbar) is unconditional — paid regardless of visit count. Pending written confirmation from ARMMAN.
- CCV visit form (13–24m) uses same structure and HR thresholds as INC visit form (0–12m). Pending ARMMAN providing CCV-specific clinical guidelines. (Confirmed - CCV visit form and HR thresholds will be same as INC)
- All Arogya Sakhis have access to an Android device with camera, GPS, minimum 2GB RAM provided by ARMMAN.
- ARMMAN will confirm all items marked PENDING in writing before development of the corresponding feature begins.
- SQL queries for all Metabase reports will be shared with ARMMAN as a deliverable.
- All exported reports and linelists will include a download timestamp.

#### 2.4.2 Dependencies

| Dependency                                    | Owner                        | Expected              | Status                                   |
| --------------------------------------------- | ---------------------------- | --------------------- | ---------------------------------------- |
| Updated HR thresholds document                | Niharika / Prajakta (ARMMAN) | Committed 29 Apr 2026 | Completed considering above assumption 4 |
| CCV clinical rules and form fields for 13–24m | Prajakta (ARMMAN)            | Committed 29 Apr 2026 | Same as HR thresholds document           |
| Health education content and media files      | ARMMAN                       | End May 2026          | Pending                                  |
| Learn More content structure                  | ARMMAN                       | TBD                   | Pending                                  |
| Monthly retainer conditionality confirmation  | ARMMAN                       | 26th May 2026         | Received                                 |
| Training incentive rate written confirmation  | ARMMAN                       | 26th May 2026         | Received                                 |
| CCV re-evaluation logic within 13–24m         | ARMMAN Program Team          | 11th May 2026         | Received                                 |

---

## 3. Functional Requirements

## 3A. Sakhi Mobile Application

### 3A.1 Feature Inventory

| Feature                   | Description                                                                                                        | Status                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| Authentication            | Sakhi login via username and password                                                                              | Confirmed                      |
| Menu                      | Menu bar                                                                                                           | Confirmed                      |
| Enrolment — Mother        | Register pregnant women. ANC schedule auto-generated offline.                                                      | Confirmed                      |
| Enrolment — Child         | Register children 0–12 months. NN and INC schedule generated offline.                                              | Confirmed                      |
| ANC Visit Scheduling      | Formula-driven, uncapped. Max 10 visits. ANC for late delivery post EDD.                                           | Confirmed                      |
| PP Visit Scheduling       | PP1–PP5. Day 0, 15, 45, 75, 105 from delivery.                                                                     | Confirmed                      |
| NN Visit Scheduling       | NN1 and NN2 within first 28 days. Three scenarios based on delivery form date.                                     | Confirmed                      |
| INC Visit Scheduling      | 0–12m. Two-formula approach. Max 11 visits. DOB+370(365+5) cutoff.                                                 | Confirmed                      |
| CCV Visit Scheduling      | 13–24m. State-dependent cadence. Four risk states.                                                                 | Confirmed                      |
| Home Visit Forms          | Enrolment/Registration Forms (Mother and Infant) ANC, PP, NN, INC, CCV, Delivery, Referral, Closure, Reopen forms. | Confirmed                      |
| High Risk Detection       | Offline evaluation of form data against gorules-configured thresholds.                                             | Confirmed                      |
| Referral                  | Standard and Accompanied referral flows. Referral skip request with Supervisor approval.                           | Confirmed                      |
| Escalation                | Missed visit escalation to Supervisor. HR visits immediate escalation.                                             | Confirmed                      |
| Visit Tracker             | Pada-level visit overview. Priority ordering: Visit Expiry > HR > medium risk > low risk (Normal)                  | Confirmed                      |
| My Beneficiaries          | Full beneficiary directory. Search, filter by pada and risk.                                                       | Confirmed                      |
| Dashboard                 | Visit stats, beneficiary counts, notification banner.                                                              | Confirmed                      |
| Health Education Messages | Post-form HR condition messages. Strapi-managed content.                                                           | Confirmed — content pending    |
| Learn More                | Knowledge base. Two-level: Sections > Topics. Offline cached.                                                      | Confirmed — content pending    |
| Incentive Calculation     | Per visit, per referral, meeting, training, monthly retainer.                                                      | Confirmed — some rates assumed |
| Data Sync                 | Manual trigger. Deferred with retry. 3-day notification if unsynced.                                               | Confirmed                      |
| Language                  | English and Marathi. Default English.                                                                              | Confirmed                      |

### 3A.2 Detailed Functional Requirements

#### 3A.2.1 Authentication and Access Control

**FR-S-1.1:** Sakhi must authenticate using Username and password. Login must work offline using locally cached credentials.

**FR-S-1.2:** Session must persist across app restarts. Sakhi must not be required to re-login on every app open unless explicitly logged out.

**FR-S-1.3:** Role-based access — Sakhi app is accessible only to Arogya Sakhis. No cross-role access.

#### 3A.2.2 Enrolment

**FR-S-2.1:** Sakhi must be able to register a pregnant woman using the enrolment form. Required fields: LMP date, EDD (auto-calculated as LMP + 280 days), age, demographics, geographic details (state, district, block, PHC, sub-centre, village, pada), mobile numbers, RCH number.

**FR-S-2.2:** On enrolment form submission, the system must auto-generate the complete ANC visit schedule offline on the device. No server connectivity required for schedule generation.

**FR-S-2.2A:** NN, INC, and CCV visit schedules are also generated offline on the device — consistent with ANC schedule generation. NN schedule is generated at child registration or delivery form submission. INC schedule is generated at child registration using the two-formula approach. CCV schedule is generated at the 12-month INC-to-CCV transition point. All schedules are stored in local SQLite and do not require connectivity to generate or display.

**FR-S-2.3:** Child registration eligibility: 0 to 12 months (0 to 365 days) at time of registration. Two sub-rules apply:

- If child is registered through an enrolled mother's journey (mother is active in the system): child must be registered between 0 and 6 months (0–183 days). For ANC-enrolled mothers, child registration is automatic on delivery form submission — no prompt required. The 'Register child' flow applies only to direct registrations where the mother was not enrolled in ANC.
  Note: Child registration can be delayed in case of delivery is done at maternal place and mother is coming back after few months of delivery
- If child is registered independently (mother not enrolled): child can be registered between 0 and 12 months (0–365 days). Mother data is not linked.

**FR-S-2.4:** Duplicate detection must fire on Name + DOB + Village/Pada at the point of registration. If a match is found, Sakhi must be shown a duplicate warning before proceeding.

Duplicate detection fires at the point of registration. All of the following must match for a duplicate warning to be shown: Mobile number AND Name (fuzzy lookup) AND DOB AND Village/Pada AND LMP AND Delivery status AND Closure form status. All fields must match simultaneously — a partial match does not trigger a warning. If a duplicate is detected, Sakhi must acknowledge the warning before proceeding. Alert content to be provided by ARMMAN content team.

(Flow - Sakhi will enter the data - above fields are in the present in the registration form. At the submit of the registration form, the system has to check if the closure form and delivery form exists for this beneficiary. If both exist, then this will be treated as a new pregnancy. If both not present - this has to be treated as a duplicate entry and registration cannot proceed)

**FR-S-2.5:** Re-enrolment after program completion. If a mother who has completed PP5 (program cycle completed) presents for a new pregnancy, a new enrolment with a new Beneficiary ID must be created. The duplicate detection alert will fire — the system must handle this gracefully with a prompt: 'A previous record exists for this beneficiary with a different LMP date. Proceed with new enrollment for a new pregnancy?'

For re-enrolment where a previous record exists in Journey Complete or Closed status: if a match is found on duplicate detection fields but with a different LMP and confirmed Delivery status on the previous record, the system must show the alert: 'A previous record exists for this beneficiary. Is this a new pregnancy?' — with options to proceed with new enrollment or cancel. [Confirmed Shweta Chidrawar and Niharika Vyas, May 2026]

#### 3A.2.3 Visit Scheduling

The scheduling engine is the core technical component of the Sakhi app. All schedules must be generated offline on the device. The schedule is fixed at the point of enrolment / delivery and does not shift based on actual visit completion dates. The only trigger for schedule regeneration is an approved LMP/EDD change by the Supervisor.

> **All scheduling rules must be implemented using gorules as config-driven rules — no hardcoded logic.**

**ANC Visit Schedule**

**FR-S-3.1:** ANC schedule is formula-driven and uncapped.

**Formula: ((EDD − Registration date) / 30) + 1**

Maximum possible visits = 10 (for a woman registered on her LMP date). No upper cap is applied. The formula determines the exact count.

**FR-S-3.2:** ANC1 is generated on Day 0 — the registration date itself. Window: Day 0 to Day +5. ANC1 opens on registration date and closes on Day 5.

**FR-S-3.3:** ANC2 through ANCn are scheduled every 30 days from the previous scheduled date. Window: Schedule date −5 to +5 days.

**FR-S-3.4:** ANC-HR visit is generated 15 days from the ACTUAL date the Sakhi completed the triggering visit (not the scheduled date). Window: Actual date + 15 ±2 days.

**FR-S-3.5:** If 2 consecutive ANC visits are missed, the system escalates to the Supervisor immediately.

**FR-S-3.6:** If 1 ANC-HR visit is missed, the system escalates to the Supervisor immediately.

**FR-S-3.7:** When the delivery form is submitted, ALL open ANC visits are automatically marked as LAPSED, regardless of their status or window position.

**SR-ANC-01 — ANC Post-EDD Visit Naming:**

If the delivery form is not filled by EDD + 7 days, the system generates an additional ANC visit on EDD + 8. This visit is named dynamically: ANC(total regular ANC visits + 1). Example: if 8 regular ANC visits were generated, this visit is named ANC9. If 10 were generated, it is ANC11. The name is system-generated. Window: EDD + 8 to EDD + 13 (5-day one-sided window). If missed: escalates to Supervisor immediately.

**PP Visit Schedule**

All PP visits are anchored to the delivery date. Schedule is generated on delivery form submission. PP schedule does not shift based on actual completion dates.

| Visit | Scheduled Date                                   | Window Opens | Window Closes | Escalation on Miss                |
| ----- | ------------------------------------------------ | ------------ | ------------- | --------------------------------- |
| PP1   | Day 0 (delivery date)                            | Day 0        | Day +14       | 1 missed → Supervisor immediately |
| PP2   | Day +15                                          | Day +15      | Day +28       | 1 missed → Supervisor immediately |
| PP3   | Delivery Day+58 (PP2 Window close days(28) + 30) | Day +53      | Day +63       | 1 missed → Supervisor immediately |
| PP4   | Delivery Day+88 (PP3 scheduled(58 + 30))         | Day +83      | Day +93       | 1 missed → Supervisor immediately |
| PP5   | Day +105 (PP4 scheduled(88 + 30))                | Day +113     | Day +123      | 1 missed → Supervisor immediately |

_Note: PP1 and PP2 use fixed date ranges (not ±N windows). PP3–PP5 use ±5 day windows. PP5 completion triggers the mother closure prompt._

**NN Visit Schedule**

NN visits are governed by the date the delivery form is filled relative to the delivery date. Three scenarios apply:

| Scenario | Delivery Form Filled | NN1                                                        | NN2                                                                           |
| -------- | -------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| A        | Day 0 to Day 14      | Filled on same day as delivery form. Window Day 0–14.      | Generated after NN1 completion. Window Day 15–28. Opens Day 15.               |
| B        | Day 15 to Day 27     | Skipped — window closed. Not generated. Not marked missed. | Generated immediately. Still called NN2. Window: remaining days up to Day 28. |
| C        | Day 28               | Skipped.                                                   | Filled in same session as delivery form on Day 28.                            |

NN visits will be generated after child registration based on date of birth/date of delivery in case of ANC mother or direct child. In case of child of ANC mother, will ask do you want to register child in delivery form. If marked yes, open child registration form, fill child registration form and then schedule NN, INC, CCV visit as applicable.

**SR-NN-01:** No HR visits are generated during the neonatal phase. If a critical condition is detected during NN1 or NN2, the referral flow applies — not HR visit generation.

NN window rule: NN1 window is fixed Day 0–14. NN2 window is fixed Day 15–28. Both are fixed date ranges, not ±N windows. If 1 NN visit is missed, Supervisor escalation is triggered immediately.

**INC Visit Schedule (0–12 months)**

INC visits cover the infant care period from end of neonatal phase to 12 months of age. INC scheduling uses a two-formula approach based on registration timing.

_Early registration (Day 0 to Day 58 from DOB):_
Visit count = Round(Total days in a year − neonatal period) / 30. INC1 anchor = DOB + 58 days. INC2 through INC11 chain every 30 days. All 11 visits are generated at enrolment.

_Late registration (after Day 58 from DOB):_
INC1 = Registration date itself (same day as registration). INC visit count = Round((365 − (Registration date − DOB)) / 30). This formula gives the number of additional visits after INC1. INC2 onwards chain every 30 days from INC1.

**Hard cutoff rule:**
Any INC visit with a scheduled date beyond DOB + 370 days is dropped — not generated and not marked as missed. The CCV phase begins after the last generated INC visit. The cutoff is DOB + 365 + 5 day buffer = DOB + 370.
The 1st visit of the CCV journey will begin with the CCV-HR visit.

_Note: Early/late registration boundary (Day 58) is a system calculation category only — it does not change the program definition of registration._

INC window: Schedule date ±5 days. INC-HR: generated 15 days from ACTUAL completion date of triggering INC visit, window ±2 days. If 2 consecutive INC visits missed: Supervisor escalation. If 1 INC-HR missed: Supervisor escalation immediately.

**CCV Visit Schedule (13–24 months — 1000 Days)**

Child Care Visits cover the extended child care journey from 13 to 24 months as part of the 1000 Days approach. CCV scheduling is state-dependent — the schedule should be generated at the time of registration in order to forecast the number of visits for next year.

Proposal for the above -
Reason for change -
Generating a default 6-visit CCV schedule at registration **is technically possible** — but it would be a **projected placeholder schedule**, not a clinically accurate one. The system would then need to **replace it** at the INC-to-CCV transition with the actual risk-based schedule.

This raises a problem: if the Sakhi sees 6 CCV visits pre-generated from day one, and at month 12 the child is found to be high-risk requiring monthly visits — the system now has to delete 6 visits and regenerate new ones. That is messy, confusing for the Sakhi, and risky if the app is offline and the replacement doesn't sync cleanly.

Recommendation -
The two needs should be handled separately:

- **App scheduling:** CCV schedule is generated at the INC-to-CCV transition (last INC visit or DOB + 365), based on actual risk state. This keeps it clinically accurate and architecturally clean.
- **Forecasting/budgeting:** The dashboard generates a projected CCV visit count for all children who will enter the CCV phase in the upcoming financial year, using the default 6-visit assumption. This is a reporting feature, not an app scheduling feature.

**Risk state determination:**

At the point the child transitions from the INC phase (12 months), the system evaluates the last 3 completed INC visits of the 0–12m period to determine the opening CCV risk state. This is a one-time evaluation at transition point.

| Risk State                       | How Determined                                                                                                           | 13–18m Cadence                        | 19–24m Cadence                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | ------------------------------------- |
| Never at HR                      | No HR conditions detected in entire 0–12m period (full scan of all INC visits). Last 3 visits are a subset of this scan. | 1 visit every 2 months                | 1 visit every 2 months                |
| Currently HR — SAM / Danger Sign | SAM or danger sign detected at most recent INC visit                                                                     | HR visit in 30 days (Every detection) | HR visit in 30 days (Every detection) |
| Currently HR — Other HR          | Other HR condition at most recent INC visit (even if previously triggered)                                               | HR visit in 30 days (Every detection) | HR visit in 30 days (Every detection) |
| Recently Recovered               | Last 3 INC visits were at risk                                                                                           | 1 visit per month                     | 1 visit every 2 months                |
| Stable Low Risk                  | Last 3 INC visits normal, normal growth, fully immunised                                                                 | 1 visit every 2 months                | 1 visit every 2 months                |

_Note: Every time a HR condition is detected during the visit, subsequent HR visit will be triggered once, 30 days later. Even if the HR visit has been triggered for that condition in the past._

HR visits in CCV phase are single instance — one HR visit generated per detection. After HR visit completion, child reverts to normal age-based cadence.

CCV window: Schedule date ±5 days. Escalation: 1 missed CCV visit = immediate Supervisor escalation (CCV and CCV-HR).

Program exit: 24 months (DOB + 730 days) if no HR at last visit. If HR detected at last CCV visit, journey extends — one CCV-HR visit generated 30 days later. Child closure prompt appears after CCV-HR visit completion. In this case, program closure will be at 25 months. **Closure form to be triggered at the end of the last CCV-HR visit.**

> 🚩 **CONFIRMED** — CCV visit form uses same clinical fields, HR thresholds, and referral conditions as INC visit form (0–12m). No separate CCV-specific guidelines required. [Confirmed Niharika Vyas, May 2026]

#### 3A.2.4 Home Visit Forms

**FR-S-4.1:** All visit forms must work offline. Forms load from local SQLite storage. Data is queued for sync.

**FR-S-4.2:** No incomplete form status exists. If Sakhi exits a form mid-way, the form is discarded and the visit remains in Open state. Sakhi must restart the form on the next attempt.

**FR-S-4.3:** Delivery event flow differs based on whether the mother was enrolled in ANC:

For ANC-enrolled mothers: Delivery form + PP1 + NN1 form appear together as one session. On submission, child profile is automatically created using data from the delivery form — no separate child registration step. NN schedule is generated immediately. Child journey begins: NN → INC → CCV.

For direct child registration (mother not enrolled in ANC):
a) Sakhi visits the mother, Sakhi fills a separate child registration form. Child demographic data is entered manually — no auto-population from delivery form. NN schedule is generated after registration form submission.

_Further note: NN1 is conducted as part of the delivery session for ANC-enrolled mothers — after Delivery + PP1 form submission, NN1 opens as the next form in the same session. For directly registered children, NN1 is conducted at the time of child registration form submission. Even in direct registration, NN form will be filled at the time of registration. Like enrollment flow for ANC._

**FR-S-4.4:** If a critical danger sign is detected mid-form, an Immediate Urgency banner appears. Closing the banner will close the form. After Critical condition banner, form cannot be filled.

> ⚠️ **Confirmed** — Critical condition mid-form: Option B (banner forces exit to referral, form is discarded).

**FR-S-4.5:** Form version change log must be maintained. When ARMMAN updates forms, the system must download the new version and record what changed.

**FR-S-4.6:** Pre-Visit Health History Screen — Before the Sakhi begins filling a visit form, a Pre-Visit Health History screen is displayed showing the beneficiary's health data from the last 2 completed visits. The screen displays up to 5 risk factors only, drawn from the following: BP, Haemoglobin, Weight, Blood Sugar, and Temperature. This screen is read-only — the Sakhi cannot edit data from it. It serves as a clinical reference to inform the current visit. The screen must work offline using locally cached visit data. (1st visit, no data will be available do this screen will not be shown. Second visit onwards, data will be available, so this screen will be shown. Along with 5 conditions, if there is any permanent/ chronic condition identified, that will also be mentioned)

**FR-S-4.7: Form Field Validation Framework**

All visit forms, enrolment forms, and closure forms must enforce field-level input validation in real time as the Sakhi fills each field — not at the point of form submission. Validation must run offline on the device using locally cached rules.

The following five categories of validation apply across all forms. The field-level rules for each form are maintained in the Revised App Form Final (20 March 2026) Excel document. A categorised summary for developer reference is provided in Appendix J.3.

**Category 1 — Date format and range validation:** All date fields must use the format dd-mm-yyyy. A calendar picker must be provided. Specific constraints per field include: visit dates cannot be future dates; LMP cannot be a future date or after the registration date; delivery date must be after LMP and on or before today; death dates must be after delivery date and on or before today; vaccination dates cannot be future dates and cannot be before date of birth.

**Category 2 — Numeric range validation:** All numeric clinical fields must validate against defined ranges. If the Sakhi enters a value outside the range, the field must show an inline error message before the Sakhi can proceed. Ranges include but are not limited to: BP Systolic 70–300 mmHg; BP Diastolic 40–130 mmHg; Haemoglobin 1–18 g/dl; Weight 25–100 kg; Height 120–190 cm; MUAC 10–40 cm; Body Temperature 94–105°F; Blood Glucose 40–400 mg/dl; Fundal Height 10–50 cm; Child Respiratory Rate 10–90; Child Weight 0.5–15 kg; Child Length 25–99 cm; IFA tablets 0–35; Family members 2–15.

**Category 3 — Cross-field consistency validation:** Certain fields must be validated against each other. The following consistency rules apply: Para must be less than or equal to Gravida; Abortions must be less than or equal to Gravida; Dead children must be less than or equal to Live births; the sum of Live births + Stillbirths + Abortions must equal Gravida (including the current pregnancy). If these rules are violated, the Sakhi must be shown an inline warning before submission.

**Category 4 — Auto-calculated and auto-populated fields:** The following fields must be calculated automatically by the system and must not be manually entered by the Sakhi: EDD (formula: LMP + 280 days); Gestational age in weeks (formula: Floor((Registration date − LMP) / 7)); Current gestational age at each visit (formula: Floor((Visit date − LMP) / 7)); BMI (formula: Weight / (Height in metres)²); Gestational weight gain (delta from previous visit weight); Nutritional status Z-scores — Wasting (weight-for-length), Stunting (length-for-age), Underweight (weight-for-age) — calculated using WHO growth standards; Child age in months (formula: Floor((Today − DOB) / 30)); Beneficiary ID (auto-generated offline, unique); Unique ID (format: State(2)-District(3)-Block(3)-ID(6)).

Auto-populated fields (carried forward from previous forms) include: geography fields (State, District, Block, PHC, Village, Pada) from Sakhi's assigned profile; project name from Sakhi's assigned project; RCH number from registration; vaccination history from previous visit forms (editable after auto-population). Auto-populated fields must be editable where the "Is an editable field?" column in the form schema is marked Yes.

**Category 5 — Conditional field visibility:** Certain fields must be shown or hidden based on responses to other fields. Key rules include: Fetal Heart Rate, Fetal Movements, and Fundal Height fields are only shown after 20 weeks of gestational age; Kangaroo Mother Care (KMC) fields are only shown if birth weight is less than 2500g or delivery type is preterm; the "Convert to Accompanied?" question in the referral follow-up form is only shown if the original referral was Standard type; if "None" is selected in a multi-select field, all other options in that field must be disabled; cause-of-death fields are only shown if the death outcome is selected.

**Category 6 — Media and consent validation:** The Arogya Sakhi intro video and consent audio on registration forms must be played fully before the Sakhi can proceed to the next section. A progress indicator must be shown. Photo capture fields (consent photo, sonography report, accompanied referral proof) must use live camera capture only — access to the device photo gallery must be denied for these fields.

**FR-S-4.8: Post-Submission Editable Fields**

Selected fields across enrolment, visit, and closure forms are editable after successful form submission without requiring the Sakhi to refill the entire form. This is separate from and in addition to the standard form submission flow.

Rules that apply to all post-submission edits:

1. An Edit button must be visible on the submitted form record for the fields that are editable. Fields not marked as editable must appear read-only.
2. All post-submission edits must be recorded in the audit trail with: field name, old value, new value, edited by (Sakhi ID), edit date and time, and sync timestamp.
3. Post-submission edits are queued in SQLite and synced to the server on the next data upload — the same as form submissions.
4. LMP date edits are a special case and follow a two-step flow: Step 1 — Sakhi taps Edit on the LMP field. The system opens a sonography report image upload screen. The Sakhi must upload the sonography image first — the date field remains locked until the image is uploaded. Step 2 — Once the image is uploaded, the LMP date field becomes editable. The Sakhi enters the corrected LMP date. Both the sonography image and the new LMP date are submitted together to the Supervisor for approval via FR-SV-4.2. On Supervisor approval: LMP is updated system-wide and the ANC visit schedule is regenerated. On Supervisor rejection: LMP remains unchanged and Sakhi is notified.
5. All other editable fields listed below do not require Supervisor approval. They take effect immediately on device and are synced on next upload.

Editable fields by form — complete list:

_PW Registration Form:_ LMP date (requires Supervisor approval and sonography upload), EDD (auto-recalculated if LMP changes), Beneficiary address, Mobile number, Phone owner, Gravida, Para, Living children, Abortions, Stillbirths, Dead children, Sickle Cell status.

_Infant Registration Form:_ Caregiver name, Mother date of birth, Beneficiary address, Mobile number, Phone owner, Child birth length, Child birth weight, Current length at registration, Current weight at registration.

_Delivery / PP / Neonatal Form:_ Child 1 birth length and birth weight, Child 2 birth length and birth weight, Child 3 birth length and birth weight (where applicable), Cause of neonatal death, Place of neonatal death, Date of neonatal death (for each child where applicable).

_ANC Closure Form:_ Closure reason, Date of event, Time of maternal death, Cause of maternal death, Place of maternal death, Other (specify field).

_Child Closure Form:_ Closure reason, Date of event, Time of infant death, Cause of infant death, Place of infant death, Other (specify field).

_Infant Visit Form:_ All vaccination fields (BCG, OPV, Pentavalent, IPV, Rotavirus, PCV, MMR, DPT booster, Vitamin A, OPV booster and all associated date fields) — these auto-populate from previous visit records and remain editable to allow corrections. Source of immunisation data field is also editable.

_ANC Visit Form, Referral Form:_ No fields are editable after submission.

The complete editable field list is maintained in the "Is an editable field?" column of the Revised App Form Final (20 March 2026) Excel document and is summarised in Appendix J.4 for developer reference.

#### 3A.2.5 High Risk Detection

**FR-S-5.1:** HR conditions are highlighted in real time while the form is being filled. The system evaluates form data against clinical thresholds configured in gorules. Health messages and referral flow are triggered based on risk detected during form filling. This evaluation happens offline on the device. Only the HR visit is scheduled post form submission.

**FR-S-5.2:** If one or more HR conditions are met, the system simultaneously: (a) flags the beneficiary as high-risk with a risk badge; (b) generates an HR visit 15 days from the ACTUAL completion date after the form is filled out; (c) queues a health education message for display.

**FR-S-5.3:** The HR visit trigger behaviour differs between the two child phases. In the 0–12m INC phase, HR detection is cumulative — every time an HR condition is identified at a visit, a new HR visit is generated regardless of whether that condition was flagged before. In the 13–24m CCV phase, every detection triggers one HR visit 30 days later, regardless of whether that condition was previously flagged. This is a deliberate program decision for the CCV phase and is confirmed by ARMMAN.

**FR-S-5.4:** HR detection thresholds are configured in gorules and must be updatable without code redeployment.

> ⚠️ **PENDING** — Updated HR thresholds document from ARMMAN (Prajakta, committed 29 April 2026). Existing Appendix D to be updated on receipt. - Update: Shared.

#### 3A.2.6 Referral (NEW) (Post Meeting on 22nd May, 2026)

**FR-S-6.1:** Two referral types exist — Standard and Accompanied.

- **Standard** — Sakhi advises the beneficiary to visit a health facility independently. No escort required.
- **Accompanied** — Sakhi physically escorts the beneficiary to the health facility. The Sakhi marks this as "Accompanied" in the referral form at the time of the visit.

For accompanied referrals: no Supervisor approval is needed for the Sakhi to go. The Sakhi decides independently to accompany the beneficiary. Supervisor approval is required only to confirm that the accompanied referral happened and to release the higher incentive amount.

**FR-S-6.2:** A 7-day referral follow-up window opens on the day the referral form is submitted. The Sakhi must fill the referral follow-up form within this 7-day window. No visit blocking applies during this window — the next scheduled visit proceeds normally.

**FR-S-6.3:** The referral follow-up form has the following structure and flow:

- Step 1 — Visit data: Sakhi fills visit data, reviews summary, reads health information.
- Step 2 — Referral section: The form asks "Did beneficiary visit any health facility?"

**If Yes:** Sakhi completes the follow-up form normally. Referral marked Complete.

**If No:** Sakhi must enter a reason. The form then checks if the original referral was Standard.

- If the original referral was **Standard**: system asks "Do you want to convert this to an Accompanied referral?"
  - If **Yes** → A new accompanied referral form is generated. Must be completed within the original 7-day window. No extension of window.
  - If **No** → Form submits. A Referral Follow-up Incomplete card is sent to Supervisor. Supervisor has no timeline to act — the card stays pending indefinitely. If Supervisor approves: referral status in DB becomes Lapsed. UI for Sakhi continues to show "Pending Referral Follow-up" — no new status is shown to avoid confusion. No incentive is paid. If Supervisor rejects: Sakhi must fill the follow-up form.
- If the original referral was **Accompanied**: the conversion question does not appear.

**FR-S-6.4:** For accompanied referral follow-up: Sakhi uploads a photo of the health facility as proof. The follow-up form is submitted. Supervisor receives a card to review the photo and confirm the accompanied referral happened. On Supervisor approval: accompanied referral incentive is released. Supervisor approval has no timeout — stays pending indefinitely.

**FR-S-6.5:** Referral incentive rules:

- Standard referral completed → Rs 50
- Accompanied referral approved by Supervisor → Rs 160 (Palghar) / Rs 300 (Nandurbar)
- Referral Follow-up Incomplete approved by Supervisor → Rs 0 (no incentive)

#### 3A.2.7 Escalation and Notifications

**FR-S-7.1:** Escalation triggers:

| Visit Type   | Escalation Trigger   | Type                            |
| ------------ | -------------------- | ------------------------------- |
| ANC          | 2 consecutive missed | Supervisor escalation           |
| ANC-HR       | 1 missed             | Immediate Supervisor escalation |
| ANC-Post EDD | 1 missed             | Immediate Supervisor escalation |
| PP1–PP5      | 1 missed             | Immediate Supervisor escalation |
| NN1, NN2     | 1 missed             | Immediate Supervisor escalation |
| INC          | 2 consecutive missed | Supervisor escalation           |
| INC-HR       | 1 missed             | Immediate Supervisor escalation |
| CCV          | 1 missed             | Immediate Supervisor escalation |
| CCV-HR       | 1 missed             | Immediate Supervisor escalation |

**FR-S-7.2:** Notification banner appears at top of dashboard when active notifications exist. Multiple notifications can stack. Each has a dismiss (X) button.

Notification types, triggers, and stacking order:

| No  | Notification Type                               | Trigger                                     | CTA                                    |
| --- | ----------------------------------------------- | ------------------------------------------- | -------------------------------------- |
| 1   | HR escalation / missed visit escalation outcome | Supervisor takes action (Transfer or Close) | Close beneficiary (if not transferred) |
| 2   | Referral incomplete escalation outcome          | Supervisor rejects non-referral request     | Fill Referral Form                     |
| 3   | EDD approaching                                 | EDD − 7 days                                | None                                   |
| 4   | High missed visits                              | 2 consecutive ANC or INC missed             | See Tracker                            |
| 5   | Beneficiary re-open / closure form update       | Supervisor approves or rejects              | None                                   |
| 6   | LMP change request update                       | Supervisor approves or rejects              | None                                   |
| 7   | Form data update                                | ARMMAN pushes form update via backend       | Update                                 |
| 8   | Data upload stopped mid-way                     | Upload fails during progress                | None — progress bar shown              |
| 8   | Data not uploaded                               | 3 days without sync                         | None                                   |

**Priority order would be - 6>8>7>1>3>4>2>5**

#### 3A.2.8 Visit Tracker

**FR-S-8.1:** Visit Tracker shows all visits the Sakhi needs to complete. Organised by pada/village. Priority order: Visit expiry > High risk > Medium risk > Low risk (Normal).

**FR-S-8.2:** Visit states:

- **Open** — visit is within its ±5 day window
- **Pending Referral Follow-up** — referral form done, follow-up form not yet done
- **Missed** — window closed without visit being conducted
- **Completed** — Sakhi conducted visit and entered all required data, no missing mandatory fields
- **Lapsed** — closed by system due to an event. DB only, excluded from completion rate calculations. This state will only be maintained in the DB and data. Sakhi/Supervisor app will not have this state.

(Please refer this section of the PRD if further clarification needed -https://docs.google.com/document/d/11uTCLy9F_8K-)

**FR-S-8.3:** Referral Follow-up tab shows all beneficiaries with pending referral follow-ups.

#### 3A.2.9 My Beneficiaries

**FR-S-9.1:** Three tabs: Active, Journey Complete, Closed. Sub-tabs under Active: All, Open, Pending Referral, Missed.

**FR-S-9.2:** Search by name and mobile number. Filter by pada (multi-select) and risk level (multi-select).

**FR-S-9.3:** Beneficiary Profile Screen — The beneficiary profile screen must display all submitted form data as chronological cards for that beneficiary. Cards are organised in order:
Mother: Enrollment form → ANC visit forms → Delivery form → PP visit forms → Closure.
Child: Enrollment/NN visit forms → INC visit forms → CCV visit forms → Closure form.
Each card shows the form type, date, and clinical values. Tapping a card expands it to show all submitted fields. Editable fields as defined in FR-S-4.8 and Appendix J.4 show an Edit button on the expanded card view. All cards must be accessible offline from SQLite. [Confirmed Niharika Vyas 2 Jun 2026]

#### 3A.2.10 Closure and Reopen

**FR-S-10.1:** Mother closure triggers: miscarriage, abortion, still birth, maternal death, migration, program cycle completed (PP5), withdrawal. PP5 form submission immediately opens the closure form in the same session. Sakhi must complete the closure form before exiting. All open visits remaining at the time of closure form submission are automatically marked as Lapsed.

**FR-S-10.2:** Child closure triggers: infant death, migration, program cycle completed (CCV completion triggers closure prompt — unless HR is detected at the last CCV visit, in which case one CCV-HR visit is generated first. Closure prompt appears after that CCV-HR visit is completed.), withdrawal.

Last CCV visit form submission (or CCV-HR if journey extended) immediately opens the child closure form in the same session. All open visits remaining at the time of closure form submission are automatically marked as Lapsed.

**FR-S-10.3:** Reopen is available for: Migration (if beneficiary returns) and Closed by mistake. Reopen request goes to Supervisor for approval.

#### 3A.2.11 Dashboard and Data Sync

**FR-S-11.1:** Dashboard shows: open visit count (with visit expiry sub-count in orange), active beneficiaries (mothers and infants with HR counts), notification banner, Data Upload button with unsynced form count.

**FR-S-11.2:** Data sync is manual. Sakhi taps Data Upload button when connectivity is available. Upload modal shows progress by form category — Registration, Visit, Referral, and other categories — each with a progress status indicator.

**FR-S-11.3:** Data sync notifications: (a) If upload stops mid-way — immediate notification. (b) No upload in 3 days = Sakhi appears on Supervisor monitoring dashboard list. No push notification sent to Supervisor — list updates automatically.

**FR-S-11.4:** Supervisor monitoring dashboard shows a list of Sakhis who have not synced in 3 days. List updates automatically — no push notification to Supervisor.

#### 3A.2.12 Incentive Calculation

> **All incentive rates are stored in a configurable master settings table. No incentive amount is hardcoded. ARMMAN administrators can edit any rate through the Manager Dashboard settings module without code changes.**

**SR-INCENTIVE-01:** Incentive master table must maintain full audit log of all rate changes — who changed what, from what value, to what value, on what date. Rate changes take effect from the date of update and do not retrospectively affect previously calculated incentives.

| Incentive Type                    | Rate                    | Geography      | Status                             |
| --------------------------------- | ----------------------- | -------------- | ---------------------------------- |
| ANC visit                         | Rs 65 per visit         | All districts  | Confirmed                          |
| INC visit                         | Rs 65 per visit         | All districts  | Confirmed                          |
| PP visit                          | Rs 65 per visit         | All districts  | Assumed — same rate                |
| NN visit                          | Rs 65 per visit         | All districts  | Assumed — same rate                |
| CCV visit (13–24m)                | Rs 65 per visit         | All districts  | Assumed — same rate                |
| ANC-HR, INC-HR, CCV-HR visits     | Rs 65 per visit         | All districts  | Assumed — same rate                |
| Standard referral completion      | Rs 50 per visit         | All districts  | Confirmed                          |
| Accompanied referral              | Rs 160 per visit        | Palghar        | Confirmed                          |
| Accompanied referral              | Rs 300 per visit        | Nandurbar      | Confirmed                          |
| Non-referral / lapsed / timed out | Rs 0                    | All districts  | Confirmed                          |
| Monthly meeting honorarium        | Rs 200 per month        | All districts  | Confirmed — Wages Report           |
| Quarterly training honorarium     | Rs 200 per quarter      | All districts  | Confirmed — Wages Report           |
| Monthly retainer charge           | Rs 500 per AS per month | Nandurbar only | Confirmed — conditionality pending |

#### 3A.2.13 Learn More (Knowledge Base)

> **Development priority:** Learn More is the last feature to be built after all other features are complete. Initial release will display 'Content coming soon' placeholder until ARMMAN provides final content. [Confirmed Niharika Vyas 12 May 2026]

**FR-S-13.1:** Named 'Learn More' in the app menu. Knowledge base to help Sakhis reference information on diagnostic tests and risks.

**FR-S-13.2:** Structure: Two-level — Sections containing Topics. Each topic can have a different media type (QnA text, PDF, Infographic, GIF, Video, Audio).

**FR-S-13.3:** All content cached on device offline. Content managed through Strapi CMS by ARMMAN administrators.

**FR-S-13.4:** Learn More content also accessible contextually within form screens — relevant content appears at the bottom of specific form fields.

> ⚠️ **PENDING** — Learn More content — section names, topics, content files. ARMMAN to provide before inner screen design begins. [Open item 12]

### 3A.3 Business Rules — Sakhi App

| Rule ID | Rule                                                                                                                                                                                                                             | Source                                       |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| BR-01   | ANC schedule is fixed at enrolment and does not shift on missed visits. Only regenerates on Supervisor-approved LMP/EDD change.                                                                                                  | Confirmed — Niharika, 31 Mar 2026            |
| BR-02   | INC schedule is fixed at enrolment (early registration) or at registration date (late registration). Does not shift on missed visits.                                                                                            | Confirmed — Shweta/Prajakta, 5 May 2026      |
| BR-03   | HR visit anchor is the actual date the Sakhi completed the triggering visit — not the scheduled date. Applies to ANC-HR, INC-HR, and CCV-HR.                                                                                     | Confirmed — ARMMAN answers file, 23 Apr 2026 |
| BR-04   | When delivery form is submitted, ALL open ANC visits are automatically marked as Lapsed.                                                                                                                                         | Confirmed — ARMMAN answers file, 23 Apr 2026 |
| BR-05   | PP3, PP4, PP5 are anchored to scheduled dates, not actual completion dates. If PP2 completed late, PP3 stays at Day 45.                                                                                                          | Confirmed — ARMMAN visit logic table         |
| BR-06   | No HR visits are generated during the neonatal phase (NN1, NN2). Critical conditions in neonatal phase trigger the referral flow only. [SR-NN-01]                                                                                | Confirmed — May 2026                         |
| BR-07   | A 7-day referral follow-up window blocks only the form filling of the next scheduled visit. Follow-up must be completed before the next visit opens.                                                                             | Confirmed — PRD 2.0                          |
| BR-08   | ANC Post-EDD visit name is system-generated dynamically as ANC(n+1) where n = total regular ANC visits. [SR-ANC-01]                                                                                                              | Confirmed — ANC schedule walkthrough session |
| BR-09   | Non-referral, lapsed, or timed out = Rs 0 incentive. No exceptions.                                                                                                                                                              | Confirmed — May 2026                         |
| BR-10   | Continue is not an explicit Supervisor button for PP/NN/INC/INC-HR escalations. If Supervisor takes no action, the schedule continues and escalation card remains open.                                                          | Confirmed — ARMMAN answers file, 23 Apr 2026 |
| BR-11   | During a beneficiary transfer, the schedule continues running independently. Visits get missed during the review period. Supervisor must provide reasons for missed visits.                                                      | Confirmed — ARMMAN answers file, 23 Apr 2026 |
| BR-12   | INC visits beyond DOB + 370 days are dropped — not generated and not marked as missed. CCV phase begins after last generated INC visit.                                                                                          | Confirmed — Shweta/Prajakta, 5 May 2026      |
| BR-13   | CCV risk state is evaluated once at 12-month transition based on last 3 completed INC visits. No re-evaluation occurs within the 13–24m period — the opening risk state is fixed at the transition point for the full CCV phase. | Confirmed — May 2026                         |
| BR-14   | All incentive rates are configurable via master settings table. No hardcoding. [SR-INCENTIVE-01]                                                                                                                                 | Confirmed — SRS v2.0 design decision         |
| BR-15   | Re-enrolment after PP5: new Beneficiary ID and new registration. Duplicate detection alert handled gracefully.                                                                                                                   | Confirmed — ARMMAN answers file, 23 Apr 2026 |

---

## 3B. Supervisor Mobile Application

### 3B.1 Feature Inventory

| Feature                    | Description                                                           | Status    |
| -------------------------- | --------------------------------------------------------------------- | --------- |
| Menu                       | Menu Bar                                                              | Confirmed |
| Inventory Management       | Track consumables and instruments assigned to Sakhis                  | Confirmed |
| Meeting and Training       | Schedule meetings/training. Mark attendance. Capture photos.          | Confirmed |
| Call Sheet                 | Log calls with Sakhis. Call duration.                                 | Confirmed |
| Quick Response / Approvals | Act on escalation cards and approval requests from Sakhis             | Confirmed |
| Supervisor Dashboard       | Visit summary, registration summary, risk summary, monitoring summary | Confirmed |
| Pending Approvals View     | View all pending accompanied referral approval requests               | Confirmed |

### 3B.2 Detailed Functional Requirements

#### FR-SV-1: Inventory Management

**FR-SV-1.1:** Supervisor must be able to record an inventory transaction by selecting a Program, then a Sakhi, then one or more items, then a transaction type, then adding a date and optional remarks before submitting.

**FR-SV-1.2:** Items are categorised into two types — Consumables (Pencil, Cells, Sugar Strips, HB Strips) and Instruments (Doppler Test Kit, BP Monitor, Weighing Scale). Both categories must be selectable in a single transaction. (The complete list of consumables and instruments in the current system will be shared with Navadhiti.)

**FR-SV-1.3:** Five transaction types must be supported: Handover (distributing items to Sakhi), Returned (Sakhi returning unused items), Permanent Damaged (item cannot be repaired), Misplaced (item lost by Sakhi), Consumed (regular usage tracking).

**FR-SV-1.4:** Transaction date is mandatory. Remarks are optional. The following must be captured and stored per transaction: Sakhi name, item details, transaction type, transaction date, remarks.

**FR-SV-1.5:** Supervisor must be able to view the transaction history per Sakhi showing all past inventory movements.

#### FR-SV-2: Meeting and Training Management

**FR-SV-2.1:** Supervisor must be able to view all upcoming and completed meetings and training events, with event details and attendance visible for each.

**FR-SV-2.2:** Supervisor must be able to create a new event by selecting a Project, setting a date, adding remarks, and scheduling the event. Training events additionally require a topic list, and pre and post training marks.

**FR-SV-2.3:** To mark an event as complete, Supervisor must: mark attendance for each Sakhi individually, upload at least one event photo (mandatory), and submit. An event cannot be marked complete without a photo. Supervisor can view event photos directly in the Supervisor app. Photos are accessible and downloadable by the Program team/Manager directly from the linelist row in the Manager web portal — via an inline preview option within the relevant report.

**FR-SV-2.4:** Data captured per event: Project/Program, Event date, Participant list, Attendance status per participant, Event photos, Remarks. For training events additionally: Topic list, Pre-training marks, Post-training marks.

**FR-SV-2.5:** Two event types exist — Meeting and Training. Meetings are scheduled by Supervisor as needed and may occur at any frequency. Trainings are mandatory quarterly events — the schedule is set by the program team, not the Supervisor. Training has additional fields not shown for Meeting: topic list (selected from pre-configured master list), pre-training marks, post-training marks.

#### FR-SV-3: Call Sheet

**FR-SV-3.1:** Supervisor must be able to select a Project, view the Sakhi list under that project, and initiate a call log for a selected Sakhi.

**FR-SV-3.2:** For each call, Supervisor must be able to record: Sakhi name, call date and time, discussion notes, follow-up actions, call status and call duration.

**FR-SV-3.3:** Supervisor must be able to view the full call history for each Sakhi — all previous calls, notes, and follow-up actions logged against that Sakhi.

**FR-SV-3.4:** A Sakhi card must be visually highlighted in orange if a call has been made to that Sakhi recently, allowing the Supervisor to quickly identify recently contacted Sakhis at a glance.

#### 3B.2.4 Quick Response (Approvals and Escalations) (NEW)

**FR-SV-4.1:** The Supervisor app provides a Quick Response section where Supervisor receives and acts on cards for 8 event types: LMP change request, Missed visit escalation, Pending closure review, Referral incomplete escalation, Data restore request, Beneficiary reopen request, EDD nearing request, and Accompanied referral approval. Each card type has defined fields, CTAs, and outcome behaviour documented in FR-SV-4.2 through FR-SV-4.9. All Supervisor actions trigger an in-app notification to the Sakhi unless stated otherwise.

**FR-SV-4.2: LMP Change Request**

Card fields: Date request was raised, Pada name, Sakhi name, Beneficiary name, Old LMP, New LMP, Image of sonography report.

CTAs and outcomes:

- Approve — LMP change is reflected system-wide. Beneficiary home visit schedule (ANC) is regenerated from new LMP. Sakhi receives an in-app notification.
- Reject — No change to LMP or home visit schedule. Sakhi receives an in-app notification.

**FR-SV-4.3: Missed Visit Escalation**

Escalation triggers: ANC — 2 consecutive visits missed. PP, NN, INC, INC-HR, CCV, CCV-HR — 1 visit missed.

Three scenarios apply based on beneficiary location:

- Scenario A — Location known and serviceable: Supervisor initiates Transfer. Email sent to Manager with Sakhi and beneficiary details. Manager transfers beneficiary to another Sakhi.
- Scenario B — Location known but not serviceable: Supervisor triggers Close. Sakhi notified to fill closure form.
- Scenario C — Location unknown: Supervisor triggers Close. Sakhi notified to fill closure form.

Card fields: Sakhi name, Beneficiary name, Number of visits missed, Beneficiary risk details, Sakhi contact option, Type of Visit missed, Date request was raised.

CTAs and outcomes:

- Transfer — Email sent to designated Manager with Sakhi and beneficiary details. Beneficiary removed from current Sakhi's list. Schedule continues running independently during Manager review period (up to 15 days). Visits may be missed during this period. Supervisor must provide reasons for each missed visit. Sakhi receives an in-app notification.
- Close beneficiary — Sakhi receives an in-app notification to fill the closure form.

**FR-SV-4.4: Pending Closure Review**

Card fields: Individual beneficiary closure form, Closure reason, Supervisor notes field (editable), Closure completion tracker, Date request was raised.

CTAs and outcomes:

- Approve — Beneficiary moves to the Closed list. Sakhi receives an in-app notification.
- Reject — Beneficiary returns to the Open list. Sakhi receives an in-app notification

**FR-SV-4.5: Referral Follow Up Incomplete Escalation**

Card fields: Pada name, Sakhi name, Beneficiary name, Visit reference (ANC/PNC visit number), Number of referrals missed, Reason, Beneficiary risk details, Sakhi contact option, Date request was raised.

CTAs and outcomes:

- Approve — DB marks Lapsed. Sakhi UI stays "Pending Referral Follow-up." No incentive. Sakhi notified.
- Reject — Sakhi must fill follow-up form again. Sakhi notified. No timeline for Supervisor to act.

**FR-SV-4.6: Data Restore Request**

Card fields: Sakhi name, Sakhi ID, Date request was raised.

CTAs and outcomes:

- Approve — Data restore is initiated for that Sakhi's device. Sakhi receives an in-app notification.
- Reject — No restore action taken. Sakhi receives an in-app notification.

Note: Full data restore flow and backend behaviour to be confirmed with ARMMAN before this module is built. This card type is documented here based on PRD reference — implementation details pending.

**FR-SV-4.7: Beneficiary Reopen Request**

Card fields: Pada name, Sakhi name, Beneficiary name, Reason for reopen, Beneficiary risk details, Sakhi contact option, Date request was raised.

CTAs and outcomes:

- Approve — Beneficiary is added to Sakhi's Open beneficiary list. Sakhi receives an in-app notification.
- Reject — Beneficiary remains in the Closed list. The status on the beneficiary card under the Closed list changes to "Cannot re-open". This status is maintained in the DB. Sakhi receives an in-app notification.

**FR-SV-4.8: EDD Nearing Request**

Card fields: Pada name, Sakhi name, Beneficiary name, EDD date, Reason, Beneficiary risk details, Sakhi contact option, Date request was raised.

CTA and outcome:

- Okay — Card resolves immediately. No further action required. This is an informational card only — no notification is sent to the Sakhi.

**FR-SV-4.9: Accompanied Referral Approval**

Card fields: Pada name, Sakhi name, Beneficiary name, Referral details, Photo evidence uploaded by Sakhi, Date request was raised.

Referral evidence photos uploaded by Sakhi are viewable by Supervisor in the app. Manager can view and download photos via the inline preview option in the referral linelist in the web portal.

CTAs and outcomes:

- Approve — Referral marked as Completed. Incentive is triggered. Sakhi receives an in-app notification.
- Reject — Referral remains Pending. Sakhi receives an in-app notification. No incentive is given in this case. Might be important to mention here

Note: Accompanied referral approval has no timeout. The card stays pending indefinitely until Supervisor acts. All accompanied referral approval requests are displayed in the Pending Approvals view in reverse chronological order — latest request at the top.

#### 3B.2.5 Supervisor Dashboard

**FR-SV-5.1:** Dashboard summary tables:

1. Visit Summary — visits by type completed this week/month, completion rate
2. Registration Summary — new enrolments, active beneficiaries
3. Risk Summary — HR beneficiary counts, pending HR follow-ups
4. Monitoring Summary — Sakhis who have not synced data in last 3 days, overdue visits. Also have a data summary od Sakhis who have not uploaded the data in last 3 days.
5. Pending closures — list of beneficiaries with pending closure forms

**R-SV-5.2:** Supervisor Dashboard Header — The dashboard header must display the Supervisor's Name, Designation, and current date at all times.

**FR-SV-5.3:** Project Selector — The Supervisor dashboard must include a project selector that allows the Supervisor to switch between projects she is assigned to. All dashboard data — Visit Summary, Registration Summary, Risk Summary, Monitoring Summary — must filter to the selected project.

**FR-SV-5.4:** Visit Data Tabs — The dashboard must include four tabs for visit data: Open, Mother, Child, Monitor. Each tab filters the relevant visit list accordingly.

**FR-SV-5.5:** Beneficiary Data Download — Supervisor must be able to download beneficiary data from the dashboard. Download includes all beneficiary records for the selected project.

**FR-SV-5.6:** Data Upload Button — Supervisor app must have a Data Upload button on the dashboard, consistent with the Sakhi app sync behaviour.

**FR-SV-5.7:** Menu/Settings — Supervisor app must have a Menu/Settings option accessible from the dashboard. Menu includes at minimum: Language toggle (English/Marathi), Logout, App version

### 3B.3 Pending Items — Supervisor App

> ⚠️ **PENDING** — Transfer hold state — full Supervisor UI behaviour during Manager review period. [Open item 3]

> ⚠️ **CONFIRMED** — No timeout on accompanied referral approval. Pending Approvals view confirmed — requests displayed in reverse chronological order (latest first)

---

## 3C. Manager Web Dashboard

The Manager Dashboard is a web-based (browser) application for Program Managers. It provides program-level analytics, reporting, and monitoring. The dashboard is online-only. Data flows from PostgreSQL (OLTP) through Apache Airflow (ETL) into ClickHouse (OLAP) and is presented through Metabase. All SQL queries must be shared with ARMMAN.

### 3C.1 Dashboard Filters

All filters support multi-select. The following filters are available across all reports:

| Filter            | Options                                                                                                                                                            | Notes                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Funder            | All / Individual donor                                                                                                                                             |                                                                                        |
| Project           | FY-based per donor                                                                                                                                                 | Every year stored as FY data                                                           |
| State             | Maharashtra (only)                                                                                                                                                 | currently noted as "Not used for now since all in Maharashtra" but must be provisioned |
| District          | Palghar, Nandurbar                                                                                                                                                 |                                                                                        |
| Block             | All, Dhadgaon, Jawhar, Vikramgad, Mokhada, Akkalkuwa                                                                                                               |                                                                                        |
| Date Range        | Today, Yesterday, Last Week, This Week, Last 30 Days, This Month, Last Month, Current Quarter, Last Quarter, Custom, Project to Date, Financial Year, Year to Date |                                                                                        |
| Registration Type | Pregnancy (ANC/PP), Child (Neonate/Infant/Child 13–24)                                                                                                             |                                                                                        |
| Status            | Active, Closed, All                                                                                                                                                |                                                                                        |

_All total numbers in the dashboard must have linelists with common data points: Beneficiary ID, Mother ID (for children), Project Name, District, Block, Village, Pada, Sub-centre, PHC, Supervisor Name, AS Name, Registration Date, Beneficiary Name._

**Every downloaded report and linelist must include a download timestamp.**

### 3C.2 Dashboard Reports (PRD)

Status indicates whether report exists in current legacy system.

| #   | Category              | Report Name                                  | Description                                                                                                                                                                           | Visual            | Existing? |
| --- | --------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------- |
| 1   | Registrations         | Target vs Achieved                           | Donor/block-wise registrations against annual targets                                                                                                                                 | Bar chart         | Yes       |
| 2   | Registrations         | Early registration trend                     | ANC: 4–16 weeks vs >16 weeks. Infant: age group bands. Distinguish direct vs from mother.                                                                                             | Bar chart         | Modify    |
| 3   | Registrations         | Month-wise registration trend                | New registrations per month                                                                                                                                                           | Line graph        | Yes       |
| 5   | Active / Closed Cases | Month-wise active and closed trend           | Count of active and closed beneficiaries over time                                                                                                                                    | Line graph        | Yes       |
| 8   | Closed Cases          | Reasons for closure                          | Medical and non-medical closure reason categories                                                                                                                                     | Bar graph         | Yes       |
| 9   | HR Case Management    | HR at first visit (baseline)                 | Risk category at Registration + first visit                                                                                                                                           | Pie chart / table | Modify    |
| 10  | HR Case Management    | Risk category shift — latest vs baseline     | Improvement / No Change / Deteriorated per condition                                                                                                                                  | Table             | Modify    |
| 11  | HR Case Management    | Risk category shift — latest vs ever at risk | Comparison against highest ever risk grade                                                                                                                                            | Table             | New       |
| 12  | HR Case Management    | Infant shift in MAM/SAM/MUW/SUW              | Undernutrition category shift over time : First Time When Beneficiary enters in SAM/MAM/SUW/MUW vs latest                                                                             | Table             | Yes       |
| 13  | HR Case Management    | Danger signs and symptoms                    | Count of positive instances and resolutions                                                                                                                                           | Table             | New       |
| 14  | HR Case Management    | Total tests performed                        | Hb, urine, blood sugar test counts. Regular + HR visits.                                                                                                                              | Table             | New       |
| 15  | Visit Completion      | Stage-wise visits completed                  | ANC by trimester, PP by days, Child by age band incl. 13–24m                                                                                                                          | Bar graph         | Modify    |
| 16  | Visit Completion      | Visit completion rate                        | % completed vs planned for regular and HR visits (Lapsed visits excluded from both numerator and denominator)                                                                         | Bar graph         | Yes       |
| 17  | HR Referral           | HR referral completion                       | Condition-wise: flagged vs referred vs follow-up vs visited. Days between referred and follow-up.                                                                                     | Table             | New       |
| 18  | HR Referral           | Reasons for non-referral                     | Reason-wise count of non-referrals                                                                                                                                                    | Table             | New       |
| 19  | HR Referral           | Barriers to facility visits                  | Reasons for missed referrals (beneficiary did not visit facility)                                                                                                                     | Table             | New       |
| 20  | Outcomes              | Pregnancy outcome                            | Delivery, abortion, miscarriage, death by HR categorisation                                                                                                                           | Table             | Yes       |
| 21  | Outcomes              | Delivery outcome                             | Live birth, still birth, neonatal death breakdown                                                                                                                                     | Table             | New       |
| 22  | Outcomes              | Postpartum outcome                           | HR resolution, complications, deaths                                                                                                                                                  | Table             | New       |
| 23  | Outcomes              | 1-year outcome                               | Immunisation, undernutrition, childhood diseases at 12m                                                                                                                               | Table             | New       |
| 26  | Outcomes              | 2-year outcome (1000 Days)                   | Same indicators at 24m for CCV beneficiaries                                                                                                                                          | Table             | New       |
| 27  | Outcomes              | Immunisation completion                      | Vaccine-wise split for ANC/INC/CCV                                                                                                                                                    | Table             | New       |
| 28  | Adverse Outcomes      | Adverse outcome correlation                  | 9 form sources. Separate table per adverse condition type (abortion, miscarriage, still birth, child death, maternal death, infant death, severe illness). Highest complexity report. | Table             | New       |

### 3C.3 KPI Report

The KPI Report is the stakeholder-facing report for internal teams, government officials, and donors. Filters: District, Block, Project, Year. Display: quarterly and monthly breakdown.

**Pregnant Women / Postpartum KPIs (23 indicators):**

1. Number of pregnant women registered (vs target)
2. Early registrations — by 4th month (16 weeks) — target 80%
3. Count at risk at baseline
4. Active pregnant beneficiaries
5. Active postpartum beneficiaries
6. Pregnant women completing ≥4 ANC visits at health facilities — target 90%
7. Pregnant women completing ≥4 ANC visits by Arogya Sakhis — target 95%
8. Total active ANC beneficiaries ever at risk
9. Total active PP beneficiaries ever at risk
10. Planned ANC/PP visits completed — target 85% (Lapsed visits excluded)
11. Referral completion for pregnant women — target 90%
12. Loss of pregnancy (miscarriage/abortion) — target <15%
13. Migration rate — target <15%
14. Count of delivered women
15. Pregnant women with complete birth preparedness plan by 7th month — target 90%
16. Institutional deliveries — target 99%
17. Live births — target 99%
18. Still births — target <2%
19. Live births with low birth weight (<2.5 kg) — target <40%
20. Maternal mortality
21. Neonatal/infant mortality — target <1%
22. Women completing full program cycle — target 70%
23. Women completing program cycle without any risk — target 70%

**Children 0–24 months KPIs:**

24. Number of children 0–18 months registered (vs target)
25. Early registrations — 0–28 days — target 80%
26. Count at risk at baseline
27. Active children by phase (0–12m and 13–24m)
    - Active neonates 0–28 days
    - Active infants 0–12 months
    - Active children 13–24 months
    - Total active neonates (0–28 days) ever at risk
    - Total active infants 0–12 months ever at risk
    - Total active children 13–24 months ever at risk
28. INC visit completion rate (Lapsed visits excluded)
29. CCV visit completion rate (13–24m) (Lapsed visits excluded)
30. Referral completion for children
31. Children completing 1-year program cycle
32. Children completing 2-year program cycle (1000 Days)
33. Completed 2 year program cycle fully immunised — target 95%
34. Completed 2 year program cycle in normal category — target 80%
35. Migration rate for children — target <15%
36. Infant mortality 0–12m — target <1%
37. 13–24m mortality — target <1%

### 3C.4 MIS Reports

#### 3C.4.1 All Form Linelists

All form linelists must be complete field-by-field exports of every submitted form. Each linelist must contain three mandatory layers of data: (a) Header variables — Beneficiary ID, Mother ID (for child records), Project Name, Funder Name, District, Block, PHC, Subcenter, Village, Pada, Arogya Sakhi Name, Supervisor Name, Data Upload Date; (b) All form-specific question fields — every data point collected in that form without exception; (c) Risk, grade, and flag variables wherever applicable — HR flag, risk category at time of visit, referral trigger flag, all condition-specific grade fields (e.g. Hb grade, BP grade, nutrition status grade), danger signs flags. The 'Key Form-Specific Fields' column below shows the most critical fields per form — it is not exhaustive. Developers must implement all fields from the Revised App Form Final (20 March 2026) for each respective form. 12 form linelists required.

| #   | Linelist                           | Key Form-Specific Fields (Critical Fields, Non-Exhaustive — All Form Fields Required. See Revised App Form Final 20 Mar 2026)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Registration Form — Pregnant Woman | beneficiary_id, registration_date, reg_fy, lmp_date, edd_date, gestational_age_at_reg, high_risk_at_reg, permanent_conditions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2   | Registration Form — Child          | beneficiary_id, mother_id, linked_anc_case, date_of_birth, age_in_months, sex, birth_weight, premature_status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 3   | ANC Visit                          | anc_visit_id, visit_date, visit_type, gestational_age_weeks, trimester, weight, hb, bp_systolic, bp_diastolic, blood_sugar, urine_protein, high_risk_identified                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 4   | PP Visit                           | visit_date, visit_number, days_post_delivery, visit_type, mother_alive, maternal_death_date, danger_signs_present, bleeding_flag, fever_flag, foul_discharge_flag, severe_pain_flag, wound_infection_flag, pallor_flag, dehydration_flag, breastfeeding_status, breastfeeding_difficulty, meals_per_day, diet_diversity_score, ifa_taken, ifa_tablets_consumed, calcium_taken, family_planning_method, fp_side_effects, mental_health_status, family_support, migration_status, current_weight, bmi, muac_cm, bp_systolic, bp_diastolic, hb_g_dl, blood_glucose, referral_id, referral_level, referral_reason, referral_completed_flag, referral_trigger_flag, maternal_risk_flag_current, risk_category_current, risk_factors_current, next_visit_due_date, pnc_status |
| 5   | Delivery Form                      | delivery_date, delivery_outcome, delivery_location, birth_weight, birth_length, total_anc_visits, completed_4plus_anc, high_risk_in_anc                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 6   | Neonatal Visit                     | nn_visit_type, visit_date, age_in_days, weight, temperature, danger_signs, feeding_status, jaundice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 7   | Infant Visit (INC)                 | inc_visit_type, visit_date, age_in_months, weight, length, muac, z_score_waz, z_score_haz, z_score_whz, immunisation_status, feeding_status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 8   | Mother Closure                     | closure_date, closure_type, closure_reason, event_date                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 9   | Infant / Child Closure             | closure_date, closure_type, closure_reason, event_date, age_at_closure                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 10  | Referral Linelist                  | referral_id, referral_type, referral_date, referred_condition, facility_visited, follow_up_date, days_between_referral_and_followup                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 11  | Referral Follow-up Linelist        | followup_id, referral_id, entity_type, beneficiary_id, child_id, followup_date, followup_attempt_number, information_source, visited_facility_flag, not_visited_reason, asha_accompaniment_offered, first_facility_type, first_facility_name, first_visit_date, multiple_facilities_flag, number_of_facilities, last_facility_type, last_facility_name, last_visit_date, diagnosis_confirmed, treatment_given, treatment_type, referral_outcome, clinical_status, further_referral_flag, next_visit_date, next_facility_type, next_facility_name, case_paper_uploaded, investigation_uploaded, followup_status                                                                                                                                                          |
| 12  | Beneficiary Reopen Linelist        | date_of_request, approved_by_supervisor, reason_for_reopening, lbw_flag, notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

> **Note:** Field names above are the canonical column names for the ClickHouse schema. These exact names must be used — ARMMAN analysts will write SQL queries directly against these names in Metabase.

#### 3C.4.2 Arogya Sakhi-Wise Report

Performance report per Sakhi. Columns: Project Name, AS Name, District, Block, PHC, Village, Phone, Supervisor Name, Total Beneficiaries Registered, Total PW Registered, ANC Active, ANC/PP Closed Cases, ANC/PP at Risk, Visit Completion Rate (count and %, Lapsed excluded), Visits Missed Count, Referral Completion (count and %), Accompanied Referrals Completed (count and %), Delivery Forms Pending, Closure Forms Pending, Total Child Registered, Child Active, Child Closed Cases, Child at Risk, Child Visit Completion Rate (count and %, Lapsed excluded), Child Visits Missed Count, Child Referral Completion (count and %), Child Accompanied Referrals Completed (count and %), Child Closure Forms Pending, App Last Updated, Last Data Sync Date.

#### 3C.4.3 Wages Report

Monthly wage calculation per Arogya Sakhi. Formula confirmed from ARMMAN Wages Report sheet:

**Total Payout = (ANC/PP visits + Child visits) × Rs 65 + (Regular referrals × Rs 50) + (Accompanied referrals × Rs 160 or Rs 300 by geography) + Monthly retainer (Nandurbar: Rs 500) + (Monthly meeting honorarium/per visit (Rs 200/visit)) + Quarterly training honorarium (Rs 200)**

Report columns: Project Name, Voucher Month, AS Name, Completed ANC/PP Visits Count, Completed Child Visits Count, Completed Visits Amount, Regular Referrals Made, Accompanied Referrals Made, Total Referral Amount, Monthly Visit Charges, Monthly Meeting Honorarium, Quarterly Training Honorarium, Total Payout, Bank Name, Account Number, IFSC Code, Branch, Aadhar Number, Pancard, Pan Card Linked with Aadhar (Yes/No).

#### 3C.4.4 M&E Linelist

Currently named 'M&E MIS Report' in the legacy system. Must contain all data points from all 10 form linelists with geography and program metadata. Used by ARMMAN data team for monitoring and evaluation analysis.

#### 3C.4.5 Case Paper

Same as current legacy system. Per-beneficiary complete care record printout.

### 3C.5 Role-Based Access

The Manager Dashboard has role-based access control. Different managers see different reports based on their role.

> ⚠️ **PENDING** — ARMMAN to share role-based access document (Sushil committed on 31 March call). Required before Manager Dashboard access control can be designed.

---

## 4. External Interface Requirements

### 4.1 User Interface Requirements

**4A. Sakhi App UI Requirements**

38. Primary language: English. Secondary language: Marathi. Toggle in Menu → Language.
39. Designed for low-literacy users. Icons with text labels throughout.
40. All HR conditions displayed in red. Orange used for visit expiry state.
41. Minimum touch target size: 44×44 dp per Android guidelines.
42. App must function on devices with minimum 2GB RAM and Android 10+.

**4B. Supervisor App UI Requirements**

43. Android mobile and tablet. English and Marathi only (Armman will provide us with the Marathi text)
44. Escalation cards must clearly distinguish visit type and action options available.

**4C. Manager Dashboard UI Requirements**

45. Web browser. English only.
46. All filters must support multi-select. Filters are cascading and dependent — selecting a State narrows the District options, selecting a District narrows the Block options, and so on down the geography hierarchy.
47. All reports and linelists must be exportable. Every download must include timestamp. Linelist rows that contain photo evidence (accompanied referral follow-up, meeting/training events, consent forms) must include an inline view/preview option. Manager can view the photo directly within the linelist and download it. No separate photo gallery section is required.
48. Charts: Bar charts, Line graphs, Pie charts, Tables as specified per report.

### 4.2 Integration Requirements

| System     | Purpose                                       | Integration Method                                                                                                                |
| ---------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| ArtPark    | LLM inference                                 | Single wrapper API (Planned integration — no current functional requirements dependent on this. To be scoped in a future release) |
| Strapi     | Health education content and media management | Internal — same infrastructure                                                                                                    |
| ClickHouse | OLAP analytics data warehouse                 | Apache Airflow ETL from PostgreSQL                                                                                                |
| Metabase   | Report presentation                           | Direct connection to ClickHouse                                                                                                   |

---

## 5. Non-Functional Requirements

### 5.1 Performance Requirements

| Requirement                                              | Target                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| Form load time (offline)                                 | < 3 seconds (with fallback mechanism integrated)              |
| API response time (online sync)                          | < 10 seconds (with fallback mechanism integrated)             |
| Sync success rate                                        | ≥ 99% (with fallback mechanism integrated)                    |
| App crash rate                                           | < 0.5% of sessions (with fallback mechanism integrated)       |
| Dashboard page load time                                 | < 5 seconds on broadband (with fallback mechanism integrated) |
| Rule engine evaluation time (gorules, offline on device) | Target: under 2 seconds per form submission                   | gorules evaluation time monitored via Grafana. Alert threshold: >2 seconds average over 5-minute window. (with fallback mechanism integrated): The latency of the sync is dependent on the network of the user. |

### 5.2 Availability and Reliability

49. Backend API availability: ≥ 99.5% uptime.
50. Sakhi app must be fully functional with zero network connectivity.
51. Data loss on sync interruption must be prevented through partial sync handling and retry mechanism.

### 5.3 Security Requirements

52. All data at rest and in transit must be encrypted.
53. Role-based access — each user role has a separate application. No cross-role access.
54. Secure authentication via username and password.
55. Comprehensive audit logs and change history maintained. Form version change log required.
56. Compliance with DPDPA (Digital Personal Data Protection Act 2023) and GDPR principles.
57. CERT-approved third-party security audit (VAPT) required before go-live.
58. No client-side credential storage in plaintext.

### 5.4 Scalability and Capacity

59. System must support 500+ Arogya Sakhis at launch with capacity to scale to 2,000+.
60. ClickHouse schema must support ad-hoc queries and precomputed aggregations for analyst self-service.

### 5.5 Maintainability and Observability

61. Grafana for monitoring — reuse existing ARMMAN expertise.
62. GitHub Actions for CI/CD with YAML-defined workflows.
63. All Metabase SQL queries to be shared with ARMMAN data team.
64. All incentive rates configurable via master settings — no redeployment required for rate changes.
65. gorules config changes deployable without code redeployment.
66. Airflow DAG frequency for ETL pipeline: Daily batch processing will be used for standard reporting datasets. Near-real-time or short-interval refresh will be used for Supervisor monitoring, sync anomaly monitoring, and rule engine failure monitoring and operational alerting datasets where timely action is required.
    - NFR-MAINT-2: Operational Monitoring and Alerting — The following must be monitored with automated alerts: Rule engine health — gorules evaluation failures or timeouts must trigger an alert to the development team within 5 minutes of detection. Data sync anomalies — incomplete uploads, duplicate record submissions, and data loss events must be detected at the server level on sync receipt, logged with full audit trail, and trigger an alert to the system administrator. System health — API uptime, database connection failures, and ETL pipeline failures (PostgreSQL → ClickHouse via Airflow) must be monitored via Grafana dashboards with email alerts to the development team. Rule engine performance — gorules evaluation time per form submission must be monitored with alert threshold of more than 2 seconds average over a 5-minute window.

### 5.6 Compliance Requirements

67. All data hosted within India.
68. DPDPA 2023 compliance for personal health data.
69. WCAG 2.1 Level AA accessibility for Manager Dashboard.

---

## 6. Data Requirements

### 6.1 Key Data Entities

| Entity                | Key Attributes                                                                                                                                                                                            | Notes                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Mother Beneficiary    | beneficiary_id, registration_date, lmp, edd, demographics, pii_data, program_state, current_risk_state                                                                                                    | Shared PII table + AS-specific extension table                                       |
| Child Beneficiary     | beneficiary_id, mother_id, dob, sex, birth_weight, registration_date, program_state, current_risk_state                                                                                                   | current_risk_state: NEVER_HR, CURRENT_HR, RECENTLY_RECOVERED, STABLE_LOW_RISK        |
| Visit                 | visit_id, beneficiary_id, visit_type, scheduled_date, actual_date, status, form_data, hr_detected, risk_state_at_visit, gestational_age_at_visit (ANC/PP visits), age_at_visit_months (INC/CCV/NN visits) | risk_state_at_visit required for CCV phase state evaluation                          |
| Schedule              | schedule_id, beneficiary_id, visit_type, scheduled_date, anchor_type                                                                                                                                      | anchor_type distinguishes static (ANC/PP/NN/INC) from dynamic (CCV) schedule entries |
| Escalation            | escalation_id, beneficiary_id, visit_id, escalation_type, status, supervisor_id, action_taken, reason                                                                                                     |                                                                                      |
| Referral              | referral_id, visit_id, beneficiary_id, referral_type, referral_date, follow_up_date, status, facility_visited                                                                                             |                                                                                      |
| Incentive Payout      | payout_id, sakhi_id, month, visit_count_anc_pp, visit_count_child, referral_std, referral_acc, meeting_honorarium, training_honorarium, retainer, total                                                   | Geography-aware for accompanied referral and retainer rates                          |
| Incentive Rate Master | rate_id, rate_type, amount, geography, effective_from, effective_to, changed_by, changed_at                                                                                                               | Audit log of all rate changes per SR-INCENTIVE-01                                    |
| Arogya Sakhi          | sakhi_id, name, username, mobile, geography, supervisor_id, program, sim_number                                                                                                                           | Primary contact number is program-provided SIM                                       |
| Supervisor            | supervisor_id, name, mobile, geography, manager_id                                                                                                                                                        |                                                                                      |

> **Note:** SQLite on device must store ALL INC visit outcomes per child (0–12m) to support the Never at HR full-period scan, plus the last 3 INC visit outcomes in detail for current risk state severity assessment.

### 6.2 Data Migration

Legacy data migration scope and approach to be defined in the companion ADD. At minimum, active beneficiary records from the legacy system must be migrated to ensure continuity of care for currently enrolled beneficiaries.

### 6.3 Data Retention and Compliance

70. Beneficiary health data retained for minimum 7 years post program completion.
71. Audit logs retained indefinitely.
72. DPDPA compliance — right to erasure to be handled per legal guidance.

### 6.4 Backup and Recovery

73. Daily automated backups of PostgreSQL OLTP database.
74. Point-in-time recovery capability.
75. RTO (Recovery Time Objective) and RPO (Recovery Point Objective) to be defined in ADD.

---

## 7. Architecture and Technology Constraints

### 7.1 Mandatory Technology Constraints

See Section 2.1 for the full mandated technology stack. The following are the most significant architectural constraints for the development team:

76. gorules is mandatory for ALL workflow rules. No business logic may be hardcoded. This applies to: ANC/PP/NN/INC/CCV scheduling formulas, HR detection thresholds, escalation trigger logic, incentive calculation logic.
77. Enrollment module must be built as a reusable component with shared PII table (common fields) and program-extension table (AS-specific fields). Must be extensible to support future ARMMAN programs.
78. Dynamic scheduling for CCV (13–24m): unlike static schedule generation for ANC/PP/NN/INC, the CCV schedule must be generated after evaluating the risk state of the last 3 INC visits. Must work offline.
79. ClickHouse schema field names must exactly match the canonical names in the M&E Linelist (Section 3C.4.1). ARMMAN analysts will write SQL directly against these names.
80. All Metabase SQL queries to be delivered to ARMMAN as a project deliverable.

### 7.2 Technology Prohibitions

81. No proprietary closed-source databases.
82. No client-side credential storage in plaintext.
83. Jenkins CI/CD — explicitly discouraged by ARMMAN. Use GitHub Actions.
84. PHP/Laravel — legacy stack being migrated away from. Must not be used for new development.

---

## 8. Testability and QA Readiness

### 8.1 Test Strategy Overview

| Test Type                     | Scope                                                                                                                 | Tool / Approach                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Unit testing                  | All gorules configurations, scheduling formulas, incentive calculations                                               | Jest / Node.js test framework   |
| Integration testing           | API endpoints, offline sync, form submission to HR detection pipeline                                                 | Postman, automated test suite   |
| Offline testing               | Full form workflow, schedule generation, HR detection with zero connectivity                                          | Device testing in airplane mode |
| Schedule scenario testing     | All INC formula edge cases: Day 0, Day 58, Day 59, Day 90, Day 300, Day 330, Day 365. PP and CCV schedule validation. | Automated scenario runner       |
| INC formula boundary testing  | Verify DOB+370 cutoff: visits beyond cutoff dropped, not missed. CCV phase starts correctly.                          | Automated                       |
| Incentive calculation testing | All rate types, geography variants, monthly payout totals                                                             | Automated                       |
| UAT                           | Field worker scenarios with actual Sakhis in pilot geography                                                          | Manual with test devices        |
| VAPT                          | Security audit before go-live                                                                                         | CERT-approved third party       |

### 8.2 Definition of Done

85. Feature is code complete and peer reviewed.
86. Unit tests written and passing.
87. Works offline — full workflow completable with zero connectivity.
88. All scheduling scenarios tested and validated against confirmed formula rules.
89. Marathi language tested (when content received).
90. Performance targets met — form load < 3 seconds offline.

### 8.3 Defect Classification

| Severity | Definition                                                                                    | Resolution SLA         |
| -------- | --------------------------------------------------------------------------------------------- | ---------------------- |
| Critical | Data loss, incorrect schedule generation, wrong HR detection, incorrect incentive calculation | Same day               |
| High     | Feature not working as specified, incorrect visit state, escalation not firing                | Within 2 business days |
| Medium   | UI inconsistency, minor logic error not affecting data integrity                              | Within 5 business days |
| Low      | Cosmetic, text, translation issue                                                             | Next release cycle     |

### 8.4 System Monitoring, Data Sync, and Rule Engine Failure Detection

The platform shall include operational monitoring and alerting for rule engine failures, sync failures, duplicate data ingestion, incomplete records, and potential data loss.

**Rule Engine Monitoring**

- Every rule execution shall be logged with rule_version_id, request payload reference, response status, execution timestamp, and error details if failed.
- Rule engine failures shall generate application errors and operational alerts.
- Failed rule evaluations shall be retried where safe, and unresolved failures shall be visible in an admin/support dashboard.
- Rule version publishing shall include validation/test cases before activation.

**Data Sync Monitoring**

- Every mobile upload/download shall create a sync_batches record.
- Every synced entity/form/media item shall create a sync_items record with status such as SUCCESS, FAILED, DUPLICATE, SKIPPED, or PARTIAL.
- The system shall track incomplete sync batches, failed sync items, retry count, duplicate local UUIDs, and stale devices that have not synced within the configured threshold.
- Sync failures shall be shown to the Sakhi/Supervisor app and escalated to supervisors/admins where thresholds are breached.

**Duplicate / Incomplete / Data Loss Detection**

- Idempotency keys and local_submission_uuid shall prevent duplicate form submissions during retry.
- Required-field validation shall run both on device and server.
- Server-side reconciliation jobs shall compare expected visit/form/referral counts against accepted sync records.
- Any mismatch, missing mandatory record, or orphaned media reference shall be reported in a data quality dashboard.

**Alerts and Notifications**

- Critical failures such as rule engine unavailable, repeated sync failure, high duplicate rate, failed ETL, or missing data batches shall trigger alerts to the technical support/admin team.
- Business-facing notifications may be generated for Supervisors when field users have not synced for a configured number of days.

**Audit and Traceability**

- All accepted business changes shall be recorded in audit_log.
- Sync lifecycle shall be traceable through sync_batches and sync_items.
- Rule-driven decisions shall retain the rule version used for evaluation.

---

## 9 — App Analytics and Product Metrics

This section defines the analytics and product metrics to be tracked across all features of the Arogya Sakhi platform. These metrics enable ARMMAN to monitor app performance, Sakhi behaviour, data quality, and technical health. All metrics must be captured and made available through the Grafana monitoring stack and Metabase dashboards. Metrics are grouped by feature area and metric category.

| Source         | PRD v2.0 — Metrics to Track sections across all feature areas                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Applies to     | Sakhi Mobile App. Supervisor app metrics not defined in PRD                                                                                              |
| Implementation | All metrics must be instrumented at the app level (client-side events) and server level (API/DB). Available via Grafana dashboards and Metabase reports. |

| Category            | Definition                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Performance metric  | Measures how well a feature achieves its intended clinical or program outcome. Directly tied to Sakhi behaviour and beneficiary care. |
| Data quality metric | Measures the accuracy, completeness, and integrity of data entered by Sakhis. Used for data audits and training interventions.        |
| Usage metric        | Measures how and how often Sakhis use each feature. Used for product decisions and adoption tracking.                                 |
| Technical metric    | Measures app stability, speed, and reliability. Used for engineering monitoring and incident response.                                |
| Quality metric      | Measures the quality of content delivery and clinical process adherence. Used for program quality reviews.                            |
| Reliability metric  | Measures consistency and dependability of system functions over time. Used for SLA monitoring.                                        |

### 9.1 Enrollment

**Performance Metrics**

| Metric                      | Description / Formula                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Form completion time        | Total time from form open to submission. Tracked per form session.                                         |
| Section-wise time           | Time taken to complete each section of the enrollment form.                                                |
| Total form completion time  | Sum of all section times per enrollment.                                                                   |
| Pause/resume count          | Number of times Sakhi left the form mid-way before submitting.                                             |
| Drop-off rate               | % of forms started but not submitted. Formula: (Started − Submitted) / Started.                            |
| Form completeness rate      | % of questions answered out of total questions in the form. Formula: Questions answered / Total questions. |
| Average sync time per Sakhi | Average time between enrollment form submission and successful sync to server.                             |

**Data Quality Metrics**

| Metric                               | Description / Formula                                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Enrollment accuracy per Sakhi        | Track data entry errors per Sakhi for quality monitoring and training.                                     |
| Duplicate enrollment rate            | % of enrollments flagged as potential duplicates. Formula: Duplicate alerts triggered / Total enrollments. |
| Visit records edited post-submission | % of enrollment records corrected after submission. Indicates data entry issues.                           |
| Validation/logical error rate        | % of form submissions that triggered a validation or logical error alert.                                  |

**Usage Metrics**

| Metric                           | Description / Formula                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| Enrollments per Sakhi per day    | Count of enrollment forms submitted per Sakhi per day.                                     |
| Mother vs child enrollment ratio | Ratio of mother enrollments to child enrollments. Tracked by project and block.            |
| Active Sakhis per day/week       | Count of Sakhis who submitted at least 1 enrollment. Indicates adoption.                   |
| Enrollment by geography          | Block-wise enrollment count to identify low-adoption areas.                                |
| Peak enrollment time slots       | Distribution of enrollment submissions by time of week (which day most enrolments happen). |

**Technical Metrics**

| Metric                   | Description / Formula                                                |
| ------------------------ | -------------------------------------------------------------------- |
| Form load time (offline) | Time to load enrollment form from local SQLite. Target: <3 seconds.  |
| Sync success rate        | % of enrollment records successfully synced to server. Target: ≥99%. |
| App crash rate           | % of enrollment sessions ending in a crash. Target: <0.5%.           |
| Submission failure rate  | % of form submissions that failed to save locally.                   |
| Pending record count     | Count of enrollment records queued for sync but not yet uploaded.    |

### 9.2 Home Visit Forms

**Performance Metrics**

| Metric                      | Description / Formula                                                         |
| --------------------------- | ----------------------------------------------------------------------------- |
| Form completion time        | Total time from visit form open to submission. Tracked per visit type.        |
| Section-wise time           | Time taken per section of the visit form.                                     |
| Total form completion time  | Sum of all section times per visit.                                           |
| Pause/resume count          | Number of times Sakhi left the visit form before submitting.                  |
| Drop-off rate               | % of visit forms started but not submitted.                                   |
| Referral completion linkage | % of referrals marked in visit form that have a corresponding follow-up form. |
| Time to referral completion | Days between referral initiation and confirmed facility visit.                |
| Form completeness rate      | % of questions answered / total questions in visit form.                      |

**Data Quality Metrics**

| Metric                               | Description / Formula                                                   |
| ------------------------------------ | ----------------------------------------------------------------------- |
| Visit accuracy per Sakhi             | Track data entry errors per Sakhi for quality monitoring.               |
| Duplicate visit rate                 | % of visits submitted more than once for same beneficiary on same date. |
| Visit records edited post-submission | % of visit records corrected after submission.                          |
| Mandatory field missing rate         | % of mandatory fields left blank in visit forms.                        |
| Validation/logical error rate        | % of visit form submissions triggering a validation or logical error.   |

**Usage Metrics**

| Metric                      | Description / Formula                                         |
| --------------------------- | ------------------------------------------------------------- |
| Visits per Sakhi per day    | Count of visit forms submitted per Sakhi per day.             |
| Mother vs child visit ratio | Ratio of mother visits to child visits per Sakhi.             |
| Active Sakhis per day/week  | Count of Sakhis who completed at least 1 visit.               |
| Coverage rate               | % of eligible mothers/children visited in a given week/month. |
| Home visit adherence rate   | % of beneficiaries visited as per their scheduled visit date. |

**Technical Metrics**

| Metric                   | Description / Formula                                          |
| ------------------------ | -------------------------------------------------------------- |
| Form load time (offline) | Time to load visit form from local SQLite. Target: <3 seconds. |
| Sync success rate        | % of visit records successfully synced. Target: ≥99%.          |
| App crash rate           | % of visit form sessions ending in a crash. Target: <0.5%.     |
| Submission failure rate  | % of visit form submissions that failed to save locally.       |

### 9.3 Health Education Messages

**Performance Metrics**

| Metric                                 | Description / Formula                                                     |
| -------------------------------------- | ------------------------------------------------------------------------- |
| Time spent on message screen per visit | Average time Sakhi spends on health education messages per visit session. |
| Average time per message               | Average time spent on each individual message.                            |
| Messages delivered per visit           | Average count of health education messages shown per visit.               |

**Usage Metrics**

| Metric                                  | Description / Formula                                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Education messages delivered per day    | Count of messages shown by Sakhi per day.                                                          |
| % visits with at least one message      | % of visits where at least one health education message was shown.                                 |
| Unique beneficiaries receiving messages | Count of unique beneficiaries who received at least one education message.                         |
| Average messages shown per visit        | Total messages shown / Total visits.                                                               |
| Mother vs child message ratio           | Ratio of messages shown to mother beneficiaries vs child beneficiaries.                            |
| Topic-wise message usage                | Count of messages shown per topic (nutrition, danger signs, ANC, immunization, newborn care etc.). |

**Quality Metrics**

| Metric                  | Description / Formula                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------- |
| Message completion rate | % of messages scrolled to the end / total messages opened.                             |
| Skipped message rate    | % of messages opened and closed quickly (without engagement). Threshold to be defined. |

**Technical Metrics**

| Metric                             | Description / Formula                                            |
| ---------------------------------- | ---------------------------------------------------------------- |
| Message load time                  | Time to load health education message content from local cache.  |
| Media open/play success rate       | % of audio/video/image files that opened or played successfully. |
| Crash/error rate on message screen | % of message screen sessions ending in a crash or error.         |

### 9.4 Referral

**Performance Metrics**

| Metric                                        | Description / Formula                                                                                                         |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Referral forms filled per day per Sakhi       | Count of referral forms submitted per Sakhi per day.                                                                          |
| % referral form completion rate               | % of referral flags that resulted in a completed referral form. Formula: Referral forms completed / Referral flags generated. |
| % referral follow-up completion rate          | % of referral forms that have a completed follow-up form. Formula: Follow-ups completed / Referral forms completed.           |
| Average time to referral closure              | Average days between referral form submission and confirmed facility visit.                                                   |
| Average time to completing referral follow-up | Average days between facility visit and data entry of follow-up form in the app.                                              |
| Overdue follow-up rate                        | % of referrals where follow-up was not completed within the 7-day window.                                                     |

**Data Quality Metrics**

| Metric                                          | Description / Formula                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| Referral marked complete without facility visit | Count of referral follow-ups marked as complete but with no facility visit recorded. |
| Referral records edited post-submission         | % of referral records corrected after submission.                                    |
| Validation/logical error rate                   | % of referral form submissions triggering a validation or logical error.             |

**Usage Metrics**

| Metric                                   | Description / Formula                                                |
| ---------------------------------------- | -------------------------------------------------------------------- |
| Referrals generated per Sakhi per week   | Count of referral forms submitted per Sakhi per week.                |
| Follow-ups done per Sakhi                | Count of referral follow-up forms submitted per Sakhi.               |
| Mother vs child referral follow-up ratio | Ratio of follow-ups for mother beneficiaries vs child beneficiaries. |
| Active referral caseload per Sakhi       | Count of open referrals at any point in time per Sakhi.              |

**Technical Metrics**

| Metric                                          | Description / Formula                                             |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| Referral follow-up form completion success rate | % of follow-up form submissions that saved successfully.          |
| Form load time (offline)                        | Time to load referral form from local SQLite. Target: <3 seconds. |
| Failed follow-up save rate                      | % of follow-up form submissions that failed to save locally.      |
| Crash/error rate during follow-up               | % of follow-up form sessions ending in a crash.                   |
| Pending unsynced follow-ups count               | Count of follow-up records queued for sync but not yet uploaded.  |

### 9.5 Visit Tracker and Sakhi Dashboard

**Performance Metrics**

| Metric                                      | Description / Formula                                                                                                      |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Visit completed per Sakhi per week          | Count of visits completed by each Sakhi per week.                                                                          |
| Visit completed per Sakhi per month         | Count of visits completed by each Sakhi per month.                                                                         |
| Visit type completed per Sakhi per week     | Breakdown of completed visits by visit type (ANC, PP, NN, INC, CCV, HR) per Sakhi per week.                                |
| Completed visit rate                        | % of scheduled visits completed. Formula: Completed visits / Scheduled visits.                                             |
| High risk beneficiary visit completion rate | % of HR-flagged beneficiaries who had their scheduled visit completed. Formula: HR completed visits / HR scheduled visits. |
| Form completeness rate                      | % of questions answered / total questions in visit forms.                                                                  |
| Time spent on dashboard per session         | Average time Sakhi spends on the dashboard per app session.                                                                |

**Data Quality Metrics**

| Metric                               | Description / Formula                                                   |
| ------------------------------------ | ----------------------------------------------------------------------- |
| Visit accuracy per Sakhi             | Track data entry accuracy per Sakhi across all visit types.             |
| Duplicate visit rate                 | % of visits submitted more than once for same beneficiary on same date. |
| Visit records edited post-submission | % of visit records corrected after submission.                          |
| Mandatory field missing rate         | % of mandatory fields left blank in visit forms.                        |
| Validation/logical error rate        | % of visit form submissions triggering a validation error.              |

**Usage Metrics**

| Metric                                             | Description / Formula                                                                    |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Times visit tracker clicked per Sakhi per day      | Count of times Sakhi taps the Visit Tracker from the dashboard per day.                  |
| Times referral follow-up clicked per Sakhi per day | Count of times Sakhi taps the Referral Follow-up tab per day.                            |
| Notification interaction rate                      | % of notifications clicked by Sakhi. Formula: Notification clicks / Notifications shown. |

**Technical Metrics**

| Metric                         | Description / Formula                                                 |
| ------------------------------ | --------------------------------------------------------------------- |
| Offline dashboard load time    | Time to load the Sakhi dashboard from local data. Target: <3 seconds. |
| Partial dashboard load offline | % of dashboard loads where some data failed to display offline.       |
| Offline dashboard crash rate   | % of dashboard loads ending in a crash.                               |

### 9.6 Closure and Reopen

**Performance Metrics**

| Metric                      | Description / Formula                                                                                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Closures per Sakhi per week | Count of closure forms submitted per Sakhi per week.                                                                                                              |
| Delayed closure rate / TAT  | % of closures where the gap between the event date (death, migration) and closure form submission exceeds a defined threshold. Threshold to be defined by ARMMAN. |
| Reopen request TAT          | Average time from Sakhi reopen request to Supervisor decision (approve/reject).                                                                                   |

**Quality Metrics**

| Metric                               | Description / Formula                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| Reopen approval rate                 | % of reopen requests approved. Formula: Approved reopens / Total reopen requests. |
| Reopen rejection rate                | % of reopen requests rejected. Formula: Rejected reopens / Total reopen requests. |
| Visit records edited post-submission | % of closure records corrected after submission.                                  |
| Mandatory field missing rate         | % of mandatory fields left blank in closure forms.                                |
| Validation/logical error rate        | % of closure form submissions triggering a validation error.                      |

**Usage Metrics**

| Metric                           | Description / Formula                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| Closure type distribution        | Count of closures by reason (death, migration, miscarriage, program completion, withdrawal etc.). |
| Mother vs child closure ratio    | Ratio of mother closures to child closures.                                                       |
| Reopen requests raised per Sakhi | Count of reopen requests submitted per Sakhi.                                                     |

**Technical Metrics**

| Metric                                 | Description / Formula                                            |
| -------------------------------------- | ---------------------------------------------------------------- |
| Form load time (offline)               | Time to load closure form from local SQLite. Target: <3 seconds. |
| Sync success rate                      | % of closure records successfully synced. Target: ≥99%.          |
| App crash rate                         | % of closure form sessions ending in a crash.                    |
| Submission failure rate                | % of closure form submissions that failed to save locally.       |
| Pending sync record count              | Count of closure records queued for sync but not yet uploaded.   |
| Reopen request submission success rate | % of reopen requests that submitted successfully.                |

### 9.7 Data Sync

**Performance Metrics**

| Metric                          | Description / Formula                                                     |
| ------------------------------- | ------------------------------------------------------------------------- |
| Data syncs per Sakhi per week   | Count of data uploads initiated per Sakhi per week.                       |
| Average sync duration per Sakhi | Average time from sync start to sync completion per Sakhi.                |
| Average sync delay              | Average number of days between form submission and sync upload per Sakhi. |

**Data Quality Metrics**

| Metric                                | Description / Formula                                                      |
| ------------------------------------- | -------------------------------------------------------------------------- |
| Data loss incidence                   | Count of records confirmed lost during sync. Target: 0.                    |
| Duplicate record creation during sync | Count of duplicate records created as a result of a sync event. Target: 0. |

**Reliability Metrics**

| Metric                    | Description / Formula                                                         |
| ------------------------- | ----------------------------------------------------------------------------- |
| Sync success rate         | % of sync attempts that completed successfully. Target: ≥99%.                 |
| Partial sync failure rate | % of sync attempts where some but not all records were uploaded successfully. |

**Technical Metrics**

| Metric                       | Description / Formula                                                          |
| ---------------------------- | ------------------------------------------------------------------------------ |
| Crash rate during sync       | % of sync sessions ending in an app crash.                                     |
| API failure rate during sync | % of API calls made during sync that returned an error. Monitored via Grafana. |

### 9.8 Learn More (FAQ / Knowledge Base)

**Performance Metrics**

| Metric                               | Description / Formula                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| FAQ type accessed per Sakhi          | Count of Learn More sections/topics accessed per Sakhi — used to identify most relevant content. |
| Time spent on Learn More per session | Average time Sakhi spends in the Learn More section per session.                                 |

**Usage Metrics**

| Metric                                    | Description / Formula                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| Learn More opens per Sakhi per week/month | Count of times Sakhi opens the Learn More section per week/month.      |
| Topic-wise usage                          | Count of accesses per topic category — identifies high-demand content. |
| Repeat usage rate                         | % of Sakhis who accessed Learn More more than once in a week.          |

**Technical Metrics**

| Metric                          | Description / Formula                                 |
| ------------------------------- | ----------------------------------------------------- |
| Learn More screen load time     | Time to load the Learn More section from local cache. |
| Crash rate on Learn More screen | % of Learn More sessions ending in a crash.           |

### 9.9 Implementation Notes

All metrics in this section must be instrumented as part of the initial development. The following implementation requirements apply:

| Requirement                 | Detail                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client-side instrumentation | All usage and performance metrics must be captured as client-side events in the Sakhi app. Events must be queued locally and synced to the server with each data upload.        |
| Server-side instrumentation | All technical metrics (crash rate, API failure rate, sync success rate) must be captured at the server level via API logs and monitored through Grafana dashboards.             |
| Grafana dashboards          | Technical and reliability metrics must be visible in real time on Grafana. Alerts must be configured for threshold breaches as defined in NFR-MAINT-2 (Section 5.5).            |
| Metabase reports            | Performance, usage, and data quality metrics must be available as Metabase reports for the ARMMAN program team. SQL queries to be provided by ARMMAN data team.                 |
| Exclusion criteria          | All test data (enrollments, visits, referrals from accounts flagged as test in project/funder/village/user master) must be excluded from all metrics calculations.              |
| Supervisor app metrics      | Metrics for the Supervisor app are not defined in the PRD. ARMMAN to provide Supervisor app metrics requirements in a future revision. This section will be updated on receipt. |

---

## Appendix A — Visit Schedule Rules

### A.1 ANC Schedule

| Rule                      | Value                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------- |
| Formula                   | ((EDD − Registration date) / 30) + 1                                               |
| Maximum visits            | 10 (for woman registered on LMP date)                                              |
| Cap                       | None — formula-driven and uncapped                                                 |
| ANC1                      | Day 0 (registration date). Window: Day 0 to Day +5                                 |
| ANC2 to ANCn              | Previous scheduled date + 30 days. Window ±5 days.                                 |
| ANC-HR anchor             | Actual completion date of triggering visit + 15 days. Window ±2 days.              |
| ANC-Post EDD trigger      | If delivery form not filled by EDD+7 days. Visit on EDD+8. Window EDD+8 to EDD+13. |
| ANC-Post EDD name         | System-generated: ANC(total regular ANC visits + 1)                                |
| Delivery form effect      | ALL open ANC visits auto-marked Lapsed on submission                               |
| Escalation — ANC          | 2 consecutive missed → Supervisor escalation                                       |
| Escalation — ANC-HR       | 1 missed → Immediate Supervisor escalation                                         |
| Escalation — ANC-Post EDD | 1 missed → Immediate Supervisor escalation                                         |

### A.2 Postpartum Schedule

| Visit | Scheduled Date (from Delivery) | Window Opens | Window Closes | Escalation                                                           |
| ----- | ------------------------------ | ------------ | ------------- | -------------------------------------------------------------------- |
| PP1   | Day 0                          | Day 0        | Day +14       | 1 missed → Immediate                                                 |
| PP2   | Day +15                        | Day +15      | Day +28       | 1 missed → Immediate                                                 |
| PP3   | Day +58                        | Day +40      | Day +50       | 1 missed → Immediate                                                 |
| PP4   | Day +88                        | Day +70      | Day +80       | 1 missed → Immediate                                                 |
| PP5   | Day +118                       | Day +100     | Day +110      | 1 missed → Immediate. PP5 completion triggers mother closure prompt. |

### A.3 Neonatal Schedule

| Visit | Window                         | Condition                                                                                                            | Escalation                                 |
| ----- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| NN1   | Day 0 to Day 14 (fixed range)  | Generated if delivery form filled on Day 0–14. Filled with delivery form session.                                    | 1 missed → Immediate Supervisor escalation |
| NN2   | Day 15 to Day 28 (fixed range) | Generated after NN1 completion (or on delivery date if Day 15–28). If delivery on Day 28, filled with delivery form. | 1 missed → Immediate Supervisor escalation |

SR-NN-01: No HR visits in neonatal phase. Critical conditions trigger referral only.
Note: NN visit form will be generated after INC registration done between 0-28 days of birth irrespective of whether it's a direct child or ANC mother child.

### A.4 INC Schedule (0–12 months)

| Rule                                 | Value                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Early registration (Day 0 to Day 58) | 11 visits, fixed. INC1 anchor = DOB + 58.                                                          |
| Late registration (after Day 58)     | INC1 = Registration date. Additional visits = Floor((365 − (Reg date − DOB)) / 30).                |
| INC window                           | Schedule date ±5 days                                                                              |
| INC-HR anchor                        | Actual completion date + 15 days. Window ±2 days.                                                  |
| Hard cutoff                          | Visits scheduled beyond DOB + 370 are dropped (not missed). CCV phase starts after last INC visit. |
| Escalation — INC                     | 2 consecutive missed → Supervisor escalation                                                       |
| Escalation — INC-HR                  | 1 missed → Immediate Supervisor escalation                                                         |

### A.5 CCV Schedule (13–24 months)

| Rule                        | Value                                                                                                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schedule type               | Fixed — generated after risk assessment of last 3 INC visits.                                                                                                                           |
| Risk state evaluation       | Two-step process at 12-month transition: Step 1 — Scan all INC visits (0–12m): was HR ever detected? Step 2 — If yes, check last 3 INC visits for current severity.                     |
| Never at HR cadence         | No HR detected in entire 0–12m period → 1 visit every 2 months (13–24m)                                                                                                                 |
| Currently HR — SAM/Danger   | SAM or danger sign detected in any of the last 3 INC visits → monthly. HR visit in 30 days (every detection — once schedule starts)                                                     |
| Currently HR — Other        | Other HR condition in last 3 INC visits → monthly. HR visit in 30 days (every detection — once schedule starts)                                                                         |
| Recently Recovered (13–18m) | HR detected earlier but last 3 INC visits normal                                                                                                                                        | 1 visit per month      |
| Recently Recovered (19–24m) | HR detected earlier but last 3 INC visits normal                                                                                                                                        | 1 visit every 2 months |
| Stable Low Risk             | No HR in last 3 visits but HR was present earlier in 0–12m                                                                                                                              | 1 visit every 2 months |
| Window                      | Schedule date ±5 days                                                                                                                                                                   |
| HR single instance          | One HR visit per detection. Reverts to normal cadence after HR visit completion.                                                                                                        |
| Program exit                | 24 months (DOB + 730 days). Child closure prompt. If child is at high risk on last CCV visit then he will get one CCV-HR visit and closure form will be filled during last CCV HR visit |
| Escalation                  | 1 missed CCV or CCV-HR → Immediate Supervisor escalation                                                                                                                                |

## Appendix B — Visit Windows Summary

| Visit            | Journey          | Scheduled Date           | Window Opens | Window Closes | Escalation on Miss         |
| ---------------- | ---------------- | ------------------------ | ------------ | ------------- | -------------------------- |
| ANC1             | Mother — ANC     | Registration date        | Day 0        | Day +5        | N/A                        |
| ANC2–ANCn        | Mother — ANC     | Prev scheduled + 30 days | Schedule −5  | Schedule +5   | 2 consecutive → Supervisor |
| ANC-HR           | Mother — ANC     | Actual visit date + 15   | Anchor −2    | Anchor +2     | 1 missed → Immediate       |
| ANC-Post EDD     | Mother — ANC     | EDD + 8                  | EDD + 8      | EDD + 13      | 1 missed → Immediate       |
| PP1              | Mother — PP      | Day 0 (delivery date)    | Day 0        | Day +14       | 1 missed → Immediate       |
| PP2              | Mother — PP      | Day +15                  | Day +15      | Day +28       | 1 missed → Immediate       |
| PP3              | Mother — PP      | Day +58                  | Day +53      | Day +63       | 1 missed → Immediate       |
| PP4              | Mother — PP      | Day +88                  | Day +83      | Day +93       | 1 missed → Immediate       |
| PP5              | Mother — PP      | Day +118                 | Day +113     | Day +123      | 1 missed → Immediate       |
| NN1              | Child — Neonatal | With delivery form       | Day 0        | Day +14       | 1 missed → Immediate       |
| NN2              | Child — Neonatal | Day +15                  | Day +15      | Day +28       | 1 missed → Immediate       |
| INC1 (early reg) | Child — INC      | DOB + 58                 | DOB + 53     | DOB + 63      | 2 consecutive → Supervisor |
| INC1 (late reg)  | Child — INC      | Registration date        | Reg date −5  | Reg date +5   | 2 consecutive → Supervisor |
| INC2–INCn        | Child — INC      | Prev scheduled + 30      | Schedule −5  | Schedule +5   | 2 consecutive → Supervisor |
| INC-HR           | Child — INC      | Actual visit + 15        | Anchor −2    | Anchor +2     | 1 missed → Immediate       |
| CCV1–CCVn        | Child — CCV      | State-dependent          | Schedule −5  | Schedule +5   | 1 missed → Immediate       |
| CCV-HR (SAM)     | Child — CCV      | Actual visit + 30        | Schedule −5  | Schedule +5   | 1 missed → Immediate       |
| CCV-HR (Other)   | Child — CCV      | Actual visit + 30        | Schedule −5  | Schedule +5   | 1 missed → Immediate       |

## Appendix C — Escalation Rules

| Trigger                            | Type      | Escalation Target        | Supervisor Options                              |
| ---------------------------------- | --------- | ------------------------ | ----------------------------------------------- |
| 2 consecutive ANC missed           | Delayed   | Supervisor card          | Transfer, Close, Continue                       |
| 1 ANC-HR missed                    | Immediate | Supervisor card          | Transfer, Close                                 |
| 1 ANC-Post EDD missed              | Immediate | Supervisor card          | Transfer, Close                                 |
| 1 PP missed                        | Immediate | Supervisor card          | Transfer, Close (Continue = default)            |
| 1 NN missed                        | Immediate | Supervisor card          | Transfer, Close (Continue = default)            |
| 2 consecutive INC missed           | Delayed   | Supervisor card          | Transfer, Close (Continue = default)            |
| 1 INC-HR missed                    | Immediate | Supervisor card          | Transfer, Close (Continue = default)            |
| 1 CCV missed                       | Immediate | Supervisor card          | Transfer, Close (Continue = default)            |
| 1 CCV-HR missed                    | Immediate | Supervisor card          | Transfer, Close (Continue = default)            |
| Referral follow-up lapsed (7 days) | Delayed   | Supervisor notification  | No action needed — auto-lapsed                  |
| Non-referral request submitted     | On demand | Supervisor approval card | Approve, Reject (1-day window, then auto-lapse) |
| Accompanied referral follow-up     | On demand | Supervisor approval card | Approve, Reject (no timeout)                    |

_Note: Continue is not an explicit button. For all visit types, Continue is the default system behaviour — if Supervisor takes no action, the schedule continues running independently._

## Appendix D — High Risk Detection Rules

Please refer to the 📎 **High risk protocols_Developer's copy** sheet provided to us by Armman.

## Appendix E — Referral Rules

### E.1 Referral Types

| Type        | Description                                               | Who Decides                                                | Follow-Up Required                                             | Incentive Trigger                                                                                                      |
| ----------- | --------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Standard    | Sakhi advises beneficiary to visit facility independently | Sakhi decides at time of visit                             | Referral follow-up form within 7 days                          | Follow-up form completed within 7 days. Approves Referral Follow-up Incomplete if needed                               |
| Accompanied | Sakhi physically escorts beneficiary to facility          | Sakhi decides independently — no prior Supervisor approval | Referral follow-up form + photo evidence + Supervisor approval | Supervisor approves follow-up form with photo proof to release incentive. Follow-up form + photo + Supervisor approval |

### E.2 Follow-Up Window Rules

The 7-day referral follow-up window opens on the referral form submission date (visit date). The Sakhi must fill the referral follow-up form within these 7 days. No visit blocking applies. If the window closes without form submission, referral is automatically Lapsed in DB. No new window is granted even if the Sakhi converts a Standard to Accompanied referral mid-window.

"If the Sakhi does not fill the referral follow-up form within the 7-day window, the referral is automatically marked as Lapsed in the DB. The UI continues to show 'Pending Referral Follow-up' for the Sakhi — no new status is introduced."

### E.3 Referral Follow-up Form Flow

The referral follow-up form has four sections: Visit Data → Summary → Health Information → Referral. The submit button appears only after the Referral section is completed.

If beneficiary visited facility → form completes normally → Referral Complete.

If beneficiary did not visit facility → Sakhi enters reason → system checks original referral type:

- **Standard referral:** "Do you want to convert to Accompanied?" shown.
  - Yes → New accompanied referral form generated. Complete within original 7-day window.
  - No → Form submits → Referral Follow-up Incomplete card sent to Supervisor.
- **Accompanied referral:** conversion question not shown. Form submits directly → Referral Follow-up Incomplete card sent to Supervisor.

### E.4 Referral Follow-up Incomplete — Supervisor Card

Card name: **Referral Follow-up Incomplete** (not "Referral Skip" or "Referral Incomplete").

Supervisor receives this card when Sakhi submits a follow-up form indicating the beneficiary did not visit the facility.

- Supervisor has no timeline to act — card stays pending indefinitely.
- If Supervisor **approves**: DB marks referral as Lapsed. Sakhi UI continues to show "Pending Referral Follow-up" — no new status. No incentive paid.
- If Supervisor **rejects**: Sakhi must fill the follow-up form again.

"If Supervisor rejects the follow-up incomplete card after the 7-day window has already closed, the referral is marked as Lapsed in the DB regardless. The UI continues to show 'Pending Referral Follow-up'. No new window is opened."

### E.5 Accompanied Referral — Supervisor Approval

After Sakhi completes an accompanied referral and uploads facility photo in the follow-up form, Supervisor receives an approval card.

- Supervisor reviews photo proof.
- If **approves**: accompanied referral incentive released (Rs 160 Palghar / Rs 300 Nandurbar). Referral marked Complete.
- If **rejects**: referral remains pending. Sakhi notified.
- No timeout — card stays pending indefinitely. Requests sorted reverse chronologically in Pending Approvals view.

> ⚠️ **PENDING** — If Supervisor rejects the accompanied referral photo proof, what action is the Sakhi expected to take next? Options: (a) Sakhi re-uploads a new photo within the original window, (b) referral is marked Lapsed and no incentive paid, (c) Sakhi re-does the accompanied visit. ARMMAN to confirm before accompanied referral module is built. [Open item — Referral AR-01]

**Confirmation received:** If rejected, Sakhi will have to fill out the form again.

### E.6 DB States for Referral

| State                                   | Meaning                                                                       | Shown in UI?                                           |
| --------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| Referral Open                           | Follow-up window active                                                       | Yes — action button in Referral tab                    |
| Referral Complete                       | Follow-up form submitted, facility visited                                    | Yes — completed state                                  |
| Referral Lapsed                         | Window closed without submission, or Supervisor approved Follow-up Incomplete | DB only — UI shows "Pending Referral Follow-up"        |
| Referral Follow-up Incomplete — Pending | Supervisor yet to act on incomplete card                                      | Yes — shown as Pending Referral Follow-up in Sakhi app |

### E.7 First-Instance Referral Rule

For conditions triggered on first instance only (Age, Undernutrition, Stunting, Bad Obstetric History): the visit form asks "Is referral needed as this is a new condition?" If No — no referral generated. Prevents duplicate referrals on repeat detection of permanent-risk conditions.

### E.8 Referral Naming Convention

| Form                    | Naming                                     | Example                  |
| ----------------------- | ------------------------------------------ | ------------------------ |
| Referral form           | RV1, RV2, RV3 (sequential per beneficiary) | First referral = RV1     |
| Referral follow-up form | RFU1, RFU2 (linked to parent RV)           | Follow-up for RV1 = RFU1 |

## Appendix F — Closure and Reopen Rules

### F.1 Mother Closure Reasons

| Reason                            | How Triggered                                 | Notes                                                                                                                           | Reopen Permitted?              |
| --------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Program cycle completed (PP5)     | Auto-prompt after PP5 completion              | Closure form opens immediately in same session as PP5 submission. No separate trigger needed. Reason = Program cycle completed. | No                             |
| Withdrawal of consent             | Sakhi fills closure form manually             | —                                                                                                                               | No                             |
| Miscarriage                       | Sakhi fills closure form manually             | —                                                                                                                               | No                             |
| Abortion (spontaneous or induced) | Sakhi fills closure form manually             | —                                                                                                                               | No                             |
| Migration                         | Sakhi fills closure form manually             | If beneficiary expected to return, Sakhi notes this. Reopen request possible on return.                                         | Yes — if beneficiary returns   |
| Maternal death                    | Sakhi fills closure form manually             | Time, cause (multi-select), place of death mandatory.                                                                           | No                             |
| Stillbirth                        | Child closure only — mother journey continues | Mother receives PP1–PP5. Child journey closed. Mother closure not triggered.                                                    | N/A — mother journey continues |

### F.2 Child Closure Reasons

| Reason                            | How Triggered                                                                                                                                                          | Notes                                                                                                        | Reopen Permitted?      |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------- |
| Program cycle completed (INC/CCV) | Auto-prompt at 1-year INC completion or 24-month CCV completion. If HR detected at last CCV visit, closure is deferred until the subsequent CCV-HR visit is completed. | Closure form opens immediately in same session as CCV or CCV-HR form completion. No separate trigger needed. | No                     |
| Withdrawal of consent             | Sakhi fills closure form manually                                                                                                                                      | —                                                                                                            | No                     |
| Migration                         | Sakhi fills closure form manually                                                                                                                                      | Reopen request possible on return.                                                                           | Yes — if child returns |
| Infant death                      | Sakhi fills closure form manually                                                                                                                                      | Time, cause (multi-select), place of death mandatory.                                                        | No                     |
| Child Death                       | Sakhi fills closure form manually                                                                                                                                      | Time, cause (multi-select), place of death mandatory.                                                        | No                     |

### F.3 Reopen Rules

| Rule              | Detail                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Permitted reasons | Migration (beneficiary returned) and Closed by mistake — two reasons only.                                             |
| Not permitted     | Death, miscarriage, abortion, withdrawal of consent — permanent closures.                                              |
| Process           | Sakhi taps Re-Open on beneficiary profile → selects reason → submits reopen request → goes to Supervisor for approval. |
| Approved          | Beneficiary status changes to Active. Appears in Sakhi's open beneficiary list. Schedule resumes from current point.   |
| Rejected          | Beneficiary remains in Closed state. Sakhi is notified.                                                                |
| Who approves      | Supervisor only. Manager can view but cannot directly approve reopen requests.                                         |

## Appendix G — Delivery Form and Combined Visit Rules

SR-INCENTIVE-01: All incentive rates are stored in a configurable master settings table accessible to authorised ARMMAN administrators via Manager Dashboard settings. No amounts are hardcoded. Rate changes take effect from update date. Full audit log maintained.

### G.1 What Happens on Delivery Day (Day 0)

For ANC-enrolled mothers, the delivery session consists of: Delivery Form + PP1 form filled together. On submission: all open ANC visits auto-marked Lapsed, child profile auto-created from delivery data, PP schedule generated (PP2 through PP5), NN schedule generated, INC and CCV schedule generated as applicable. No separate consent was taken at mother's ANC enrolment.

For late delivery form scenarios (Day 15+), the system auto-determines which PP and NN sections to show based on days elapsed since delivery. See Appendix G.2.

_For ANC-enrolled mothers: The delivery event is a combined session. Consent for the child's participation in the programme was obtained at the time of the mother's ANC enrolment — no separate consent or child registration prompt is required at delivery. The delivery session consists of: Delivery Form + PP1 form appearing together (Part 1). On submission, the child's profile is automatically created using data from the delivery form. NN1 then opens as Part 2 of the same session. The child is automatically part of the programme from this point forward._

_For directly registered children (mother not previously enrolled in ANC): A separate child registration form is presented where consent is collected. If consent is No — the form stops, no registration happens, no NN visits are generated. If consent is Yes — child is registered and NN schedule is generated._

On submission, the system simultaneously: closes all remaining open ANC visits, generates the full PP schedule (PP1–PP5 from delivery date), generates NN2 (held pending NN1 completion), generates the INC schedule (using two-formula approach), and registers the child as a new beneficiary linked to the mother.

### G.2 Late Delivery Form — Auto-Determination of Visit Sections

_All scenarios below apply to ANC-enrolled mothers only. For direct child registration, the Sakhi fills the child registration form independently — no combined session._

If the delivery form is filled on a day after Day 0, the system auto-determines which PP and NN sections to show based on days elapsed since delivery:

| Days Since Delivery | PP Section Shown                   | NN Section Shown              | Notes                                                |
| ------------------- | ---------------------------------- | ----------------------------- | ---------------------------------------------------- |
| Day 0–14            | PP1 (window Day 0 to Day 14)       | NN1 (window Day 0 to Day 14)  | Standard delivery day scenario                       |
| Day 15–28           | PP2 (window Day 15 to Day 28)      | NN2 (window Day 15 to Day 28) | PP1 and NN1 are skipped — windows already passed     |
| Day 29+             | PP2 onwards (whichever is current) | No neonatal section           | Child goes directly to INC. NN visits not generated. |

Same rule applies here - If the mother decides to register the child, only then the Registration form will be filled and NN1 will be conducted.

### G.3 ANC Auto-Close on Delivery

When the delivery form is submitted at any point, ALL open ANC visits are automatically marked as Lapsed — including ANC-Post EDD if it is currently open. No separate action is required from the Sakhi. [CONFIRMED]

### G.4 Stillbirth Handling

If the delivery outcome is a stillbirth: the mother still receives PP1 through PP5 (biological postpartum recovery applies regardless of birth outcome), the birth outcome is recorded as part of the delivery form and no child journey is initiated.

### G.5 Multiple Births

The delivery form captures details of as many children in the case of multiple births. Each child receives their own Beneficiary ID and their own independent NN and INC schedule. (No limit to the number of children)

## Appendix H — Incentive Calculation Rules

SR-INCENTIVE-01: All incentive rates are stored in a configurable master settings table accessible to authorised ARMMAN administrators via Manager Dashboard settings. No amounts are hardcoded. Rate changes take effect from update date. Full audit log maintained.

| Incentive Type                    | Rate                                                                  | Geography      | Confirmed?                         |
| --------------------------------- | --------------------------------------------------------------------- | -------------- | ---------------------------------- |
| ANC visit                         | Rs 65 per visit                                                       | All            | Confirmed — verbal + Wages Report  |
| INC visit                         | Rs 65 per visit                                                       | All            | Confirmed — verbal + Wages Report  |
| PP visit                          | Rs 65 per visit                                                       | All            | Assumed — same rate                |
| NN visit                          | Rs 65 per visit                                                       | All            | Assumed — same rate                |
| CCV visit                         | Rs 65 per visit                                                       | All            | Assumed — same rate                |
| ANC-HR, INC-HR, CCV-HR            | Rs 65 per visit                                                       | All            | Assumed — same rate                |
| Standard referral completion      | Rs 50 per visit                                                       | All            | Confirmed                          |
| Accompanied referral              | Rs 160 per visit                                                      | Palghar        | Confirmed                          |
| Accompanied referral              | Rs 300 per visit                                                      | Nandurbar      | Confirmed                          |
| Non Referral / lapsed / timed out | Rs 0                                                                  | All            | Confirmed                          |
| Monthly meeting honorarium        | Rs 200 per day of meeting attended. No minimum visit conditionality.  | All            | Confirmed — Wages Report           |
| Quarterly training honorarium     | Rs 200 per day of training attended. No minimum visit conditionality. | All            | Confirmed — Wages Report           |
| Monthly retainer                  | Rs 500 per AS per month                                               | Nandurbar only | Confirmed — conditionality pending |

**Total Payout Formula (from ARMMAN Wages Report):**

**Total Payout = (ANC/PP visits + Child visits) × Rs 65 + (Regular referrals × Rs 50) + (Accompanied referrals × Rs 160 or Rs 300 by geography) + Monthly retainer (Nandurbar: Rs 500) + (Meeting days attended × Rs 200) + (Training days attended × Rs 200)**

> 🚩 **ASSUMPTION** — Visit incentive of Rs 65 is assumed for PP, NN, CCV, and HR visit types. Any variation will be treated as a Change Request.

## Appendix I — Language Support

> ✓ **CONFIRMED** — English and Marathi only for initial release. Hindi removed from scope. Written confirmation received 23 April 2026.

| Item                         | Value                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| Supported languages          | English, Marathi                                                                                |
| Default language             | English                                                                                         |
| Language toggle              | Menu → Language button. Switches between English and Marathi.                                   |
| Scope                        | All form questions, health education messages, UI labels, notifications, counselling checklists |
| Marathi translation timeline | ARMMAN committed to end of May 2026                                                             |
| Development approach         | Dummy Marathi content used until final content received from ARMMAN                             |
| Hindi                        | Removed from initial release scope. May be added in a future release.                           |

## Appendix J — Form Schema Reference

### J.1 Confirmed Corrections from Working Sessions

| Form                | Field / Section           | Issue in Original                              | Confirmed Correction                                                                                                                                                                                                 |
| ------------------- | ------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Infant Registration | Registration eligibility  | Listed as 1–183 days AFTER two neonatal visits | Corrected: 0–365 days (0–12 months) for both via-mother and direct registration. Neonatal visits are not a pre-condition for registration.                                                                           |
| INC Visit           | Visit naming / codes      | Uses 'PNC' nomenclature throughout             | Renamed to INC (Infant Natal Care). All visit codes updated: INC1, INC2, INCHR1 etc.                                                                                                                                 |
| All Visit Forms     | Form discarding on exit   | Unclear if partial data is saved               | Confirmed: if Sakhi exits mid-form, the form is fully discarded. No partial save. Visit remains Open. [FR-S-4.2]                                                                                                     |
| Delivery Form       | Combined session sections | Unclear which forms appear together            | Confirmed: Delivery Form + PP (Delivery form and PP will appear together) + (Yes/No) Child registration form + NN1 appear as a single session on Day 0. System auto-determines sections if filled late. [Appendix G] |

### J.2 Validation Alerts — System-Level

The following system-level validation alerts apply across forms. These are not field-level validations — they fire at the form level:

| Alert                           | Trigger                                                    | Behaviour                                                                                                                                                                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicate Detection — Mother    | Name + LMP + Village/Pada match on registration            | System shows duplicate warning before allowing submission. Sakhi must acknowledge before proceeding.                                                                                                                                                                        |
| Duplicate Detection — Child     | Name + DOB + Village/Pada match on registration            | Same as above.                                                                                                                                                                                                                                                              |
| Critical Danger Sign — Mid Form | Any critical danger sign field triggered during visit form | Immediate Urgency banner shown: 'Please refer beneficiary to the health facility immediately.' [CONFIRMED — Banner closes the form. Form is discarded. Sakhi exits to referral. Confirmed 22 May 2026]                                                                      |
| Hb Cross-Visit Check            | Hb value differs from last visit by ±2 g/dl                | If Hb value differs from last visit by ±2 g/dl, the alert fires immediately when Sakhi enters the value in the Hb field — not at end of form submission. Alert prompts Sakhi to confirm or redo the reading before continuing. Applies to both ANC and INC/CCV visit forms. |
| LMP Change Alert                | Sakhi attempts to edit LMP                                 | System shows warning that this requires a sonography report upload and Supervisor approval before the change is applied.                                                                                                                                                    |
| Form Version Change             | ARMMAN updates a form in backend                           | On next sync, system downloads new version and records the change log. Sakhi is notified of form update.                                                                                                                                                                    |

### J.3 Field-Level Validation Rules — Developer Reference

Refer 📎 **Revised App Form Final 20.3.26**

This section summarises all field-level validation rules by category across all forms. The source is the Revised App Form Final (20 March 2026) Excel document. Developers must refer to the Validations column of each form sheet for the complete per-field rules. This section provides the framework and the most critical rules only.

_Date field rules (applies to all date fields across all forms):_ Format dd-mm-yyyy. Calendar picker must be shown. Visit dates cannot be future. LMP cannot be future or on/after registration date. Registration date auto-populates to today. Death dates must be after delivery date (child). Vaccination dates cannot be future and cannot be before date of birth. Delivery date must be after LMP and on/before today.

_Numeric field rules — critical clinical ranges:_ BP Systolic 70–300 mmHg. BP Diastolic 40–130 mmHg. Haemoglobin 1–18 g/dl (also triggers cross-visit Hb check — see J.2). Height 120–190 cm (recorded once at first ANC visit, auto-populated thereafter). Weight 25–100 kg. MUAC 10–40 cm. BMI auto-calculated. Body Temperature 94–105°F. Blood Glucose 40–400 mg/dl. Fundal Height 10–50 cm. Child Weight 0.5–15 kg. Child Length 25–99 cm. MUAC (child) 5–25 cm (valid only for children over 6 months). Gravida/Para/Living children/Abortions/Stillbirths/Dead children range 0–14.

_Multi-select field rules:_ All multi-select fields marked "At least one option selected" must prevent form progression if nothing is selected. If "None" is a response option and is selected, all other options in the same question must be automatically disabled. Developer note: all multi-select fields must create a separate Boolean variable per option in the database — not a single concatenated string.

_Auto-calculated fields — do not allow manual input:_ EDD = LMP + 280 days. Gestational age = Floor((current date − LMP) / 7). BMI = weight / (height in metres)². Gestational weight gain = delta from previous visit. Nutritional Z-scores = WHO growth standards (Wasting, Stunting, Underweight). Child age in months = Floor((today − DOB) / 30). Beneficiary ID = auto-generated offline, unique.

_Conditional visibility rules:_ Fetal Heart Rate, Fetal Movements, Fundal Height: show only when gestational age ≥ 20 weeks. KMC fields: show only when birth weight < 2500g or delivery type is preterm. "Convert to Accompanied?": show only when original referral type is Standard. "None" disables other options: applies to vaccination status, Td doses. Cause/time/place of death fields: show only when death outcome is selected.

_Audio and media rules:_ Consent video and audio must be played fully before Sakhi can proceed. Progress bar must be shown. Photo capture for consent, sonography report, and accompanied referral evidence must use live camera only — device photo gallery access must be denied for these specific fields.

### J.4 Post-Submission Editable Fields — Developer Reference

This section lists all fields that are editable after successful form submission, per form. The source of truth is the "Is an editable field?" column of the Revised App Form Final (20 March 2026) Excel document.

| Form                     | Editable Fields After Submission                                                                                                                                                                      | Requires Supervisor Approval?                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PW Registration          | LMP date, EDD (auto-recalcs), Address, Mobile, Phone owner, Gravida, Para, Living children, Abortions, Stillbirths, Dead children, Sickle Cell. Will require image upload and date field when edited. | LMP and image upload — requires sonography upload and FR-SV-4.2 approval. All others: No.<br>1st time - LMP date is only a date field<br>2nd time (edit) - (1) Sakhi uploads sonography image first; date field locked until upload complete. (2) Sakhi enters the corrected LMP date. Both submitted together for Supervisor approval via FR-SV-4.2. On approval: LMP updated system-wide, ANC schedule regenerated. On rejection: no change. All others: No. |
| Infant Registration      | Caregiver name, Mother DOB, Address, Mobile, Phone owner, Birth length, Birth weight, Current length at registration, Current weight at registration                                                  | No                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Delivery / PP / Neonatal | Birth length and weight (all children), Cause/place/date of neonatal death (all children and neonatal)                                                                                                | No                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ANC Closure              | Closure reason, Date of event, Time/cause/place of maternal death, Other specify                                                                                                                      | No                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Child Closure            | Closure reason, Date of event, Time/cause/place of infant death, Other specify                                                                                                                        | No                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Infant Visits            | All vaccination fields and dates, Source of immunisation data                                                                                                                                         | No — these are editable to allow corrections across visits                                                                                                                                                                                                                                                                                                                                                                                                     |
| ANC Visit                | None                                                                                                                                                                                                  | N/A                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Referral                 | None                                                                                                                                                                                                  | N/A                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

**Implementation notes:** An Edit button must be displayed on the submitted form view only for the fields listed above. All other fields must be read-only. Every edit must be written to the audit log (field, old value, new value, Sakhi ID, timestamp). Edits sync on next Data Upload.

## Appendix K — System and Configuration Rules

> ✓ **CONFIRMED** — All system rules below are confirmed. They apply across the full platform and must not be hardcoded.

### K.1 gorules — Business Rule Engine

gorules is mandatory for ALL workflow rules. No business logic may be hardcoded anywhere in the application. This applies universally to:

| Rule Category               | Examples                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------- |
| Visit scheduling formulas   | ANC formula, INC two-formula approach, PP schedule, CCV state table                     |
| HR detection thresholds     | All 18 ANC conditions, all 10 infant conditions — thresholds, grades, referral triggers |
| Escalation trigger logic    | Which visit types escalate after 1 missed vs 2 consecutive missed                       |
| Incentive calculation logic | Rate per visit type, referral type, training type, monthly retainer conditionality      |
| Closure and reopen rules    | Which closure reasons permit reopen, reopen approval flow                               |

### K.2 Master Settings — Configurable Without Code Deployment

| Setting                                                  | Who Can Edit                                                | Audit Log?                               |
| -------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| Incentive rates (all types)                              | ARMMAN Administrator via Manager Dashboard                  | Yes — full audit log per SR-INCENTIVE-01 |
| HR detection thresholds                                  | ARMMAN Administrator via gorules config                     | Yes                                      |
| Visit scheduling parameters                              | ARMMAN Administrator via gorules config                     | Yes                                      |
| Geography master data (State/District/Block/PHC/Village) | ARMMAN Administrator                                        | Yes                                      |
| Funder and Project master data                           | ARMMAN Administrator                                        | Yes                                      |
| Training topic master list                               | ARMMAN Administrator                                        | Yes                                      |
| Health education content (via Strapi CMS)                | ARMMAN Content Manager                                      | Yes                                      |
| Form versions                                            | ARMMAN Administrator — triggers download on next Sakhi sync | Yes                                      |

### K.3 Offline-First Rules

| Rule                      | Detail                                                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All scheduling            | Generated on device. No connectivity required for schedule generation, update, or display.                                                                                                                                                                    |
| All form submission       | Forms submitted to local SQLite. Queued for sync.                                                                                                                                                                                                             |
| HR detection              | gorules evaluation runs on device against locally cached rules.                                                                                                                                                                                               |
| Login                     | Works offline using locally cached credentials. [FR-S-1.1]                                                                                                                                                                                                    |
| Sync trigger              | Manual — Sakhi taps Data Upload button. [FR-S-11.2]                                                                                                                                                                                                           |
| Sync failure notification | If upload stops mid-way: immediate notification. If not synced for 3 days: Day 3 notification. [FR-S-11.3] No upload in 3 days = Sakhi appears on Supervisor monitoring dashboard list. No push notification sent to Supervisor — list updates automatically. |
| Supervisor monitoring     | Sakhis not synced in 3 days appear on Supervisor monitoring dashboard. [FR-S-11.4]                                                                                                                                                                            |
| Health Education Messages | All messages and media as part of health education which has to be shared by the Sakhi to the beneficiaries                                                                                                                                                   |

### K.4 Data Retention and Security

| Rule                     | Detail                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Local storage encryption | All data stored on Sakhi device must be encrypted at rest.                                                    |
| Conflict resolution      | Record ownership + timestamp. Server record wins on conflict.                                                 |
| Data residency           | India-only hosting. [PENDING — formal confirmation from ARMMAN]                                               |
| PII handling             | Beneficiary name, contact, and health data treated as PII. Access strictly role-based.                        |
| Audit trail              | All form submissions, approvals, rate changes, and closure actions must be logged with user ID and timestamp. |

## Appendix L — Requirement Traceability Matrix

PFA the RTM document - 📎 **RTM - Armman SRS V2.0**

## Appendix M — PRD Discrepancy and Update Register

PFA the Required update register - 📄 **PRD Discrepancy and Update Register - Armman.docx**
