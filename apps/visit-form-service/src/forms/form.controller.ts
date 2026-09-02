import { asyncHandler, ok, unauthorized } from '../app.module';
import type { FormService } from './form.service';
import type { PatchFormSubmissionAnswersInput } from './dto/patch-formSubmissionAnswers.dto';
import { VISIT_CODE_TO_FORM_CODE } from './visit-code-form-map';

/**
 * Form request handlers. Mounted under the global `api/v1` prefix by
 * `form.routes.ts`.
 */
export function createFormController(service: FormService) {
  return {
    getVisitCodeFormMap: asyncHandler(async (_req, res) => {
      res.json(ok(VISIT_CODE_TO_FORM_CODE));
    }),

    getActiveVersion: asyncHandler(async (req, res, next) => {
      // trustGatewayIdentity runs first and calls next(unauthorized()) if it
      // fails, so req.user is always populated by the time this handler runs.
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());

      const { formCode } = req.params as unknown as { formCode: string };
      const { asOf, beneficiaryId } = req.query as unknown as {
        asOf?: Date;
        beneficiaryId?: string;
      };
      const version = await service.getActiveVersion(
        formCode,
        asOf ?? new Date(),
        req.user.geographyUnitId,
        authorizationHeader,
        beneficiaryId,
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

    getLatestVisitVitals: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const { beneficiaryId } = req.params as unknown as { beneficiaryId: string };
      const vitals = await service.getLatestVisitVitals(
        beneficiaryId,
        req.user,
        authorizationHeader,
      );
      res.json(ok(vitals));
    }),

    getDeliveryOutcomes: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const { beneficiaryId } = req.params as unknown as { beneficiaryId: string };
      const outcomes = await service.getDeliveryOutcomes(beneficiaryId);
      res.json(ok(outcomes));
    }),

    updateSubmissionAnswers: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const { id } = req.params as unknown as { id: string };
      const { edits } = req.body as PatchFormSubmissionAnswersInput;
      const updated = await service.updateSubmissionAnswers(
        id,
        edits,
        req.user.id,
        authorizationHeader,
      );
      res.json(ok(updated));
    }),
  };
}
