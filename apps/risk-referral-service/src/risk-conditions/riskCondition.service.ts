import type { RiskConditionRepository } from './riskCondition.repository';

/**
 * Business logic for resolving risk_conditions reference data. Read-only
 * lookup, used by other services to resolve a stable conditionCode (e.g.
 * "HYPERTENSION_HIGH_BP") to the riskConditionId a BeneficiaryRiskConditionSummary
 * row needs — this service owns risk_conditions, so no other service may
 * query it directly (forklift rule, no cross-service joins). Also serves as
 * the Risk Condition master-data download for the Supervisor app when called
 * with no conditionCodes. For the distinct raw-measurement concept (e.g.
 * "SYSTOLIC_BP" feeding a rule evaluation, as opposed to the diagnosed
 * "HYPERTENSION_HIGH_BP" condition this service models), see the sibling
 * risk-parameters feature (`GET /risk-parameters`).
 */
export class RiskConditionService {
  constructor(private readonly repository: RiskConditionRepository) {}

  /**
   * With `conditionCodes` given, resolves each to its full row — codes with
   * no matching ACTIVE row are silently omitted from the result (the caller
   * decides what to do with an unresolved code, e.g. skip it, rather than
   * the whole batch failing for one unseeded/retired code). With
   * `conditionCodes` omitted (undefined), returns every ACTIVE condition —
   * the master-data download.
   */
  async listByConditionCodes(conditionCodes?: string[]) {
    return conditionCodes
      ? this.repository.findByConditionCodes(conditionCodes)
      : this.repository.findAllActive();
  }

  /**
   * With `ids` given, resolves each riskConditionId to its full row — ids
   * with no matching ACTIVE row are silently omitted (same "unresolved
   * entries are skipped, not fatal" contract as listByConditionCodes). An
   * empty array short-circuits to an empty result without querying.
   */
  async listByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return this.repository.findByIds(ids);
  }
}
