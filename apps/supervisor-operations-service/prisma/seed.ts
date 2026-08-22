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

// --- Supervisor-app QA fixture: 5 supervisor↔sakhi pairs (arun/lakshmi,
// suresh/nithya, deepak/sandhya, vijay/revathi, manoj/shobana), separate from
// the Pemma/Meera demo pair above. Reuses the exact ids already created via
// the live API this session, so re-running against that database is a no-op.

const SUPERVISOR_APP_PROJECT_ID = '4b4084cf-d572-4020-9438-c82640275201';

const SUPERVISOR_APP_PAIRS: { supervisorId: string; sakhiId: string; label: string }[] = [
  {
    supervisorId: '742e8dfe-984c-4c9f-af24-c3dacffecac4',
    sakhiId: '3df86ec1-8115-4db9-b558-a091f15b5a99',
    label: 'lakshmi',
  },
  {
    supervisorId: '40f6e942-2101-426b-9251-947e7db9f869',
    sakhiId: '9252ff42-6904-4005-9184-14cbbb75e84b',
    label: 'nithya',
  },
  {
    supervisorId: '55cdb187-12e5-475f-902c-c4bf50d4e220',
    sakhiId: 'f84745fd-f105-40d9-bbf0-9127b3948112',
    label: 'sandhya',
  },
  {
    supervisorId: '6242e4ae-19c8-4a4b-b7ca-63768fff1615',
    sakhiId: '079bd637-01a7-45f1-9216-fa819b736e54',
    label: 'revathi',
  },
  {
    supervisorId: '23002b65-40c3-45e2-9c6d-76d1c42b0053',
    sakhiId: '63407922-ecb4-4812-be4e-4567938bfb20',
    label: 'shobana',
  },
];

/** 6 call logs per pair, cycling the full callStatus enum; one CALL_BACK per
 * sakhi with no followupAction, driving the Followup Pending drill-down. */
async function seedSupervisorAppCallLogs(): Promise<SeedResult> {
  const statuses: (typeof DEFAULT_CALLS)[number]['callStatus'][] = [
    'PICKED_UP_TALKED',
    'PICKED_UP_NO_ONE_TALKING',
    'NOT_PICKED_UP',
    'CALL_BACK',
    'RINGING',
    'PHONE_OFF',
  ];

  let created = 0;
  let skipped = 0;
  for (const pair of SUPERVISOR_APP_PAIRS) {
    for (let i = 0; i < statuses.length; i++) {
      const callDatetime = new Date(`2026-08-${10 + i}T10:00:00.000Z`);
      const existing = await prisma.callLog.findFirst({
        where: { sakhiId: pair.sakhiId, callDatetime },
      });
      if (existing) {
        skipped += 1;
        continue;
      }
      await prisma.callLog.create({
        data: {
          projectId: SUPERVISOR_APP_PROJECT_ID,
          supervisorId: pair.supervisorId,
          sakhiId: pair.sakhiId,
          callDatetime,
          callStatus: statuses[i],
          callStartAt: callDatetime,
          callEndAt:
            statuses[i] === 'CALL_BACK' ? undefined : new Date(callDatetime.getTime() + 5 * 60_000),
          responder: 'SAKHI',
        },
      });
      created += 1;
    }
  }

  return {
    step: 'supervisor-app-call-logs',
    created: created > 0,
    message: `Created ${created} call log(s), skipped ${skipped} already-seeded row(s).`,
  };
}

const INVENTORY_CATALOG: {
  itemCode: string;
  itemName: string;
  itemCategory: 'CONSUMABLE' | 'INSTRUMENT';
  unit: string;
}[] = [
  { itemCode: 'CONS-PENCIL-01', itemName: 'Pencil', itemCategory: 'CONSUMABLE', unit: 'pcs' },
  { itemCode: 'CONS-CELLS-01', itemName: 'Cells', itemCategory: 'CONSUMABLE', unit: 'pcs' },
  {
    itemCode: 'CONS-SUGARSTRIP-01',
    itemName: 'Sugar Strips',
    itemCategory: 'CONSUMABLE',
    unit: 'pcs',
  },
  { itemCode: 'CONS-HBSTRIP-01', itemName: 'HB Strips', itemCategory: 'CONSUMABLE', unit: 'pcs' },
  {
    itemCode: 'INST-DOPPLER-01',
    itemName: 'Doppler Test Kit',
    itemCategory: 'INSTRUMENT',
    unit: 'pcs',
  },
  {
    itemCode: 'INST-BPMONITOR-01',
    itemName: 'BP Monitor',
    itemCategory: 'INSTRUMENT',
    unit: 'pcs',
  },
  {
    itemCode: 'INST-WEIGHSCALE-01',
    itemName: 'Weighing Scale',
    itemCategory: 'INSTRUMENT',
    unit: 'pcs',
  },
];

async function seedInventoryCatalog(): Promise<SeedResult> {
  let created = 0;
  for (const item of INVENTORY_CATALOG) {
    const existing = await prisma.inventoryItem.findUnique({ where: { itemCode: item.itemCode } });
    if (existing) continue;
    await prisma.inventoryItem.create({ data: { ...item, status: 'ACTIVE' } });
    created += 1;
  }
  return {
    step: 'inventory-catalog',
    created: created > 0,
    message: `Created ${created} inventory item(s), skipped ${INVENTORY_CATALOG.length - created} already-seeded row(s).`,
  };
}

/** 6 inventory transactions per sakhi (one per transactionType), each moving
 * a different catalog item, logged by that sakhi's supervisor. */
async function seedSupervisorAppInventoryTransactions(): Promise<SeedResult> {
  const transactionTypes: (
    'HANDOVER' | 'RETURNED' | 'PERMANENT_DAMAGED' | 'MISPLACED' | 'CONSUMED'
  )[] = ['HANDOVER', 'HANDOVER', 'CONSUMED', 'RETURNED', 'MISPLACED', 'PERMANENT_DAMAGED'];

  const items = await prisma.inventoryItem.findMany({
    where: { itemCode: { in: INVENTORY_CATALOG.map((i) => i.itemCode) } },
  });
  const itemByCode = new Map(items.map((i) => [i.itemCode, i.id]));
  const itemCodesInOrder = INVENTORY_CATALOG.slice(0, 6).map((i) => i.itemCode);

  let created = 0;
  let skipped = 0;
  for (const pair of SUPERVISOR_APP_PAIRS) {
    for (let i = 0; i < transactionTypes.length; i++) {
      const itemId = itemByCode.get(itemCodesInOrder[i]);
      if (!itemId) continue;
      const transactionDate = new Date(`2026-08-${10 + i}`);
      const existing = await prisma.inventoryTransaction.findFirst({
        where: {
          sakhiId: pair.sakhiId,
          itemId,
          transactionType: transactionTypes[i],
          transactionDate,
        },
      });
      if (existing) {
        skipped += 1;
        continue;
      }
      await prisma.inventoryTransaction.create({
        data: {
          projectId: SUPERVISOR_APP_PROJECT_ID,
          supervisorId: pair.supervisorId,
          sakhiId: pair.sakhiId,
          itemId,
          transactionType: transactionTypes[i],
          quantity: 1,
          transactionDate,
        },
      });
      created += 1;
    }
  }

  return {
    step: 'supervisor-app-inventory-transactions',
    created: created > 0,
    message: `Created ${created} inventory transaction(s), skipped ${skipped} already-seeded row(s).`,
  };
}

const TRAINING_TOPICS: { topicCode: string; topicName: string }[] = [
  { topicCode: 'ANC-BASICS', topicName: 'ANC Basics' },
  { topicCode: 'NUTRITION-101', topicName: 'Maternal Nutrition' },
];

async function seedTrainingTopics(): Promise<SeedResult> {
  let created = 0;
  for (const topic of TRAINING_TOPICS) {
    const existing = await prisma.trainingTopic.findUnique({
      where: { topicCode: topic.topicCode },
    });
    if (existing) continue;
    await prisma.trainingTopic.create({ data: { ...topic, status: 'ACTIVE' } });
    created += 1;
  }
  return {
    step: 'training-topics',
    created: created > 0,
    message: `Created ${created} training topic(s), skipped ${TRAINING_TOPICS.length - created} already-seeded row(s).`,
  };
}

/** Per supervisor: 1 MEETING event (+ attendance) and 1 TRAINING event (+
 * attendance, a gathering with both topics, gathering attendance, and PRE/POST
 * TopicMark scores on the first topic) for that supervisor's sakhi. */
async function seedSupervisorAppMeetings(): Promise<SeedResult> {
  const topics = await prisma.trainingTopic.findMany({
    where: { topicCode: { in: TRAINING_TOPICS.map((t) => t.topicCode) } },
  });
  const topicIds = topics.map((t) => t.id);
  const firstTopicId = topicIds[0];

  let created = 0;
  let skipped = 0;

  for (const pair of SUPERVISOR_APP_PAIRS) {
    const meetingRemarks = `Seeded MEETING event for ${pair.label}.sakhi`;
    let meeting = await prisma.supervisorEvent.findFirst({
      where: { supervisorId: pair.supervisorId, eventType: 'MEETING', remarks: meetingRemarks },
    });
    if (!meeting) {
      meeting = await prisma.supervisorEvent.create({
        data: {
          projectId: SUPERVISOR_APP_PROJECT_ID,
          supervisorId: pair.supervisorId,
          eventType: 'MEETING',
          eventDate: new Date('2026-08-25'),
          topicsJson: [],
          status: 'SCHEDULED',
          remarks: meetingRemarks,
        },
      });
      created += 1;
    } else {
      skipped += 1;
    }
    const meetingAttendance = await prisma.eventAttendance.findFirst({
      where: { eventId: meeting.id, sakhiId: pair.sakhiId },
    });
    if (!meetingAttendance) {
      await prisma.eventAttendance.create({
        data: { eventId: meeting.id, sakhiId: pair.sakhiId, attendanceStatus: 'PRESENT' },
      });
      created += 1;
    } else {
      skipped += 1;
    }

    const trainingRemarks = `Seeded TRAINING event for ${pair.label}.sakhi`;
    let training = await prisma.supervisorEvent.findFirst({
      where: { supervisorId: pair.supervisorId, eventType: 'TRAINING', remarks: trainingRemarks },
    });
    if (!training) {
      training = await prisma.supervisorEvent.create({
        data: {
          projectId: SUPERVISOR_APP_PROJECT_ID,
          supervisorId: pair.supervisorId,
          eventType: 'TRAINING',
          eventDate: new Date('2026-08-26'),
          topicsJson: [],
          status: 'SCHEDULED',
          remarks: trainingRemarks,
        },
      });
      created += 1;
    } else {
      skipped += 1;
    }
    const trainingAttendance = await prisma.eventAttendance.findFirst({
      where: { eventId: training.id, sakhiId: pair.sakhiId },
    });
    if (!trainingAttendance) {
      await prisma.eventAttendance.create({
        data: { eventId: training.id, sakhiId: pair.sakhiId, attendanceStatus: 'PRESENT' },
      });
      created += 1;
    } else {
      skipped += 1;
    }

    let gathering = await prisma.eventGathering.findFirst({ where: { eventId: training.id } });
    if (!gathering) {
      gathering = await prisma.eventGathering.create({
        data: { eventId: training.id, gatheringDate: new Date('2026-08-26') },
      });
      created += 1;
    } else {
      skipped += 1;
    }

    for (const topicId of topicIds) {
      const existingGatheringTopic = await prisma.gatheringTopic.findUnique({
        where: { gatheringId_topicId: { gatheringId: gathering.id, topicId } },
      });
      if (!existingGatheringTopic) {
        await prisma.gatheringTopic.create({ data: { gatheringId: gathering.id, topicId } });
        created += 1;
      } else {
        skipped += 1;
      }
    }

    const existingGatheringAttendance = await prisma.gatheringAttendance.findUnique({
      where: { gatheringId_sakhiId: { gatheringId: gathering.id, sakhiId: pair.sakhiId } },
    });
    if (!existingGatheringAttendance) {
      await prisma.gatheringAttendance.create({
        data: { gatheringId: gathering.id, sakhiId: pair.sakhiId, attendanceStatus: 'PRESENT' },
      });
      created += 1;
    } else {
      skipped += 1;
    }

    if (firstTopicId) {
      for (const [markType, score] of [
        ['PRE', 40],
        ['POST', 85],
      ] as const) {
        const existingMark = await prisma.topicMark.findUnique({
          where: {
            gatheringId_topicId_sakhiId_markType: {
              gatheringId: gathering.id,
              topicId: firstTopicId,
              sakhiId: pair.sakhiId,
              markType,
            },
          },
        });
        if (!existingMark) {
          await prisma.topicMark.create({
            data: {
              gatheringId: gathering.id,
              topicId: firstTopicId,
              sakhiId: pair.sakhiId,
              markType,
              score,
            },
          });
          created += 1;
        } else {
          skipped += 1;
        }
      }
    }
  }

  return {
    step: 'supervisor-app-meetings',
    created: created > 0,
    message: `Created ${created} meeting/training record(s), skipped ${skipped} already-seeded row(s).`,
  };
}

async function main(): Promise<void> {
  const results = [
    await seedCallLogs(),
    await seedSupervisorAppCallLogs(),
    await seedInventoryCatalog(),
    await seedSupervisorAppInventoryTransactions(),
    await seedTrainingTopics(),
    await seedSupervisorAppMeetings(),
  ];

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
