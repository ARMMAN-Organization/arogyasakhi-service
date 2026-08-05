import { OpenAPIRegistry, buildServiceOpenApiDocument } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

/**
 * Builds the notification-escalation-service OpenAPI document from every
 * feature router's registry — each `createDocumentedRouter()` call creates
 * its own registry, merged here (via the registry's `parents` constructor
 * param) so notifications/escalations routes never overwrite each other in
 * the combined doc.
 */
export function buildNotificationEscalationServiceOpenApiDocument(
  ...registries: OpenAPIRegistry[]
) {
  const merged = new OpenAPIRegistry(registries);
  return buildServiceOpenApiDocument(merged, {
    title: 'Arogya Sakhi — Notification Escalation Service API',
    description: 'Event-driven notifications and escalations.',
    port: appConfig.PORT,
    publicBaseUrls: appConfig.PUBLIC_BASE_URLS,
  });
}
