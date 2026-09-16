import type { PrismaService } from '../prisma/prisma.service';
import type {
  HealthEducationMediaStrapiClient,
  StrapiHealthEducationMedia,
} from './healthEducationMedia.strapiClient';

interface SkippedItem {
  slug: string | null;
  reason: string;
}

export interface HealthEducationMediaSyncSummary {
  entriesResolved: number;
  messagesUpdated: number;
  skipped: SkippedItem[];
}

/**
 * Manual, admin-triggered sync of health-education media from Strapi into
 * HealthEducationMessage.mediaResolvedUrl — same pattern as
 * LearnMoreSyncService, adapted for a flat media list rather than a
 * Section/Topic tree (HealthEducationMessage has no equivalent grouping).
 * Not automatic — no cron or webhook trigger exists yet.
 *
 * Matches each Strapi entry's `slug` against HealthEducationMessage.mediaFile
 * verbatim (an ARMMAN-authored content decision, not a convention invented
 * here) via `updateMany` — mediaFile is not unique, so more than one message
 * row can share the same media (e.g. two conditions pointing at the same
 * video) and all matching rows are updated together. An entry whose slug
 * matches no mediaFile value, or a slug-less entry, is skipped and reported,
 * never guessed at.
 */
export class HealthEducationMediaSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly strapiClient: HealthEducationMediaStrapiClient,
  ) {}

  async sync(): Promise<HealthEducationMediaSyncSummary> {
    const entries = await this.strapiClient.fetchMediaEntries();
    const skipped: SkippedItem[] = [];
    let entriesResolved = 0;
    let messagesUpdated = 0;

    for (const entry of entries) {
      const result = await this.syncEntry(entry);
      if (result.skipped) {
        skipped.push(result.skipped);
      } else {
        entriesResolved += 1;
        messagesUpdated += result.updatedCount ?? 0;
      }
    }

    return { entriesResolved, messagesUpdated, skipped };
  }

  private async syncEntry(
    entry: StrapiHealthEducationMedia,
  ): Promise<{ skipped?: SkippedItem; updatedCount?: number }> {
    if (!entry.slug) {
      return { skipped: { slug: null, reason: 'missing slug' } };
    }
    if (!entry.mediaFile) {
      return { skipped: { slug: entry.slug, reason: 'no mediaFile uploaded in Strapi' } };
    }

    const resolvedUrl = this.strapiClient.resolveMediaUrl(entry.mediaFile.url);

    const result = await this.prisma.healthEducationMessage.updateMany({
      where: { mediaFile: entry.slug, isDeleted: false },
      data: { mediaResolvedUrl: resolvedUrl },
    });

    if (result.count === 0) {
      return {
        skipped: {
          slug: entry.slug,
          reason: 'no HealthEducationMessage row has this mediaFile value',
        },
      };
    }

    return { updatedCount: result.count };
  }
}
