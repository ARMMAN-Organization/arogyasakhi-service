import type { HealthEducationRepository } from './healthEducation.repository';

/**
 * Health education message lookup (SRS FR-S-5.2(c)). Read-only — content is
 * ingested via prisma/seed.ts, not authored through this API.
 */
export class HealthEducationService {
  constructor(private readonly repository: HealthEducationRepository) {}

  listMessages(filters: { riskConditionId?: string; stage?: string }) {
    return this.repository.findMany(filters);
  }
}
