import type { RiskParameterRepository } from './riskParameter.repository';

/**
 * Business logic for resolving risk_parameters reference data — the raw
 * measurable clinical dimension (e.g. "SYSTOLIC_BP", "HEMOGLOBIN") that feeds
 * a rules-service rule evaluation, distinct from RiskCondition, which is the
 * resulting diagnosed/flagged condition (e.g. "HYPERTENSION_HIGH_BP") after
 * grading. Serves as the Risk Parameter master-data download for the
 * Supervisor app's "Download Master Data" screen when called with no
 * parameterCodes.
 */
export class RiskParameterService {
  constructor(private readonly repository: RiskParameterRepository) {}

  /**
   * With `parameterCodes` given, resolves each to its full row — codes with
   * no matching ACTIVE row are silently omitted from the result (the caller
   * decides what to do with an unresolved code, e.g. skip it, rather than
   * the whole batch failing for one unseeded/retired code). With
   * `parameterCodes` omitted (undefined), returns every ACTIVE parameter —
   * the master-data download.
   */
  async listByParameterCodes(parameterCodes?: string[]) {
    return parameterCodes
      ? this.repository.findByParameterCodes(parameterCodes)
      : this.repository.findAllActive();
  }
}
