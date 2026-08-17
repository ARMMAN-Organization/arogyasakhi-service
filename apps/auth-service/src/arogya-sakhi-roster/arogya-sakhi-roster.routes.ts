import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { TokenSigner } from '@armman/service-commons';
import type { ArogyaSakhiRosterService } from './arogya-sakhi-roster.service';
import { createArogyaSakhiRosterController } from './arogya-sakhi-roster.controller';
import { listArogyaSakhiRosterQuerySchema } from './dto/list-arogya-sakhi-roster.dto';
import {
  authenticate,
  errorResponse,
  requireRoles,
  validate,
  type DocumentedRouter,
} from '../app.module';

extendZodWithOpenApi(z);

const rosterEntrySchema = z.object({
  id: z.string().uuid().openapi({ example: '11111111-1111-1111-1111-111111111111' }),
  userId: z.string().uuid().openapi({ example: 'c9f8e2b1-6a3d-4f0e-9b1a-2d4e5f6a7b8c' }),
  displayName: z.string().openapi({ example: 'Priya Sharma' }),
  username: z.string().openapi({ example: 'priya.sharma' }),
  mobileNumber: z.string().openapi({ example: '+919000000123' }),
  employeeCode: z.string().nullable().openapi({ example: 'EMP-00123' }),
  supervisorId: z.string().uuid().nullable(),
  primaryProjectId: z.string().uuid().openapi({ example: '70ca545d-298a-4c02-bba2-d5c4c9bb9acd' }),
  activeFrom: z.string().datetime().openapi({ example: '2026-04-01T00:00:00.000Z' }),
  activeTo: z.string().datetime().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'LOCKED', 'PAUSED', 'DELETED']).openapi({
    example: 'ACTIVE',
  }),
});

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * Sakhi roster download HTTP routes. Mounted under the global `api/v1`
 * prefix. Backs the reference Android app's "Beneficiary/Master Data
 * Download" screen — a flatter roster projection than
 * `GET /projects/:projectId/sakhis` (which is an assignment list); never
 * includes the PII/financial fields on `SakhiProfile`
 * (panToken/aadhaarToken/bankAccountToken/ifscCode/backupContact) — a
 * roster download for offline reference has no documented need for them.
 * Restricted to the same audience as `/projects/:projectId/sakhis`.
 */
export function registerArogyaSakhiRosterRoutes(
  doc: DocumentedRouter,
  service: ArogyaSakhiRosterService,
  signer: TokenSigner,
) {
  const controller = createArogyaSakhiRosterController(service);

  doc.get(
    '/arogya-sakhi-roster',
    {
      summary: 'Download the Sakhi roster for a project',
      tags: ['Arogya Sakhi Roster'],
      responses: {
        200: {
          description: 'Sakhi roster for the project',
          schema: envelope(z.array(rosterEntrySchema)),
        },
        400: errorResponse(400, { message: 'projectId: Required' }),
        401: errorResponse(401),
        403: errorResponse(403),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(listArogyaSakhiRosterQuerySchema, 'query'),
    controller.list,
  );
}
