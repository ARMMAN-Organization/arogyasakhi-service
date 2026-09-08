import type { AnalyticsEventRepository } from './analyticsEvent.repository';
import type {
  AnalyticsEventInput,
  CreateAnalyticsEventBatchInput,
} from './dto/create-analytics-event.dto';
import type { ListAnalyticsEventsQueryInput } from './dto/list-analytics-events-query.dto';

/** Shape returned by {@link AnalyticsEventRepository.findByLocalEventUuid}. */
type ExistingAnalyticsEvent = Awaited<ReturnType<AnalyticsEventRepository['findByLocalEventUuid']>>;

/**
 * Prisma unique-constraint violation code (P2002), scoped to `columnName`
 * specifically — not just any P2002. Same fix as auditLog.service.ts's
 * identical copy (added after the 2026-09-02 security review finding that an
 * unscoped check would silently misreport an unrelated collision as an
 * idempotent replay of this one). Not cross-service-imported per the
 * forklift rule.
 */
function isUniqueConstraintViolation(err: unknown, columnName: string): boolean {
  if (typeof err !== 'object' || err === null || !('code' in err)) return false;
  if ((err as { code: unknown }).code !== 'P2002') return false;
  const meta = (err as { meta?: unknown }).meta;
  if (typeof meta !== 'object' || meta === null || !('target' in meta)) return false;
  const target = (meta as { target?: unknown }).target;
  return Array.isArray(target) ? target.includes(columnName) : target === columnName;
}

/**
 * Verifies a row found by localEventUuid genuinely is a retry of `toCreate`,
 * not an unrelated event that happens to share the client-supplied UUID —
 * localEventUuid is client-generated and globally unique across ALL callers,
 * so a UUID match alone isn't enough to treat it as this caller's own retry
 * (same cross-actor IDOR concern as auditLog.service.ts's
 * isSameLogicalEntry). payloadJson is deliberately excluded from the
 * comparison: it may legitimately be recomputed slightly differently between
 * retries of the same logical event.
 */
function isSameLogicalEvent(
  existing: ExistingAnalyticsEvent,
  toCreate: AnalyticsEventInput,
): boolean {
  return (
    existing !== null &&
    existing.featureArea === toCreate.featureArea &&
    existing.eventName === toCreate.eventName &&
    existing.occurredAt.toISOString() === toCreate.occurredAt
  );
}

export interface AnalyticsEventBatchResult {
  created: number;
  failed: { index: number; localEventUuid?: string; message: string }[];
}

/**
 * Analytics-event domain logic. Data access is delegated to the repository.
 *
 * This service captures RAW events only (SRS Section 9) — it does not
 * compute the metrics themselves (drop-off rate, completion time, etc.);
 * those are derived later by the reporting ETL reading this table. It also
 * does not enforce Sec 9.9's "exclude test data" rule — that filtering
 * happens at query/ETL time (a plain WHERE clause against auth-service's
 * project/user test-flag), not at ingestion, so this table stays an
 * unfiltered raw log usable for reprocessing if the test-flag rules change.
 */
export class AnalyticsEventService {
  constructor(private readonly repository: AnalyticsEventRepository) {}

  /**
   * Persists one batch of client-emitted events, one at a time — partial
   * success by design (product decision, not an SRS requirement): a single
   * malformed event in a batch of many must not force the caller to
   * re-upload every other valid event in the same sync. Each event's own
   * localEventUuid is treated as an independent idempotency key, same retry
   * semantics as audit-service's own AuditLogService.create — a duplicate
   * upload of an already-persisted event returns that success silently
   * rather than erroring, and a concurrent retry racing on the same
   * localEventUuid is caught by the column's own unique constraint and
   * resolved the same way as a sequential retry.
   */
  async createBatch(
    sakhiUserId: string,
    dto: CreateAnalyticsEventBatchInput,
  ): Promise<AnalyticsEventBatchResult> {
    const result: AnalyticsEventBatchResult = { created: 0, failed: [] };

    for (const [index, event] of dto.events.entries()) {
      try {
        await this.createOne(sakhiUserId, event);
        result.created += 1;
      } catch (err) {
        result.failed.push({
          index,
          localEventUuid: event.localEventUuid,
          message: err instanceof Error ? err.message : 'Unknown error persisting this event.',
        });
      }
    }

    return result;
  }

  /**
   * Cursor-paginated read for reporting-etl-service's metric-aggregation
   * job — see AnalyticsEventRepository.findByFeatureAreaAndWindow's doc
   * comment for scoping details.
   */
  list(query: ListAnalyticsEventsQueryInput) {
    return this.repository.findByFeatureAreaAndWindow(
      query.featureArea,
      new Date(query.since),
      new Date(query.until),
      query.limit,
      query.cursor,
    );
  }

  private async createOne(sakhiUserId: string, event: AnalyticsEventInput): Promise<void> {
    if (event.localEventUuid) {
      const existing = await this.repository.findByLocalEventUuid(event.localEventUuid);
      if (existing) {
        if (!isSameLogicalEvent(existing, event)) {
          throw new Error(
            'This localEventUuid is already used by a different analytics event — likely a UUID collision, not a retry.',
          );
        }
        return;
      }
    }

    try {
      // deviceId is not yet part of the batch payload — no header/body
      // convention for it exists elsewhere in this codebase to follow, and
      // it isn't required by SRS Section 9's metric definitions. Add it
      // (and a matching DTO field) if a later metric needs per-device
      // breakdown rather than per-Sakhi.
      await this.repository.create(sakhiUserId, null, event);
    } catch (err) {
      if (event.localEventUuid && isUniqueConstraintViolation(err, 'local_event_uuid')) {
        const winner = await this.repository.findByLocalEventUuid(event.localEventUuid);
        if (winner && isSameLogicalEvent(winner, event)) {
          return;
        }
        throw new Error(
          'This localEventUuid is already used by a different analytics event — likely a UUID collision, not a retry.',
        );
      }
      throw err;
    }
  }
}
