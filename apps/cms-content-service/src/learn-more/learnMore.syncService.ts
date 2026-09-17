import type { PrismaService } from '../prisma/prisma.service';
import type { LearnMoreStrapiClient, StrapiTopic } from './learnMore.strapiClient';

const STRAPI_TO_DB_MEDIA_TYPE: Record<string, string> = {
  qna_text: 'QNA_TEXT',
  pdf: 'PDF',
  infographic: 'INFOGRAPHIC',
  gif: 'GIF',
  video: 'VIDEO',
  audio: 'AUDIO',
};

/** A media-backed type that must have a `mediaFile` uploaded in Strapi. */
const MEDIA_FILE_REQUIRED_TYPES = new Set(['pdf', 'infographic', 'gif', 'video', 'audio']);

interface SkippedItem {
  type: 'section' | 'topic';
  name: string;
  reason: string;
}

export interface SyncSummary {
  sectionsSynced: number;
  topicsSynced: number;
  skipped: SkippedItem[];
}

/**
 * Manual, admin-triggered sync of Learn More content from Strapi into this
 * service's own `learn_more_sections`/`learn_more_topics` tables (SRS
 * FR-S-13.1-13.4). Not automatic — no cron or webhook trigger exists yet;
 * see docs/test-runs/learn-more-strapi-sync-test-cases.md for the agreed
 * scope. Uses each Strapi entry's `slug` as the stable `sectionCode`/
 * `topicCode` — entries without a slug are skipped, not guessed at.
 */
export class LearnMoreSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly strapiClient: LearnMoreStrapiClient,
  ) {}

  async sync(): Promise<SyncSummary> {
    const sections = await this.strapiClient.fetchSections();
    const skipped: SkippedItem[] = [];
    let sectionsSynced = 0;
    let topicsSynced = 0;

    for (const section of sections) {
      if (!section.slug) {
        skipped.push({ type: 'section', name: section.name, reason: 'missing slug' });
        continue;
      }

      const dbSection = await this.prisma.learnMoreSection.upsert({
        where: { sectionCode: section.slug },
        create: {
          sectionCode: section.slug,
          sectionName: section.name,
          sortOrder: section.sortOrder ?? 0,
          status: 'ACTIVE',
        },
        update: {
          sectionName: section.name,
          sortOrder: section.sortOrder ?? 0,
        },
      });
      sectionsSynced += 1;

      for (const topic of section.topics ?? []) {
        const result = await this.syncTopic(topic, dbSection.id);
        if (result.skipped) {
          skipped.push(result.skipped);
        } else {
          topicsSynced += 1;
        }
      }
    }

    return { sectionsSynced, topicsSynced, skipped };
  }

  private async syncTopic(
    topic: StrapiTopic,
    sectionId: string,
  ): Promise<{ skipped?: SkippedItem }> {
    if (!topic.slug) {
      return { skipped: { type: 'topic', name: topic.title, reason: 'missing slug' } };
    }

    const dbMediaType = STRAPI_TO_DB_MEDIA_TYPE[topic.mediaType];
    if (!dbMediaType) {
      return {
        skipped: {
          type: 'topic',
          name: topic.title,
          reason: `unrecognized mediaType "${topic.mediaType}"`,
        },
      };
    }

    if (MEDIA_FILE_REQUIRED_TYPES.has(topic.mediaType) && !topic.mediaFile) {
      return {
        skipped: {
          type: 'topic',
          name: topic.title,
          reason: `mediaType "${topic.mediaType}" requires a mediaFile but none is uploaded`,
        },
      };
    }

    const contentUrl = topic.mediaFile
      ? this.strapiClient.resolveMediaUrl(topic.mediaFile.url)
      : null;

    await this.prisma.learnMoreTopic.upsert({
      where: { topicCode: topic.slug },
      create: {
        topicCode: topic.slug,
        topicName: topic.title,
        sectionId,
        mediaType: dbMediaType as never,
        contentUrl,
        sortOrder: topic.sortOrder ?? 0,
        status: 'ACTIVE',
      },
      update: {
        topicName: topic.title,
        mediaType: dbMediaType as never,
        contentUrl,
        sortOrder: topic.sortOrder ?? 0,
      },
    });

    return {};
  }
}
