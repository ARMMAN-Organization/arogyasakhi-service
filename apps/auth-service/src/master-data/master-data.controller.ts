import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { TokenSigner } from '@armman/service-commons';
import type { MasterDataService } from './master-data.service';
import { getMasterDataDeltasQuerySchema } from './dto/get-master-data-deltas.dto';
import {
  asyncHandler,
  authenticate,
  createDocumentedRouter,
  errorResponse,
  ok,
  validate,
} from '../app.module';

extendZodWithOpenApi(z);

const deltaGeographyUnitSchema = z.object({
  geographyUnitId: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  geoType: z.enum(['STATE', 'DISTRICT', 'BLOCK', 'PHC', 'SUBCENTRE', 'VILLAGE', 'PADA']),
  geoCode: z.string().nullable(),
  name: z.string(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  updatedAt: z.string().datetime(),
  isDeleted: z.boolean(),
  deletedAt: z.string().datetime().nullable(),
});

const deltaFunderSchema = z.object({
  funderId: z.string().uuid(),
  funderCode: z.string(),
  funderName: z.string(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  updatedAt: z.string().datetime(),
  isDeleted: z.boolean(),
  deletedAt: z.string().datetime().nullable(),
});

const deltaProjectSchema = z.object({
  projectId: z.string().uuid(),
  funderId: z.string().uuid().nullable(),
  funder: deltaFunderSchema.nullable(),
  projectCode: z.string(),
  projectName: z.string(),
  financialYear: z.string(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().nullable(),
  status: z.enum(['ACTIVE', 'PAUSED', 'CLOSED']),
  updatedAt: z.string().datetime(),
  isDeleted: z.boolean(),
  deletedAt: z.string().datetime().nullable(),
});

const masterDataDeltasSchema = z.object({
  serverTime: z.string().datetime().openapi({
    description:
      'Server-side timestamp for this response — store it and pass it back as `since` on the next call, avoiding client/server clock-skew issues.',
  }),
  geographyUnits: z.array(deltaGeographyUnitSchema),
  projects: z.array(deltaProjectSchema),
  funders: z.array(deltaFunderSchema),
});

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * Master-data delta sync HTTP route. Mounted under the global `api/v1`
 * prefix. Open to any authenticated role, matching the existing
 * `/geography-units`/`/projects`/`/funders` read APIs this aggregates.
 */
export function createMasterDataRouter(service: MasterDataService, signer: TokenSigner) {
  const doc = createDocumentedRouter();

  doc.get(
    '/master-data/deltas',
    {
      summary:
        'Pull geography/project/funder master data changed since a given time (offline-sync delta)',
      tags: ['Master Data'],
      query: getMasterDataDeltasQuerySchema,
      responses: {
        200: {
          description:
            'Master data changed since `since` (or the full dataset, when `since` is omitted). Soft-deleted rows are included so a client can prune its local cache.',
          schema: envelope(masterDataDeltasSchema),
        },
        400: errorResponse(400, { message: 'since: Invalid datetime' }),
        401: errorResponse(401),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    validate(getMasterDataDeltasQuerySchema, 'query'),
    asyncHandler(async (req, res) => {
      const { since } = req.query as { since?: string };
      // An empty string means "no since" (client robustness) — normalized
      // here rather than in the Zod schema, since a schema-level
      // transform/pipe crashes zod-to-openapi's doc generation (see the DTO).
      res.json(ok(await service.getDeltas(since || undefined)));
    }),
  );

  return doc;
}
