import type { RiskConditionRepository } from './riskCondition.repository';

/**
 * Business logic for resolving risk_conditions reference data. Read-only
 * lookup, used by other services to resolve a stable conditionCode (e.g.
 * "HYPERTENSION_HIGH_BP") to the riskConditionId a BeneficiaryRiskConditionSummary
 * row needs — this service owns risk_conditions, so no other service may
 * query it directly (forklift rule, no cross-service joins).
 */
export class RiskConditionService {
  constructor(private readonly repository: RiskConditionRepository) {}

  /**
   * Resolves each of the given condition codes to its riskConditionId.
   * Codes with no matching ACTIVE row are silently omitted from the result —
   * the caller decides what to do with an unresolved code (e.g. skip it)
   * rather than the whole batch failing for one unseeded/retired code.
   */
  async listByConditionCodes(conditionCodes: string[]) {
    const found = await this.repository.findByConditionCodes(conditionCodes);
    return found.map((c) => ({ conditionCode: c.conditionCode, riskConditionId: c.id }));
  }
}
