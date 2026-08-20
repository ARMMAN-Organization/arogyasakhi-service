#!/usr/bin/env node
/**
 * Call-Sheet Test Data Seeder
 *
 * Seeds test data for the call-sheet feature across services:
 * - visit_schedules (OPEN, MISSED, COMPLETED statuses)
 * - visit_instances (linked to schedules)
 * - risk_assessments (HIGH/CRITICAL for ANC and PP beneficiaries)
 * - risk_flags (with referral triggers)
 * - closures (PENDING status)
 * - call_logs (various statuses for testing FOLLOWUP_PENDING)
 *
 * Usage: node tools/seed-callsheet-data.js
 *
 * Idempotent: every row this script owns is keyed by a fixed seed marker
 * (local_*_uuid for tables that have one, a hardcoded id for risk_assessments/
 * risk_flags which don't). Each run deletes its own prior rows before
 * inserting fresh ones, so re-running never accumulates duplicates.
 *
 * All raw SQL is schema-qualified with `public.` — this DB's shared Supabase
 * pooler (pgbouncer, transaction pooling) has been observed leaking a stale
 * `search_path` from unrelated services onto reused backend connections, so
 * unqualified table names are not reliable here.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { PrismaClient: AuthPrisma } = require('../node_modules/.prisma/client-auth-service');
const { PrismaClient: VisitPrisma } = require('../node_modules/.prisma/client-visit-form-service');
const { PrismaClient: RiskPrisma } = require('../node_modules/.prisma/client-risk-referral-service');
const { PrismaClient: ClosurePrisma } = require('../node_modules/.prisma/client-closure-reopen-service');
const { PrismaClient: SupervisorPrisma } = require('../node_modules/.prisma/client-supervisor-operations-service');

const authPrisma = new AuthPrisma();
const visitPrisma = new VisitPrisma();
const riskPrisma = new RiskPrisma();
const closurePrisma = new ClosurePrisma();
const supervisorPrisma = new SupervisorPrisma();

// ── IDs (existing seed data) ────────────────────────────────────────────────
const MEERA_SAKHI_ID = 'fbb0fc7c-c67c-4447-9f36-0f1774b40924';
const MEERA_USER_ID = '972173c5-4fe9-4170-b092-11f68f6f3efc';
const PEMMA_USER_ID = 'bcd0b96a-c951-4052-b328-d0f5629cf30d';
const PROJECT_ID = '4b4084cf-d572-4020-9438-c82640275201';

const BENEFICIARIES = {
  anc1: '8879b3dd-7a28-4965-b191-2a08db18e7fb', // ANC, ACTIVE
  anc2: '9e7812cb-5448-41be-810a-19264b826963', // ANC, ACTIVE
  pp1: '935580b5-eba7-47b4-bc3f-52fac4a3a120', // PP, ACTIVE
  anc3: '868772dd-7817-4a91-a419-6bd5b2a14ffb', // ANC, ACTIVE
};

// Not FK-enforced (cross-service scalar, per the forklift rule) — kept as
// given even though it doesn't resolve to a row in rules-service's
// rule_versions table.
const RULE_VERSION_ID = '4d6d049d-be04-4515-a8c3-bb030744508d';
const RISK_CONDITION_ID = 'cf20ee77-948f-40d6-b046-7c1d9873f763'; // HYPERTENSION_HIGH_BP
const CLOSURE_REASON_LOOKUP_VALUE_ID = '11e1dc39-a87b-431f-8cfb-360e8df48e7f'; // MIGRATION

// Fixed ids for rows with no natural local-uuid column, so cleanup can target
// them precisely on every re-run (risk_assessments/risk_flags have no
// local_*_uuid marker to match on).
const RISK_ASSESSMENT_IDS = {
  anc1Critical: '77ba2bce-2961-425b-9a6e-d39e637f402b',
  anc2High: 'fc3b58d3-3e75-4469-a6b3-d01bac2812db',
  pp1High: '75a63efb-c8c7-4702-aefe-8dfeb2fd52aa',
};
const SUBMISSION_IDS = {
  anc1Critical: 'e543f4f7-da48-4b83-a625-f1a7ab54b7a3',
  anc2High: 'efd50ff3-a997-43c5-aa09-405cb2e620fc',
  pp1High: 'eeae7337-86e3-4f02-8d8c-9a4739369528',
};
const RISK_FLAG_IDS = {
  anc1Critical: '1d296b3a-b956-483a-b168-326c126efc7f',
  anc2High: '289899f2-317f-4337-bf8c-e24df9b6061a',
  pp1High: 'fcf56586-abef-4017-9566-e1dc550604fa',
};

const today = new Date();
const todayStr = today.toISOString().split('T')[0];
const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]; };
const daysFromNow = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]; };

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Cleanup ──────────────────────────────────────────────────────────────
// Hard-deletes (not soft-deletes) its own rows before re-inserting: the
// local_*_uuid columns and risk_assessment_id are unique/PK, so a
// soft-deleted row would still occupy that value and block the re-insert.
// Safe here because every row targeted is disposable seed fixture data,
// identified precisely by this script's own deterministic markers.
async function cleanup() {
  console.log('\n🧹 Cleaning up prior runs of this seed script...');

  await visitPrisma.$executeRaw`
    DELETE FROM public.visit_instances WHERE local_visit_uuid LIKE 'seed-cs-vi-%'
  `;
  await visitPrisma.$executeRaw`
    DELETE FROM public.visit_schedules WHERE local_schedule_uuid LIKE 'seed-cs-vs-%'
  `;
  await riskPrisma.$executeRaw`
    DELETE FROM public.risk_flags WHERE risk_assessment_id = ANY(${Object.values(RISK_ASSESSMENT_IDS)}::text[])
  `;
  await riskPrisma.$executeRaw`
    DELETE FROM public.risk_assessments WHERE risk_assessment_id = ANY(${Object.values(RISK_ASSESSMENT_IDS)}::text[])
  `;
  await closurePrisma.$executeRaw`
    DELETE FROM public.closures WHERE local_closure_uuid LIKE 'seed-cs-closure-%'
  `;
  console.log('   ✅ Cleanup complete');
}

// ── 1. Visit Schedules ─────────────────────────────────────────────────────
async function seedVisitSchedules() {
  console.log('\n📅 Seeding visit_schedules...');

  const schedules = [
    {
      schedule_id: uuid(),
      local_schedule_uuid: 'seed-cs-vs-anc1-today',
      beneficiary_id: BENEFICIARIES.anc1,
      visit_code: 'ANC2',
      visit_type: 'ANC',
      sequence_no: 2,
      scheduled_date: todayStr,
      window_start_date: daysAgo(3),
      window_end_date: daysFromNow(3),
      anchor_type: 'REGISTRATION',
      status: 'OPEN',
    },
    {
      schedule_id: uuid(),
      local_schedule_uuid: 'seed-cs-vs-anc1-expire',
      beneficiary_id: BENEFICIARIES.anc1,
      visit_code: 'ANC3',
      visit_type: 'ANC',
      sequence_no: 3,
      scheduled_date: daysFromNow(2),
      window_start_date: daysFromNow(1),
      window_end_date: daysFromNow(3),
      anchor_type: 'ACTUAL_VISIT',
      status: 'OPEN',
    },
    {
      schedule_id: uuid(),
      local_schedule_uuid: 'seed-cs-vs-anc2-missed',
      beneficiary_id: BENEFICIARIES.anc2,
      visit_code: 'ANC2',
      visit_type: 'ANC',
      sequence_no: 2,
      scheduled_date: daysAgo(10),
      window_start_date: daysAgo(13),
      window_end_date: daysAgo(7),
      anchor_type: 'REGISTRATION',
      status: 'MISSED',
    },
    {
      schedule_id: uuid(),
      local_schedule_uuid: 'seed-cs-vs-pp1-completed',
      beneficiary_id: BENEFICIARIES.pp1,
      visit_code: 'PP1',
      visit_type: 'PP',
      sequence_no: 1,
      scheduled_date: daysAgo(5),
      window_start_date: daysAgo(8),
      window_end_date: daysAgo(2),
      anchor_type: 'DELIVERY_DATE',
      status: 'COMPLETED',
    },
    {
      schedule_id: uuid(),
      local_schedule_uuid: 'seed-cs-vs-pp1-today',
      beneficiary_id: BENEFICIARIES.pp1,
      visit_code: 'PP2',
      visit_type: 'PP',
      sequence_no: 2,
      scheduled_date: todayStr,
      window_start_date: daysAgo(3),
      window_end_date: daysFromNow(3),
      anchor_type: 'ACTUAL_VISIT',
      status: 'OPEN',
    },
  ];

  for (const s of schedules) {
    await visitPrisma.$executeRaw`
      INSERT INTO public.visit_schedules (schedule_id, local_schedule_uuid, beneficiary_id, visit_code, visit_type, sequence_no, scheduled_date, window_start_date, window_end_date, anchor_type, generated_by_rule_version_id, status, created_at, created_by_user_id, updated_at, updated_by_user_id, is_deleted)
      VALUES (${s.schedule_id}, ${s.local_schedule_uuid}, ${s.beneficiary_id}, ${s.visit_code}, ${s.visit_type}::public."VisitCodeType", ${s.sequence_no}, ${s.scheduled_date}::date, ${s.window_start_date}::date, ${s.window_end_date}::date, ${s.anchor_type}::public."AnchorType", ${RULE_VERSION_ID}, ${s.status}::public."VisitScheduleStatus", NOW(), ${MEERA_USER_ID}, NOW(), ${MEERA_USER_ID}, false)
    `;
  }
  console.log(`   ✅ Inserted ${schedules.length} visit schedules`);
  return schedules;
}

// ── 2. Visit Instances ──────────────────────────────────────────────────────
async function seedVisitInstances(schedules) {
  console.log('\n🏥 Seeding visit_instances...');

  const completedSchedule = schedules.find((s) => s.status === 'COMPLETED');
  const missedSchedule = schedules.find((s) => s.status === 'MISSED');

  const instances = [
    {
      visit_id: uuid(),
      schedule_id: completedSchedule.schedule_id,
      beneficiary_id: completedSchedule.beneficiary_id,
      local_visit_uuid: 'seed-cs-vi-pp1-completed',
      actual_visit_date: completedSchedule.scheduled_date,
      status_code: 'COMPLETED',
      meet_beneficiary_flag: true,
      completed_at: `${completedSchedule.scheduled_date}T10:00:00.000Z`,
    },
    {
      visit_id: uuid(),
      schedule_id: missedSchedule.schedule_id,
      beneficiary_id: missedSchedule.beneficiary_id,
      local_visit_uuid: 'seed-cs-vi-anc2-missed',
      actual_visit_date: null,
      status_code: 'MISSED',
      meet_beneficiary_flag: null,
      completed_at: null,
    },
  ];

  for (const i of instances) {
    await visitPrisma.$executeRaw`
      INSERT INTO public.visit_instances (visit_id, schedule_id, beneficiary_id, sakhi_id, local_visit_uuid, actual_visit_date, status_code, meet_beneficiary_flag, completed_at, created_at, created_by_user_id, updated_at, updated_by_user_id, is_deleted)
      VALUES (${i.visit_id}, ${i.schedule_id}, ${i.beneficiary_id}, ${MEERA_SAKHI_ID}, ${i.local_visit_uuid}, ${i.actual_visit_date}::date, ${i.status_code}, ${i.meet_beneficiary_flag}, ${i.completed_at}::timestamptz, NOW(), ${MEERA_USER_ID}, NOW(), ${MEERA_USER_ID}, false)
    `;
  }
  console.log(`   ✅ Inserted ${instances.length} visit instances`);
}

// ── 3. Risk Assessments ─────────────────────────────────────────────────────
async function seedRiskAssessments() {
  console.log('\n⚠️  Seeding risk_assessments...');

  const assessments = [
    { key: 'anc1Critical', beneficiary_id: BENEFICIARIES.anc1, overall_risk_category: 'CRITICAL' },
    { key: 'anc2High', beneficiary_id: BENEFICIARIES.anc2, overall_risk_category: 'HIGH' },
    { key: 'pp1High', beneficiary_id: BENEFICIARIES.pp1, overall_risk_category: 'HIGH' },
  ];

  for (const a of assessments) {
    await riskPrisma.$executeRaw`
      INSERT INTO public.risk_assessments (risk_assessment_id, beneficiary_id, submission_id, rule_version_id, evaluated_at, overall_risk_category, overall_high_risk_flag, hr_detected_flag, created_at, updated_at, is_deleted)
      VALUES (${RISK_ASSESSMENT_IDS[a.key]}, ${a.beneficiary_id}, ${SUBMISSION_IDS[a.key]}, ${RULE_VERSION_ID}, NOW(), ${a.overall_risk_category}::public."OverallRiskCategory", true, true, NOW(), NOW(), false)
    `;
  }
  console.log(`   ✅ Inserted ${assessments.length} risk assessments`);
  return assessments;
}

// ── 4. Risk Flags ───────────────────────────────────────────────────────────
async function seedRiskFlags(assessments) {
  console.log('\n🚩 Seeding risk_flags...');

  const gradeLookup = await authPrisma.$queryRaw`
    SELECT lv.lookup_value_id
    FROM public.lookup_values lv
    JOIN public.lookup_categories lc ON lv.lookup_category_id = lc.lookup_category_id
    WHERE lc.category_code = 'RISK_GRADE' AND lv.value_code = 'SEVERE'
    LIMIT 1
  `;
  if (gradeLookup.length === 0) {
    throw new Error("No lookup_values row for category RISK_GRADE / value_code SEVERE");
  }
  const riskGradeLookupId = gradeLookup[0].lookup_value_id;

  for (const a of assessments) {
    await riskPrisma.$executeRaw`
      INSERT INTO public.risk_flags (risk_flag_id, risk_assessment_id, risk_condition_id, risk_grade_lookup_value_id, observed_value_json, is_referral_trigger, is_education_trigger, is_hr_visit_trigger, created_at, updated_at)
      VALUES (${RISK_FLAG_IDS[a.key]}, ${RISK_ASSESSMENT_IDS[a.key]}, ${RISK_CONDITION_ID}, ${riskGradeLookupId}, ${JSON.stringify({ value: 'high', source: 'seed' })}::jsonb, true, false, true, NOW(), NOW())
    `;
  }
  console.log(`   ✅ Inserted ${assessments.length} risk flags`);
}

// ── 5. Closures ─────────────────────────────────────────────────────────────
async function seedClosures() {
  console.log('\n🔒 Seeding closures...');

  const closures = [
    {
      closure_id: uuid(),
      beneficiary_id: BENEFICIARIES.pp1,
      closure_type: 'NON_MEDICAL',
      local_closure_uuid: 'seed-cs-closure-pp1-pending',
    },
    {
      closure_id: uuid(),
      beneficiary_id: BENEFICIARIES.anc3,
      closure_type: 'MEDICAL',
      local_closure_uuid: 'seed-cs-closure-anc3-pending',
    },
  ];

  for (const c of closures) {
    await closurePrisma.$executeRaw`
      INSERT INTO public.closures (closure_id, beneficiary_id, closure_type, closure_reason_lookup_value_id, closure_date, submitted_by_user_id, supervisor_status, local_closure_uuid, created_at, updated_at, is_deleted)
      VALUES (${c.closure_id}, ${c.beneficiary_id}, ${c.closure_type}::public."ClosureType", ${CLOSURE_REASON_LOOKUP_VALUE_ID}, ${todayStr}::date, ${MEERA_USER_ID}, 'PENDING'::public."ClosureSupervisorStatus", ${c.local_closure_uuid}, NOW(), NOW(), false)
    `;
  }
  console.log(`   ✅ Inserted ${closures.length} closures`);
}

// ── 6. Call Logs ────────────────────────────────────────────────────────────
async function seedCallLogs() {
  console.log('\n📞 Seeding call_logs...');

  await supervisorPrisma.$executeRaw`
    UPDATE public.call_logs SET is_deleted = true, deleted_at = NOW(), updated_at = NOW()
    WHERE sakhi_id = ${MEERA_SAKHI_ID} AND is_deleted = false
  `;

  const callLogs = [
    {
      call_log_id: uuid(),
      call_datetime: `${daysAgo(5)}T09:00:00.000Z`,
      call_status: 'PICKED_UP_TALKED',
      call_end_at: `${daysAgo(5)}T09:15:00.000Z`,
      call_duration_seconds: 900,
      notes: 'Discussed ANC visit schedule. Patient is doing well.',
      followup_action: null,
      responder: 'SAKHI',
    },
    {
      call_log_id: uuid(),
      call_datetime: `${daysAgo(3)}T10:00:00.000Z`,
      call_status: 'PICKED_UP_NO_ONE_TALKING',
      call_end_at: `${daysAgo(3)}T10:02:00.000Z`,
      call_duration_seconds: 120,
      notes: null,
      followup_action: null,
      responder: null,
    },
    {
      call_log_id: uuid(),
      call_datetime: `${daysAgo(2)}T11:00:00.000Z`,
      call_status: 'NOT_PICKED_UP',
      call_end_at: null,
      call_duration_seconds: null,
      notes: null,
      followup_action: null,
      responder: null,
    },
    {
      call_log_id: uuid(),
      call_datetime: `${daysAgo(1)}T14:00:00.000Z`,
      call_status: 'PICKED_UP_CUT_MIDWAY',
      call_end_at: `${daysAgo(1)}T14:01:30.000Z`,
      call_duration_seconds: 90,
      notes: 'Call dropped due to network issues.',
      followup_action: null,
      responder: 'SAKHI',
    },
    {
      call_log_id: uuid(),
      call_datetime: `${todayStr}T07:30:00.000Z`,
      call_status: 'CALL_BACK',
      call_end_at: null,
      call_duration_seconds: null,
      notes: 'Sakhi mentioned pending referral follow-up needed.',
      followup_action: 'Call back after referral appointment',
      responder: 'SAKHI',
    },
  ];

  for (const c of callLogs) {
    await supervisorPrisma.$executeRaw`
      INSERT INTO public.call_logs (call_log_id, project_id, supervisor_id, sakhi_id, call_datetime, call_status, call_start_at, call_end_at, call_duration_seconds, notes, followup_action, responder, created_at, created_by_user_id, updated_at, updated_by_user_id, is_deleted)
      VALUES (${c.call_log_id}, ${PROJECT_ID}, ${PEMMA_USER_ID}, ${MEERA_SAKHI_ID}, ${c.call_datetime}::timestamptz, ${c.call_status}::public."CallStatus", ${c.call_datetime}::timestamptz, ${c.call_end_at}::timestamptz, ${c.call_duration_seconds}, ${c.notes}, ${c.followup_action}, ${c.responder}::public."Responder", NOW(), ${PEMMA_USER_ID}, NOW(), ${PEMMA_USER_ID}, false)
    `;
  }
  console.log(`   ✅ Inserted ${callLogs.length} call logs`);
}

// ── Verification ─────────────────────────────────────────────────────────
// Reports what THIS script created (matched by its own seed markers), not a
// simulation of the 6 stat kinds' future query logic — that logic isn't
// implemented yet, and guessing at it here would risk stating the wrong
// filter rules as if they were confirmed behavior.
async function verify() {
  const [schedules] = await visitPrisma.$queryRaw`
    SELECT count(*)::int AS n FROM public.visit_schedules WHERE local_schedule_uuid LIKE 'seed-cs-vs-%'
  `;
  const [instances] = await visitPrisma.$queryRaw`
    SELECT count(*)::int AS n FROM public.visit_instances WHERE local_visit_uuid LIKE 'seed-cs-vi-%'
  `;
  const [assessments] = await riskPrisma.$queryRaw`
    SELECT count(*)::int AS n FROM public.risk_assessments WHERE risk_assessment_id = ANY(${Object.values(RISK_ASSESSMENT_IDS)}::text[])
  `;
  const [flags] = await riskPrisma.$queryRaw`
    SELECT count(*)::int AS n FROM public.risk_flags WHERE risk_assessment_id = ANY(${Object.values(RISK_ASSESSMENT_IDS)}::text[])
  `;
  const [closures] = await closurePrisma.$queryRaw`
    SELECT count(*)::int AS n FROM public.closures WHERE local_closure_uuid LIKE 'seed-cs-closure-%'
  `;
  const [followup] = await supervisorPrisma.$queryRaw`
    SELECT call_status FROM public.call_logs
    WHERE sakhi_id = ${MEERA_SAKHI_ID} AND is_deleted = false
    ORDER BY call_datetime DESC LIMIT 1
  `;

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Seed fixtures now in place for meera.sakhi');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  visit_schedules (this script)   : ${schedules.n} (expected 5)`);
  console.log(`  visit_instances (this script)   : ${instances.n} (expected 2)`);
  console.log(`  risk_assessments (this script)  : ${assessments.n} (expected 3)`);
  console.log(`  risk_flags (this script)        : ${flags.n} (expected 3)`);
  console.log(`  closures (this script)          : ${closures.n} (expected 2)`);
  console.log(`  call_logs latest call_status    : ${followup ? followup.call_status : 'none'} (expected CALL_BACK)`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Call-sheet stat kinds:');
  console.log('  FOLLOWUP_PENDING is the only one the API reads today — it');
  console.log(`  resolves to ${followup && followup.call_status === 'CALL_BACK' ? 1 : 0} for meera.sakhi from the call_logs row above.`);
  console.log('  The other 6 kinds (VISIT_DUE, VISIT_3_DAYS_TO_EXPIRE,');
  console.log('  MISSED_VISIT, CLOSURE_FORM_PENDING, HIGH_RISK_ANC,');
  console.log('  HIGH_RISK_PNC) are still hardcoded placeholders returning');
  console.log('  count: 0 — the fixtures above are in place for whoever');
  console.log('  implements their real query logic next.');
  console.log('═══════════════════════════════════════════════════════════');
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Call-Sheet Test Data Seeder');
  console.log(`  Sakhi: meera.sakhi (${MEERA_SAKHI_ID})  Date: ${todayStr}`);
  console.log('═══════════════════════════════════════════════════════════');

  try {
    await cleanup();
    const schedules = await seedVisitSchedules();
    await seedVisitInstances(schedules);
    const assessments = await seedRiskAssessments();
    await seedRiskFlags(assessments);
    await seedClosures();
    await seedCallLogs();
    await verify();
  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    process.exit(1);
  } finally {
    await authPrisma.$disconnect();
    await visitPrisma.$disconnect();
    await riskPrisma.$disconnect();
    await closurePrisma.$disconnect();
    await supervisorPrisma.$disconnect();
  }
}

main();
