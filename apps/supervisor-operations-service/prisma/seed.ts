import { PrismaClient } from '../../../node_modules/.prisma/client-supervisor-operations-service';

const prisma = new PrismaClient();

interface SeedResult {
  step: string;
  created: boolean;
  message: string;
}

/**
 * Demo Call Sheet data (SRS FR-SV-3.1/3.2, ERD §4.7 call_logs) — all under
 * one Supervisor/Sakhi pair (Pemma Deshmukh / Meera Sakhi) already present
 * in this environment's auth-service data (see sakhi_profiles), so this
 * script needs no cross-service HTTP call to resolve ids (unlike
 * closure-reopen-service's own seed.ts, which raises a card via
 * approval-service). Not portable to a fresh environment with different
 * generated ids — override via SEED_CALL_LOG_PROJECT_ID /
 * SEED_CALL_LOG_SUPERVISOR_ID / SEED_CALL_LOG_SAKHI_ID / SEED_CALL_LOG_PAIRS
 * (JSON array of {supervisorId, sakhiId, ...}) if these defaults don't
 * resolve to real rows there; the create step below no-ops harmlessly
 * either way since projectId/supervisorId/sakhiId are plain scalar columns
 * (forklift rule — no FK enforced against another service's tables).
 *
 * Deduplicated by (sakhiId, callDatetime) — each row uses a fixed past
 * timestamp so re-running this script never creates duplicates.
 */
const DEFAULT_PROJECT_ID = '4b4084cf-d572-4020-9438-c82640275201';
const DEFAULT_SUPERVISOR_ID = 'bcd0b96a-c951-4052-b328-d0f5629cf30d'; // Pemma Deshmukh
const DEFAULT_SAKHI_ID = '972173c5-4fe9-4170-b092-11f68f6f3efc'; // Meera Sakhi

const DEFAULT_CALLS: {
  supervisorId: string;
  sakhiId: string;
  callDatetime: string;
  callStatus:
    | 'PICKED_UP_TALKED'
    | 'PICKED_UP_NO_ONE_TALKING'
    | 'PICKED_UP_CUT_MIDWAY'
    | 'CALL_BACK'
    | 'NOT_PICKED_UP'
    | 'RINGING'
    | 'PHONE_OFF'
    | 'OUT_OF_NETWORK';
  notes?: string;
  followupAction?: string;
  callStartAt: string;
  callEndAt?: string;
  callDurationSeconds?: number;
  responder?: 'RELATIVE' | 'HUSBAND' | 'SAKHI' | 'PERSON_WHO_DOES_NOT_KNOW_WOMAN';
}[] = [
  {
    supervisorId: DEFAULT_SUPERVISOR_ID,
    sakhiId: DEFAULT_SAKHI_ID,
    callDatetime: '2026-08-18T10:00:00.000Z',
    callStatus: 'PICKED_UP_TALKED',
    notes: 'Discussed pending ANC visits for two beneficiaries; app sync delay resolved.',
    followupAction: 'Check sync status again in 3 days.',
    callStartAt: '2026-08-18T10:00:00.000Z',
    callEndAt: '2026-08-18T10:06:40.000Z',
    callDurationSeconds: 400,
    responder: 'SAKHI',
  },
  {
    supervisorId: DEFAULT_SUPERVISOR_ID,
    sakhiId: DEFAULT_SAKHI_ID,
    callDatetime: '2026-08-19T11:30:00.000Z',
    callStatus: 'NOT_PICKED_UP',
    followupAction: 'Retry call tomorrow morning.',
    callStartAt: '2026-08-19T11:30:00.000Z',
  },
  {
    supervisorId: DEFAULT_SUPERVISOR_ID,
    sakhiId: DEFAULT_SAKHI_ID,
    callDatetime: '2026-08-19T15:15:00.000Z',
    callStatus: 'CALL_BACK',
    notes: 'Sakhi was in a home visit, asked to be called back after 5pm.',
    followupAction: 'Call back after 5pm today.',
    callStartAt: '2026-08-19T15:15:00.000Z',
    callEndAt: '2026-08-19T15:16:20.000Z',
    callDurationSeconds: 80,
  },
  {
    supervisorId: DEFAULT_SUPERVISOR_ID,
    sakhiId: DEFAULT_SAKHI_ID,
    callDatetime: '2026-08-20T09:00:00.000Z',
    callStatus: 'PICKED_UP_CUT_MIDWAY',
    notes: 'Call dropped after 2 minutes — poor network in the field.',
    followupAction: 'Reconnect and finish discussing the missed-visit escalation.',
    callStartAt: '2026-08-20T09:00:00.000Z',
    callEndAt: '2026-08-20T09:02:00.000Z',
    callDurationSeconds: 120,
    responder: 'SAKHI',
  },
  {
    supervisorId: DEFAULT_SUPERVISOR_ID,
    sakhiId: DEFAULT_SAKHI_ID,
    callDatetime: '2026-08-20T13:45:00.000Z',
    callStatus: 'PHONE_OFF',
    followupAction: 'Try again tomorrow; escalate to field visit if unreachable for 3 days.',
    callStartAt: '2026-08-20T13:45:00.000Z',
  },
  {
    supervisorId: DEFAULT_SUPERVISOR_ID,
    sakhiId: DEFAULT_SAKHI_ID,
    callDatetime: '2026-08-21T08:30:00.000Z',
    callStatus: 'PICKED_UP_TALKED',
    notes: 'Reviewed registration targets for the month; on track.',
    callStartAt: '2026-08-21T08:30:00.000Z',
    callEndAt: '2026-08-21T08:37:15.000Z',
    callDurationSeconds: 435,
    responder: 'SAKHI',
  },
];

async function seedCallLogs(): Promise<SeedResult> {
  const step = 'call-sheet-demo';
  const projectId = process.env.SEED_CALL_LOG_PROJECT_ID ?? DEFAULT_PROJECT_ID;
  const calls = process.env.SEED_CALL_LOG_PAIRS
    ? (JSON.parse(process.env.SEED_CALL_LOG_PAIRS) as typeof DEFAULT_CALLS)
    : DEFAULT_CALLS;

  let created = 0;
  let skipped = 0;
  for (const call of calls) {
    const existing = await prisma.callLog.findFirst({
      where: { sakhiId: call.sakhiId, callDatetime: new Date(call.callDatetime) },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.callLog.create({
      data: {
        projectId,
        supervisorId: call.supervisorId,
        sakhiId: call.sakhiId,
        callDatetime: new Date(call.callDatetime),
        callStatus: call.callStatus,
        notes: call.notes,
        followupAction: call.followupAction,
        callStartAt: new Date(call.callStartAt),
        callEndAt: call.callEndAt ? new Date(call.callEndAt) : undefined,
        callDurationSeconds: call.callDurationSeconds,
        responder: call.responder,
      },
    });
    created += 1;
  }

  return {
    step,
    created: created > 0,
    message: `Created ${created} call log(s), skipped ${skipped} already-seeded row(s).`,
  };
}

async function main(): Promise<void> {
  const results = [await seedCallLogs()];

  console.log('\nSeed summary:');
  for (const r of results) {
    console.log(`  [${r.created ? 'created' : 'skipped'}] ${r.step}: ${r.message}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
