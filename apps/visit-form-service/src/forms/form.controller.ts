import { asyncHandler, ok, unauthorized } from '../app.module';
import type { FormService } from './form.service';

/**
 * Form request handlers. Mounted under the global `api/v1` prefix by
 * `form.routes.ts`.
 */
export function createFormController(service: FormService) {
  return {
    getActiveVersion: asyncHandler(async (req, res, next) => {
      // trustGatewayIdentity runs first and calls next(unauthorized()) if it
      // fails, so req.user is always populated by the time this handler runs.
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());

      const { formCode } = req.params as unknown as { formCode: string };
      const { asOf } = req.query as unknown as { asOf?: Date };
      const version = await service.getActiveVersion(
        formCode,
        asOf ?? new Date(),
        req.user.geographyUnitId,
        authorizationHeader,
      );
      res.json(ok(version));
    }),

    createDraft: asyncHandler(async (req, res) => {
      const { formCode } = req.params as unknown as { formCode: string };
      const created = await service.createDraft(formCode, req.body);
      res.status(201).json(ok(created));
    }),

    updateDraft: asyncHandler(async (req, res) => {
      const { formCode, versionId } = req.params as unknown as {
        formCode: string;
        versionId: string;
      };
      const updated = await service.updateDraft(formCode, versionId, req.body);
      res.json(ok(updated));
    }),

    publish: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const { formCode, versionId } = req.params as unknown as {
        formCode: string;
        versionId: string;
      };
      const published = await service.publish(formCode, versionId, req.user.id);
      res.json(ok(published));
    }),

    createSubmission: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const { formCode } = req.params as unknown as { formCode: string };
      const created = await service.createSubmission(
        formCode,
        req.body,
        req.user.id,
        authorizationHeader,
      );
      res.status(201).json(ok(created));
    }),
  };
}
