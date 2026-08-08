import { OpenAPIRegistry, buildServiceOpenApiDocument } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

/**
 * Builds the risk-referral-service OpenAPI document from every feature
 * router's registry — each `createDocumentedRouter()` call creates its own
 * registry, so referrals/risk-assessments routes are merged here (via the
 * registry's `parents` constructor param) rather than one router's routes
 * silently missing from the combined doc.
 */
export function buildRiskReferralServiceOpenApiDocument(...registries: OpenAPIRegistry[]) {
  const merged = new OpenAPIRegistry(registries);
  return buildServiceOpenApiDocument(merged, {
    title: 'Arogya Sakhi — Risk Referral Service API',
    description: 'Risk assessments, flags, referrals, and follow-ups.',
    port: appConfig.PORT,
    publicBaseUrls: appConfig.PUBLIC_BASE_URLS,
  });
}
