import type { OpenAPIRegistry } from '@armman/service-commons';
import { buildServiceOpenApiDocument } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

/**
 * Builds the risk-referral-service OpenAPI document from the registry that
 * `createReferralRouter` (via `createDocumentedRouter()`) already populated as
 * each route was defined — there is no separate, hand-maintained route list
 * to keep in sync here.
 */
export function buildRiskReferralServiceOpenApiDocument(registry: OpenAPIRegistry) {
  return buildServiceOpenApiDocument(registry, {
    title: 'Arogya Sakhi — Risk Referral Service API',
    description: 'Risk assessments, flags, referrals, and follow-ups.',
    port: appConfig.PORT,
    publicBaseUrls: appConfig.PUBLIC_BASE_URLS,
  });
}
