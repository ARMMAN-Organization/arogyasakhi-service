import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { TokenSigner } from '@armman/service-commons';
import type { RegistrationTargetService } from './registration-target.service';
import { createRegistrationTargetController } from './registration-target.controller';
import { listRegistrationTargetsQuerySchema } from './dto/list-registration-targets.dto';
import { authenticate, errorResponse, validate, type DocumentedRouter } from '../app.module';

extendZodWithOpenApi(z);

const registrationTargetSchema = z.object({
  id: z.string().uuid().openapi({ example: '11111111-1111-1111-1111-111111111111' }),
  sakhiId: z.string().uuid().openapi({ example: 'c9f8e2b1-6a3d-4f0e-9b1a-2d4e5f6a7b8c' }),
  projectId: z.string().uuid().openapi({ example: '70ca545d-298a-4c02-bba2-d5c4c9bb9acd' }),
  targetPeriodStart: z.string().datetime().openapi({ example: '2026-04-01T00:00:00.000Z' }),
  targetPeriodEnd: z.string().datetime().openapi({ example: '2026-06-30T00:00:00.000Z' }),
  registrationTarget: z.number().int().nullable().openapi({ example: 25 }),
});

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * Sakhi-grain registration target download HTTP routes. Mounted under the
 * global `api/v1` prefix. Backs the reference Android app's
 * "Beneficiary/Master Data Download" screen — the ERD's
 * `ProjectRegistrationTarget` is project-grain only (no sakhiId), so this
 * reads the new `SakhiRegistrationTarget` model instead (see schema.prisma's
 * comment on that model). Read-only master-data download, open to any
 * authenticated role, matching `/project-geography` and
 * `/application-parameters`.
 */
export function registerRegistrationTargetRoutes(
  doc: DocumentedRouter,
  service: RegistrationTargetService,
  signer: TokenSigner,
) {
  const controller = createRegistrationTargetController(service);

  doc.get(
    '/registration-targets',
    {
      summary: "List a Sakhi's registration targets",
      tags: ['Registration Targets'],
      responses: {
        200: {
          description: 'Registration target rows for the Sakhi',
          schema: envelope(z.array(registrationTargetSchema)),
        },
        400: errorResponse(400, { message: 'sakhiId: Required' }),
        401: errorResponse(401),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    validate(listRegistrationTargetsQuerySchema, 'query'),
    controller.list,
  );
}
