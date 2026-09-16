import { notFound } from '@armman/service-commons';
import type { HealthEducationRepository } from './healthEducation.repository';
import type { PatchHealthEducationMessageInput } from './dto/patch-health-education-message.dto';

/**
 * Health education message lookup (SRS FR-S-5.2(c)). Content is ingested
 * via prisma/seed.ts on a fresh environment (seed.ts's own upsert never
 * overwrites an existing row — see its doc comment); updateMessage is the
 * one ADMIN-only path to correct already-seeded content afterward (e.g. a
 * translation fix) without direct DB access.
 */
export class HealthEducationService {
  constructor(private readonly repository: HealthEducationRepository) {}

  listMessages(filters: { riskConditionId?: string; stage?: string; conditionLabel?: string }) {
    return this.repository.findMany(filters);
  }

  async updateMessage(id: string, data: PatchHealthEducationMessageInput) {
    const existing = await this.repository.findById(id);
    if (!existing) throw notFound('Health education message not found.');
    return this.repository.update(id, data);
  }
}
