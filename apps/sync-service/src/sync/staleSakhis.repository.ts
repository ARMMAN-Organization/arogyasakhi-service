import { Prisma } from '../../../../node_modules/.prisma/client-sync-service';
import type { PrismaService } from '../prisma/prisma.service';

/** One stale Sakhi row — a userId whose most recent sync batch is older than the threshold. */
export interface StaleSakhi {
  userId: string;
  lastSyncAt: Date;
  daysSinceSync: number;
  pendingCount: number;
  failedCount: number;
}

interface StaleSakhiRow {
  user_id: string;
  last_sync_at: Date;
  days_since_sync: number;
  pending_count: bigint;
  failed_count: bigint;
}

/**
 * Data access for the stale-Sakhi roster view. Owns only this service's
 * `sync_batches`/`sync_items` tables — `userId` scoping (the caller's
 * roster) is passed in rather than looked up here, since the roster itself
 * lives in auth-service (forklift rule: no cross-service joins).
 */
export class StaleSakhisRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * For each `userId` in `roster`, takes `MAX(started_at)` across their
   * non-deleted sync batches as `lastSyncAt`, keeps only those at least
   * `days` old, and joins in QUEUED/FAILED counts from `sync_items` across
   * all of that user's batches. A `userId` with no non-deleted batches at
   * all has no row to aggregate and is excluded.
   */
  async findStale(roster: string[], days: number): Promise<StaleSakhi[]> {
    if (roster.length === 0) return [];

    const rows = await this.prisma.$queryRaw<StaleSakhiRow[]>(Prisma.sql`
      SELECT
        b.user_id AS user_id,
        MAX(b.started_at) AS last_sync_at,
        EXTRACT(DAY FROM now() - MAX(b.started_at))::int AS days_since_sync,
        COUNT(*) FILTER (WHERE i.status = 'QUEUED') AS pending_count,
        COUNT(*) FILTER (WHERE i.status = 'FAILED') AS failed_count
      FROM sync_batches b
      LEFT JOIN sync_items i ON i.sync_batch_id = b.sync_batch_id AND i.is_deleted = false
      WHERE b.is_deleted = false
        AND b.user_id IN (${Prisma.join(roster)})
      GROUP BY b.user_id
      HAVING now() - MAX(b.started_at) >= (${days} * INTERVAL '1 day')
      ORDER BY MAX(b.started_at) ASC
    `);

    return rows.map((row) => ({
      userId: row.user_id,
      lastSyncAt: row.last_sync_at,
      daysSinceSync: row.days_since_sync,
      pendingCount: Number(row.pending_count),
      failedCount: Number(row.failed_count),
    }));
  }
}
