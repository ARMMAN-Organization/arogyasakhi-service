import { createHash } from 'node:crypto';
import { badRequest, conflict, notFound, unprocessable } from '@armman/service-commons';
import type { FormRepository } from './form.repository';
import {
  schemaJsonSchema,
  validationJsonSchema,
  type CrossFieldRule,
  type FormField,
} from './dto/form-field.dto';
import type { CreateDraftVersionInput } from './dto/create-draft-version.dto';
import type { PatchFormVersionInput } from './dto/patch-form-version.dto';
import type { CreateSubmissionInput } from './dto/create-submission.dto';

function computeChecksum(schemaJson: unknown): Buffer {
  return createHash('sha256').update(JSON.stringify(schemaJson)).digest();
}

/** The subset of FormVersion columns a client is allowed to see. */
interface FormVersionRow {
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
function toApiFormVersion<T extends FormVersionRow>(v: T) {
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
interface FormSubmissionRow {
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
function toApiFormSubmission<T extends FormSubmissionRow>(s: T) {
  return {
    id: s.id,
    formVersionId: s.formVersionId,
    beneficiaryId: s.beneficiaryId,
    visitId: s.visitId,
    submittedByUserId: s.submittedByUserId,
    submittedAt: s.submittedAt,
    localSubmissionUuid: s.localSubmissionUuid,
    formDataJson: s.formDataJson,
    validationStatus: s.validationStatus,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/** Evaluates SRS Category 5 skip logic for one field against the submitted formData. */
function isVisible(field: FormField, formData: Record<string, unknown>): boolean {
  if (!field.visibleWhen) return true;
  const actual = formData[field.visibleWhen.field];
  switch (field.visibleWhen.operator) {
    case 'eq':
      return actual === field.visibleWhen.value;
    case 'gte':
      return Number(actual) >= Number(field.visibleWhen.value);
    case 'lt':
      return Number(actual) < Number(field.visibleWhen.value);
    case 'isSet':
      return !isEmpty(actual);
    default:
      return true;
  }
}

/**
 * Business logic for the dynamic-forms feature: fetching the active version,
 * the DRAFT -> PUBLISHED lifecycle, and validating/persisting submissions.
 * Data access is delegated to the repository.
 */
export class FormService {
  constructor(private readonly repository: FormRepository) {}

  async getActiveVersion(formCode: string, asOf: Date) {
    const version = await this.repository.findActiveVersion(formCode, asOf);
    if (!version) throw notFound(`No published form version found for form code "${formCode}".`);
    return toApiFormVersion(version);
  }

  async createDraft(formCode: string, dto: CreateDraftVersionInput) {
    const definition = await this.repository.findDefinitionByCode(formCode);
    if (!definition) throw notFound(`Unknown form code "${formCode}".`);

    let schemaJson: unknown = [];
    let validationJson: unknown = [];
    if (dto.cloneFromVersionId) {
      const source = await this.repository.findVersionById(dto.cloneFromVersionId);
      if (!source || source.formDefinitionId !== definition.id) {
        throw badRequest('cloneFromVersionId does not belong to this form code.');
      }
      schemaJson = source.schemaJson;
      validationJson = source.validationJson ?? [];
    }

    const existingCount = await this.repository.countVersions(definition.id);
    const versionNo = `v${existingCount + 1}`;

    try {
      const created = await this.repository.createDraft({
        formDefinitionId: definition.id,
        versionNo,
        schemaJson,
        validationJson,
        checksum: computeChecksum(schemaJson),
        // Placeholder — form_versions.effective_from is NOT NULL, but a DRAFT
        // isn't live yet. Overwritten with the real value by publish(). See
        // the forms API design doc §7 (open question, flagged not assumed).
        effectiveFrom: new Date(),
      });
      return toApiFormVersion(created);
    } catch (err) {
      // count-then-create is not atomic: two concurrent createDraft calls can
      // pick the same versionNo. The @@unique([formDefinitionId, versionNo])
      // constraint keeps the data safe — surface the loser as a graceful 409
      // (retryable) rather than an unhandled 500.
      if (isUniqueConstraintViolation(err)) {
        throw conflict('A form version with this number is being created concurrently. Retry.');
      }
      throw err;
    }
  }

  async updateDraft(formCode: string, versionId: string, dto: PatchFormVersionInput) {
    const version = await this.repository.findVersionById(versionId);
    if (!version) throw notFound('Form version not found.');
    if (version.formDefinition.formCode !== formCode) {
      throw badRequest('versionId does not belong to this form code.');
    }
    if (version.status !== 'DRAFT') {
      throw conflict('Only DRAFT versions can be edited.');
    }

    const updated = await this.repository.updateDraft(versionId, {
      schemaJson: dto.schemaJson,
      validationJson: dto.validationJson ?? [],
      checksum: computeChecksum(dto.schemaJson),
    });
    return toApiFormVersion(updated);
  }

  async publish(formCode: string, versionId: string, publishedByUserId: string) {
    const version = await this.repository.findVersionById(versionId);
    if (!version) throw notFound('Form version not found.');
    if (version.formDefinition.formCode !== formCode) {
      throw badRequest('versionId does not belong to this form code.');
    }
    if (version.status !== 'DRAFT') {
      throw conflict('Only DRAFT versions can be published.');
    }
    // schemaJsonSchema requires >=1 field — publishing an empty/malformed
    // draft would otherwise pass here and only fail later, as an uncaught
    // exception, the first time createSubmission() parses it.
    if (!schemaJsonSchema.safeParse(version.schemaJson).success) {
      throw unprocessable('Draft schemaJson must have at least one well-formed field to publish.');
    }

    const current = await this.repository.findCurrentlyPublished(version.formDefinitionId);
    const effectiveFrom = new Date();
    // publishedByUserId recorded per the ERD's form_versions.published_by_user_id
    // and the append-only audit requirement for config/approval actions.
    const published = await this.repository.publish(
      versionId,
      effectiveFrom,
      current?.id ?? null,
      publishedByUserId,
    );
    return toApiFormVersion(published);
  }

  async createSubmission(formCode: string, dto: CreateSubmissionInput, submittedByUserId: string) {
    const existing = await this.repository.findSubmissionByLocalUuid(dto.localSubmissionUuid);
    // idempotent replay — matches sync's local_submission_uuid dedup key
    if (existing) return toApiFormSubmission(existing);

    const version = await this.repository.findVersionById(dto.formVersionId);
    if (!version) throw notFound('Form version not found.');
    if (version.formDefinition.formCode !== formCode) {
      throw badRequest('formVersionId does not belong to this form code.');
    }
    if (version.status !== 'PUBLISHED') {
      throw badRequest('Form version is not published.');
    }

    const fields = schemaJsonSchema.parse(version.schemaJson);
    const crossFieldRules = validationJsonSchema.parse(version.validationJson ?? []);
    const violations = this.validate(fields, crossFieldRules, dto.formData);

    if (violations.length) {
      throw unprocessable('Submission failed validation.', { violations });
    }

    const created = await this.repository.createSubmission({
      formVersionId: dto.formVersionId,
      beneficiaryId: dto.beneficiaryId,
      visitId: dto.visitId ?? null,
      submittedByUserId,
      localSubmissionUuid: dto.localSubmissionUuid,
      formDataJson: dto.formData,
      validationStatus: 'VALID',
    });
    return toApiFormSubmission(created);
  }

  /**
   * Checks required fields (SRS line 1150), numeric ranges (SRS Category 2),
   * and cross-field consistency (SRS Category 3) against submitted formData.
   * Date rules (Category 1) are deliberately not checked here — see the
   * forms API design doc §7. Fields hidden by skip logic (Category 5) or
   * computed by the system (Category 4) are excluded from the required check.
   */
  private validate(
    fields: FormField[],
    crossFieldRules: CrossFieldRule[],
    formData: Record<string, unknown>,
  ): string[] {
    const violations: string[] = [];

    for (const field of fields) {
      if (field.computedFrom) continue;
      if (!isVisible(field, formData)) continue;

      const value = formData[field.question_code];
      if (field.required && isEmpty(value)) {
        violations.push(`Missing required field: ${field.question_code}`);
        continue;
      }

      if (field.numericRange && !isEmpty(value)) {
        const numeric = Number(value);
        if (
          Number.isNaN(numeric) ||
          numeric < field.numericRange.min ||
          numeric > field.numericRange.max
        ) {
          violations.push(
            `${field.question_code} must be between ${field.numericRange.min} and ${field.numericRange.max}`,
          );
        }
      }
    }

    for (const rule of crossFieldRules) {
      if (rule.rule === 'LTE') {
        const [a, b] = rule.fields;
        // A field legitimately absent (optional, not yet answered) is not
        // this rule's concern — the required-field check above already
        // covers "missing". Only a *present but non-numeric* value is a
        // cross-field violation.
        if (isEmpty(formData[a]) || isEmpty(formData[b])) continue;
        const va = Number(formData[a]);
        const vb = Number(formData[b]);
        if (Number.isNaN(va) || Number.isNaN(vb)) {
          violations.push(`${a} and ${b} must both be numeric`);
        } else if (va > vb) {
          violations.push(`${a} must be <= ${b}`);
        }
      } else if (rule.rule === 'SUM_EQUALS') {
        const allFields = [...rule.fields, rule.equals];
        if (allFields.some((f) => isEmpty(formData[f]))) continue;
        const values = rule.fields.map((f) => Number(formData[f]));
        const target = Number(formData[rule.equals]);
        if (values.some((v) => Number.isNaN(v)) || Number.isNaN(target)) {
          violations.push(`${rule.fields.join(', ')} and ${rule.equals} must all be numeric`);
        } else if (values.reduce((total, v) => total + v, 0) !== target) {
          violations.push(`${rule.fields.join(' + ')} must equal ${rule.equals}`);
        }
      }
    }

    return violations;
  }
}

/** Narrows a caught Prisma error to a unique-constraint violation (P2002). */
function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
}
