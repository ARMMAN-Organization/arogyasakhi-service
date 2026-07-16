import type { OpenAPIRegistry } from '@armman/service-commons';
import { buildServiceOpenApiDocument } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

/**
 * Builds the notification-escalation-service OpenAPI document from the
 * registry that `createNotificationRouter` (via `createDocumentedRouter()`)
 * already populated as each route was defined — there is no separate,
 * hand-maintained route list to keep in sync here.
 */
export function buildNotificationEscalationServiceOpenApiDocument(registry: OpenAPIRegistry) {
  return buildServiceOpenApiDocument(registry, {
    title: 'Arogya Sakhi — Notification Escalation Service API',
    description: 'Event-driven notifications and escalations.',
    port: appConfig.PORT,
    publicBaseUrls: appConfig.PUBLIC_BASE_URLS,
  });
}
