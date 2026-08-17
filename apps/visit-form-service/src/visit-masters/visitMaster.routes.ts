import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { VisitMasterService } from './visitMaster.service';
import { createVisitMasterController } from './visitMaster.controller';
import { listVisitMastersQuerySchema } from './dto/list-visit-masters.dto';
import { trustGatewayIdentity, validate, type DocumentedRouter } from '../app.module';

extendZodWithOpenApi(z);

const visitMasterSchema = z.object({
  id: z.string().uuid(),
  visitCode: z.string().openapi({ example: 'PP3' }),
  visitType: z.enum([
    'ANC',
    'ANC_HR',
    'ANC_POST_EDD',
    'DELIVERY',
    'PP',
    'NN',
    'INC',
    'INC_HR',
    'CCV',
    'CCV_HR',
  ]),
  displayName: z.string().openapi({ example: 'Postpartum Visit 3' }),
  entityType: z.enum(['MOTHER', 'CHILD', 'REFERRAL', 'SUPERVISOR', 'SYSTEM']),
  sequenceOrder: z.number().int().nullable(),
  description: z.string().nullable().openapi({ example: 'Day +58, window Day +53 to Day +63.' }),
  isActive: z.boolean(),
});

const apiErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  errorCode: z.string().openapi({ example: 'VALIDATION_ERROR' }),
  details: z.record(z.unknown()).optional(),
});

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * Visit master reference-data routes. Mounted under the global `api/v1`
 * prefix. Read-only catalog of the SRS's named visit-type definitions
 * (docs/Arogya_Sakhi_SRS_v3.0.md Appendix A/B) — distinct from the coarser
 * lookup_values VISIT_CATEGORY grouping served by auth-service's
 * /visit-categories. This is the Supervisor app's "Download Master Data"
 * screen's "Visit Master" row.
 */
export function registerVisitMasterRoutes(doc: DocumentedRouter, service: VisitMasterService) {
  const controller = createVisitMasterController(service);

  doc.get(
    '/visit-masters',
    {
      summary:
        'List visit master (visit-type catalog) rows. With visitCode, resolves a ' +
        'comma-separated batch of visit codes to their full rows (codes with no matching ' +
        'ACTIVE row are omitted from the response rather than failing the whole batch). ' +
        'Without visitCode, returns every ACTIVE visit master — the master-data download.',
      tags: ['Visit Masters'],
      responses: {
        200: {
          description:
            'Visit master rows — the full set when visitCode is omitted, or the resolved ' +
            'subset matching the requested codes',
          schema: envelope(z.array(visitMasterSchema)),
        },
        400: { description: 'Malformed visitCode query param', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    validate(listVisitMastersQuerySchema, 'query'),
    controller.listByVisitCodes,
  );
}
