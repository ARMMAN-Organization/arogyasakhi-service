import { notFound } from '@armman/service-commons';
import type { LearnMoreRepository } from './learnMore.repository';

/**
 * Business logic for the Learn More knowledge base (SRS FR-S-13.1-13.4).
 * Currently serves the "Content coming soon" placeholder seeded by
 * prisma/seed.ts — ARMMAN has not yet delivered the real section/topic
 * content structure (SRS Open Item 12). The API contract below is the
 * stable shape the app can build against now; only the underlying rows
 * change once real content lands, not this contract.
 */
export class LearnMoreService {
  constructor(private readonly repository: LearnMoreRepository) {}

  async listSections() {
    return this.repository.findAllActiveSections();
  }

  async listTopicsBySectionCode(sectionCode: string) {
    const section = await this.repository.findSectionByCode(sectionCode);
    if (!section) throw notFound('Learn More section not found.');
    return this.repository.findTopicsBySectionId(section.id);
  }

  async getTopicByCode(topicCode: string) {
    const topic = await this.repository.findTopicByCode(topicCode);
    if (!topic) throw notFound('Learn More topic not found.');
    return topic;
  }
}
