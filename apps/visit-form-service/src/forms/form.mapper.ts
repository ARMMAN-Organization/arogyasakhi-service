import { createHash } from 'node:crypto';

/** SHA-256 of the schema JSON, stored on form_versions.checksum for change detection. */
export function computeChecksum(schemaJson: unknown): Buffer {
  return createHash('sha256').update(JSON.stringify(schemaJson)).digest();
}

/** The subset of FormVersion columns a client is allowed to see. */
export interface FormVersionRow {
  id: string;
  formDefinitionId: string;
  versionNo: string;
  schemaJson: unknown;
  validationJson: unknown;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  publishedByUserId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Projects a raw form_versions row down to exactly the fields the API
 * exposes (matches formVersionSchema in form.controller.ts). Drops internal
 * columns — notably the binary `checksum`, plus createdByUserId/
 * updatedByUserId/isDeleted/deletedAt — so they never leak into a response
 * even though the Prisma row carries them.
 */
export function toApiFormVersion<T extends FormVersionRow>(v: T) {
  return {
    id: v.id,
    formDefinitionId: v.formDefinitionId,
    versionNo: v.versionNo,
    schemaJson: v.schemaJson,
    validationJson: v.validationJson,
    effectiveFrom: v.effectiveFrom,
    effectiveTo: v.effectiveTo,
    publishedByUserId: v.publishedByUserId,
    status: v.status,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
}

/** The subset of form_submissions columns a client is allowed to see. */
export interface FormSubmissionRow {
  id: string;
  formVersionId: string;
  beneficiaryId: string;
  visitId: string | null;
  submittedByUserId: string;
  submittedAt: Date;
  localSubmissionUuid: string;
  formDataJson: unknown;
  validationStatus: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Projects a raw form_submissions row down to the API-exposed fields
 * (matches formSubmissionSchema in form.controller.ts). Drops internal
 * columns ruleVersionId/syncBatchId/createdByUserId/updatedByUserId/
 * isDeleted/deletedAt so they never leak into a response.
 */
export function toApiFormSubmission<T extends FormSubmissionRow>(s: T) {
  return {
    id: s.id,
    formVersionId: s.formVersionId,
    beneficiaryId: s.beneficiaryId,
    visitId: s.visitId,
    submittedByUserId: s.submittedByUserId,
    submittedAt: s.submittedAt,
    localSubmissionUuid: s.localSubmissionUuid,
    formData: s.formDataJson,
    validationStatus: s.validationStatus,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}
