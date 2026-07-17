import { Router } from 'express';
import { z } from 'zod';
import type { FormService } from './form.service';
import { createDraftVersionSchema } from './dto/create-draft-version.dto';
import { patchFormVersionSchema } from './dto/patch-form-version.dto';
import { createSubmissionSchema } from './dto/create-submission.dto';
import {
  asyncHandler,
  ok,
  requireRoles,
  trustGatewayIdentity,
  unauthorized,
  validate,
  validateBody,
} from '../app.module';

const formCodeParamsSchema = z.object({ formCode: z.string().trim().min(1) }).strict();
const versionParamsSchema = z
  .object({ formCode: z.string().trim().min(1), versionId: z.string().uuid() })
  .strict();
const activeVersionQuerySchema = z.object({ asOf: z.coerce.date().optional() }).strict();

/**
 * Dynamic-forms HTTP routes (Layer 1 only — form mechanics, not the
 * per-domain consequence of a submission). Mounted under the global
 * `api/v1` prefix. Admin routes (draft/patch/publish) are ADMIN-only,
 * matching the HLD's admin/rules endpoint pattern this mirrors; the
 * read/submit routes require authentication but no specific role, since
 * the HLD doesn't name exact roles per form code (flagged in the forms API
 * design doc §7 rather than guessed here).
 */
export function createFormRouter(service: FormService): Router {
  const router = Router();

  router.get(
    '/forms/:formCode/active-version',
    trustGatewayIdentity,
    validate(formCodeParamsSchema, 'params'),
    validate(activeVersionQuerySchema, 'query'),
    asyncHandler(async (req, res) => {
      const { formCode } = req.params as unknown as { formCode: string };
      const { asOf } = req.query as unknown as { asOf?: Date };
      const version = await service.getActiveVersion(formCode, asOf ?? new Date());
      res.json(ok(version));
    }),
  );

  router.post(
    '/admin/forms/:formCode/versions',
    trustGatewayIdentity,
    requireRoles('ADMIN'),
    validate(formCodeParamsSchema, 'params'),
    validateBody(createDraftVersionSchema),
    asyncHandler(async (req, res) => {
      const { formCode } = req.params as unknown as { formCode: string };
      const created = await service.createDraft(formCode, req.body);
      res.status(201).json(ok(created));
    }),
  );

  router.patch(
    '/admin/forms/:formCode/versions/:versionId',
    trustGatewayIdentity,
    requireRoles('ADMIN'),
    validate(versionParamsSchema, 'params'),
    validateBody(patchFormVersionSchema),
    asyncHandler(async (req, res) => {
      const { formCode, versionId } = req.params as unknown as {
        formCode: string;
        versionId: string;
      };
      const updated = await service.updateDraft(formCode, versionId, req.body);
      res.json(ok(updated));
    }),
  );

  router.post(
    '/admin/forms/:formCode/versions/:versionId/publish',
    trustGatewayIdentity,
    requireRoles('ADMIN'),
    validate(versionParamsSchema, 'params'),
    asyncHandler(async (req, res) => {
      const { formCode, versionId } = req.params as unknown as {
        formCode: string;
        versionId: string;
      };
      const published = await service.publish(formCode, versionId);
      res.json(ok(published));
    }),
  );

  router.post(
    '/forms/:formCode/submissions',
    trustGatewayIdentity,
    validate(formCodeParamsSchema, 'params'),
    validateBody(createSubmissionSchema),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const { formCode } = req.params as unknown as { formCode: string };
      const created = await service.createSubmission(formCode, req.body, req.user.id);
      res.status(201).json(ok(created));
    }),
  );

  return router;
}
