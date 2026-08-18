import { asyncHandler, ok } from '../app.module';
import type { LookupService } from './lookup.service';

/**
 * Fixed-categoryCode master-data download handlers — thin aliases over
 * `LookupService.getByCategoryCode()` for consumers that expect a dedicated
 * path per master list (e.g. `/risk-categories`) rather than the generic
 * `/lookups/:categoryCode`. Same data, same response shape as the generic
 * route — just a different URL. Mounted under the global `api/v1` prefix by
 * `master-data-alias.routes.ts`.
 */
export function createMasterDataAliasController(service: LookupService) {
  const forCategory = (categoryCode: string) =>
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.getByCategoryCode(categoryCode)));
    });

  return {
    riskCategories: forCategory('RISK_CATEGORY'),
    riskTypes: forCategory('RISK_TYPE'),
    riskLanguages: forCategory('LANGUAGE'),
    visitCategories: forCategory('VISIT_CATEGORY'),
    itemCategories: forCategory('ITEM_CATEGORY'),
    uomList: forCategory('UOM'),
    transactionTypes: forCategory('TRANSACTION_TYPE'),
    gatheringStatuses: forCategory('GATHERING_STATUS'),
    gatheringTypes: forCategory('GATHERING_TYPE'),
  };
}
