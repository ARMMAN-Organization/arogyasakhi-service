import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { TokenSigner } from '@armman/service-commons';
import type { ProjectGeographyService } from './project-geography.service';
import { createProjectGeographyController } from './project-geography.controller';
import { listProjectGeographyQuerySchema } from './dto/list-project-geography.dto';
import { authenticate, errorResponse, validate, type DocumentedRouter } from '../app.module';

extendZodWithOpenApi(z);

const projectGeographySchema = z.object({
  id: z.string().uuid().openapi({ example: '11111111-1111-1111-1111-111111111111' }),
  projectId: z.string().uuid().openapi({ example: '70ca545d-298a-4c02-bba2-d5c4c9bb9acd' }),
  geographyUnitId: z.string().uuid().openapi({ example: '99999999-9999-9999-9999-999999999999' }),
  activeFrom: z.string().datetime().openapi({ example: '2026-04-01T00:00:00.000Z' }),
  activeTo: z.string().datetime().nullable().openapi({ example: null }),
});

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * Project↔geography-unit scoping HTTP routes. Mounted under the global
 * `api/v1` prefix. Read-only master-data download — lets a client scope its
 * geography-unit download to a project's active geography units instead of
 * pulling the entire state tree. `geographyUnitId` is a bare scalar (no
 * joined GeographyUnit row — see project-geography.service.ts); a client
 * resolves unit detail from its own `GET /geography-units` download. Open
 * to any authenticated role, same as `/projects` and `/geography-units`.
 */
export function registerProjectGeographyRoutes(
  doc: DocumentedRouter,
  service: ProjectGeographyService,
  signer: TokenSigner,
) {
  const controller = createProjectGeographyController(service);

  doc.get(
    '/project-geography',
    {
      summary: 'List the geography units currently active for a project',
      tags: ['Project Geography'],
      responses: {
        200: {
          description: 'Active project↔geography-unit mappings',
          schema: envelope(z.array(projectGeographySchema)),
        },
        400: errorResponse(400, { message: 'projectId: Required' }),
        401: errorResponse(401),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    validate(listProjectGeographyQuerySchema, 'query'),
    controller.list,
  );
}
