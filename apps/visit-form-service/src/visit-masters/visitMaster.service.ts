import type { VisitMasterRepository } from './visitMaster.repository';

/**
 * Business logic for resolving visit_masters reference data — the SRS's
 * named visit-type catalog (ANC1, PP3, INC_HR, CCV_HR_SAM, etc., see
 * docs/Arogya_Sakhi_SRS_v3.0.md Appendix A/B). Serves the Supervisor app's
 * "Download Master Data" screen's "Visit Master" row when called with no
 * visitCodes, and a batch code→row resolution otherwise.
 */
export class VisitMasterService {
  constructor(private readonly repository: VisitMasterRepository) {}

  /**
   * With `visitCodes` given, resolves each to its full row — codes with no
   * matching ACTIVE row are silently omitted from the result (the caller
   * decides what to do with an unresolved code, e.g. skip it, rather than
   * the whole batch failing for one unseeded/retired code). With
   * `visitCodes` omitted (undefined), returns every ACTIVE visit master —
   * the master-data download.
   */
  async listByVisitCodes(visitCodes?: string[]) {
    return visitCodes
      ? this.repository.findByVisitCodes(visitCodes)
      : this.repository.findAllActive();
  }
}
