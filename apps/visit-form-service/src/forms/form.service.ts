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
    return version;
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

    return this.repository.createDraft({
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
  }

  async updateDraft(versionId: string, dto: PatchFormVersionInput) {
    const version = await this.repository.findVersionById(versionId);
    if (!version) throw notFound('Form version not found.');
    if (version.status !== 'DRAFT') {
      throw conflict('Only DRAFT versions can be edited.');
    }

    return this.repository.updateDraft(versionId, {
      schemaJson: dto.schemaJson,
      validationJson: dto.validationJson ?? [],
      checksum: computeChecksum(dto.schemaJson),
    });
  }

  async publish(versionId: string) {
    const version = await this.repository.findVersionById(versionId);
    if (!version) throw notFound('Form version not found.');
    if (version.status !== 'DRAFT') {
      throw conflict('Only DRAFT versions can be published.');
    }

    const current = await this.repository.findCurrentlyPublished(version.formDefinitionId);
    const effectiveFrom = new Date();
    return this.repository.publish(versionId, effectiveFrom, current?.id ?? null);
  }

  async createSubmission(formCode: string, dto: CreateSubmissionInput, submittedByUserId: string) {
    const existing = await this.repository.findSubmissionByLocalUuid(dto.localSubmissionUuid);
    if (existing) return existing; // idempotent replay — matches sync's local_submission_uuid dedup key

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

    return this.repository.createSubmission({
      formVersionId: dto.formVersionId,
      beneficiaryId: dto.beneficiaryId,
      visitId: dto.visitId ?? null,
      submittedByUserId,
      localSubmissionUuid: dto.localSubmissionUuid,
      formDataJson: dto.formData,
      validationStatus: 'VALID',
    });
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
        const va = Number(formData[a]);
        const vb = Number(formData[b]);
        if (Number.isNaN(va) || Number.isNaN(vb)) {
          violations.push(`${a} and ${b} must both be numeric`);
        } else if (va > vb) {
          violations.push(`${a} must be <= ${b}`);
        }
      } else if (rule.rule === 'SUM_EQUALS') {
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
