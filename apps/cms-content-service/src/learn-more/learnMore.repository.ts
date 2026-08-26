import type { PrismaService } from '../prisma/prisma.service';

const SECTION_SELECT = {
  id: true,
  sectionCode: true,
  sectionName: true,
  sortOrder: true,
} as const;

const TOPIC_SELECT = {
  id: true,
  topicCode: true,
  topicName: true,
  mediaType: true,
  contentUrl: true,
  sortOrder: true,
} as const;

/** Data access for learn_more_sections/learn_more_topics. Read-only from this feature. */
export class LearnMoreRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Every ACTIVE, non-deleted section, ordered for display. */
  findAllActiveSections() {
    return this.prisma.learnMoreSection.findMany({
      where: { status: 'ACTIVE', isDeleted: false },
      select: SECTION_SELECT,
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** One ACTIVE, non-deleted section by its stable code, or null. */
  findSectionByCode(sectionCode: string) {
    return this.prisma.learnMoreSection.findFirst({
      where: { sectionCode, status: 'ACTIVE', isDeleted: false },
      select: SECTION_SELECT,
    });
  }

  /** Every ACTIVE, non-deleted topic under a given section id, ordered for display. */
  findTopicsBySectionId(sectionId: string) {
    return this.prisma.learnMoreTopic.findMany({
      where: { sectionId, status: 'ACTIVE', isDeleted: false },
      select: TOPIC_SELECT,
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** One ACTIVE, non-deleted topic by its stable code, or null. */
  findTopicByCode(topicCode: string) {
    return this.prisma.learnMoreTopic.findFirst({
      where: { topicCode, status: 'ACTIVE', isDeleted: false },
      select: TOPIC_SELECT,
    });
  }
}
