import { badRequest } from '@armman/service-commons';
import type { EscalationRepository } from './escalation.repository';
import type { ListEscalationEventsInput } from './dto/list-escalation-events.dto';

/** The 10 EscalationType values that Quick Response groups under one MISSED_VISIT card. */
const MISSED_VISIT_TYPES = new Set([
  'ANC_2_MISSED',
  'ANC_HR_MISSED',
  'PP_MISSED',
  'PP_HR_MISSED',
  'NN_MISSED',
  'NN_HR_MISSED',
  'INC_2_MISSED',
  'INC_HR_MISSED',
  'CCV_MISSED',
  'CCV_HR_MISSED',
]);

/** Quick Response's fixed card type for an escalation row — everything else in
 * EscalationType that isn't one of the 8 supported card types is omitted from
 * the response rather than surfaced under an unsupported label. */
function toCardType(escalationType: string): 'MISSED_VISIT' | 'EDD_NEARING' | null {
  if (MISSED_VISIT_TYPES.has(escalationType)) return 'MISSED_VISIT';
  if (escalationType === 'EDD_NEARING') return 'EDD_NEARING';
  return null;
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    throw badRequest('cursor: Invalid cursor.');
  }
  const [createdAtIso, id] = decoded.split('|');
  const createdAt = createdAtIso ? new Date(createdAtIso) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime()) || !id) {
    throw badRequest('cursor: Invalid cursor.');
  }
  return { createdAt, id };
}

function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`, 'utf8').toString('base64url');
}

/** Escalation event domain logic. Data access is delegated to the repository. */
export class EscalationService {
  constructor(private readonly repository: EscalationRepository) {}

  async list(query: ListEscalationEventsInput) {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.repository.findMany(query, cursor);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? encodeCursor(page[page.length - 1]) : null;

    const cards = page
      .map((row) => ({ row, cardType: toCardType(row.escalationType) }))
      .filter(
        (r): r is { row: (typeof page)[number]; cardType: 'MISSED_VISIT' | 'EDD_NEARING' } =>
          r.cardType !== null,
      )
      .map(({ row, cardType }) => ({
        cardId: row.id,
        cardType,
        cardSource: 'escalation_events' as const,
        beneficiaryId: row.beneficiaryId,
        visitId: row.visitId,
        referralId: row.referralId,
        escalationType: row.escalationType,
        status: row.status,
        raisedAt: row.createdAt.toISOString(),
      }));

    return { cards, nextCursor };
  }
}
