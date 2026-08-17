import { notFound } from '@armman/service-commons';
import type { ApplicationParameterRepository } from './application-parameter.repository';

/**
 * Response is projected to exactly the fields the API documents
 * (applicationParameterSchema in application-parameter.routes.ts), dropping
 * internal audit columns (createdByUserId, updatedByUserId, createdAt,
 * updatedAt) from the response.
 */
function toApiApplicationParameter(row: Record<string, unknown>) {
  return {
    id: row.id,
    paramKey: row.paramKey,
    paramValue: row.paramValue,
    description: row.description,
    isActive: row.isActive,
  };
}

/**
 * Business logic for app-wide configuration key/value parameters. This is a
 * read-only master-data download for now (no route yet writes a parameter) —
 * seeding/editing values is a deliberate product decision left to whoever
 * owns the mobile app's config spec, not guessed here.
 */
export class ApplicationParameterService {
  constructor(private readonly repository: ApplicationParameterRepository) {}

  /** Every active parameter, for the mobile apps' master-data download. */
  async list() {
    const rows = await this.repository.findAllActive();
    return rows.map((r) => toApiApplicationParameter(r as unknown as Record<string, unknown>));
  }

  /** One parameter by its key; throws 404 if it doesn't exist or is inactive. */
  async getByKey(paramKey: string) {
    const row = await this.repository.findActiveByKey(paramKey);
    if (!row) throw notFound('Application parameter not found.');
    return toApiApplicationParameter(row as unknown as Record<string, unknown>);
  }
}
