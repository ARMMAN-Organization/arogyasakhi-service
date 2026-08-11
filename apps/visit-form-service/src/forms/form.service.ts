import { badRequest, conflict, notFound, unprocessable } from '@armman/service-commons';
import type { FormRepository } from './form.repository';
import { schemaJsonSchema, validationJsonSchema } from './dto/form-field.dto';
import type { CreateDraftVersionInput } from './dto/create-draft-version.dto';
import type { PatchFormVersionInput } from './dto/patch-form-version.dto';
import type { CreateSubmissionInput } from './dto/create-submission.dto';
import {
  buildFormAnswers,
  computeChecksum,
  toApiFormSubmission,
  toApiFormVersion,
} from './form.mapper';
import { validateSubmission } from './form-validation';
import { syncSocioDemographics } from '../beneficiaries/socio-demographics.client';
import { syncHealthHistory } from '../beneficiaries/health-history.client';
import { getAncestorChain } from '../geography/geography.client';
import { triggerRiskAssessment } from '../risk-assessments/riskAssessment.client';
import { fetchPublishedRuleSet } from '../rules/ruleVersion.client';

/**
 * Business logic for the dynamic-forms feature: fetching the active version,
 * the DRAFT -> PUBLISHED lifecycle, and validating/persisting submissions.
 * Data access is delegated to the repository.
 */
export class FormService {
  constructor(private readonly repository: FormRepository) {}

  /**
   * `callerGeographyUnitId`/`authorizationHeader` are the caller's own scope
   * and bearer token (from `req.user`/the inbound request, see
   * form.controller.ts) — used only to attach the caller's geography chain to
   * the response, not to scope which form version is returned. Omitted when
   * the caller has no geographyUnitId assigned.
   */
  async getActiveVersion(
    formCode: string,
    asOf: Date,
    callerGeographyUnitId: string | null,
    authorizationHeader: string,
  ) {
    const version = await this.repository.findActiveVersion(formCode, asOf);
    if (!version) throw notFound(`No published form version found for form code "${formCode}".`);
    const apiVersion = toApiFormVersion(version);

    if (!callerGeographyUnitId) return apiVersion;

    const chain = await getAncestorChain(callerGeographyUnitId, authorizationHeader);
    // Only the fields a client needs to map a level onto pii.<level>Id
    // (geoType) and show to a user (name) — parentId/geoCode/status are
    // internal/display-only and dropped here.
    const geography = chain.map((unit) => ({
      geographyUnitId: unit.geographyUnitId,
      geoType: unit.geoType,
      name: unit.name,
    }));
    return { ...apiVersion, geography };
  }

  /**
   * Resolves a form's configured RISK rule set in one call — formCode ->
   * riskRuleSetId (this service's own form_definitions) -> rulesJson
   * (rules-service's currently-published version for that set). The
   * production consumer is a client caching rulesJson to evaluate HR
   * conditions offline (FR-S-5.1), avoiding a separate lookup against
   * form_definitions to discover the rule set id first.
   */
  async getActiveVersionRiskRules(formCode: string, asOf: Date, authorizationHeader: string) {
    const version = await this.repository.findActiveVersion(formCode, asOf);
    if (!version) throw notFound(`No published form version found for form code "${formCode}".`);

    const riskRuleSetId = version.formDefinition?.riskRuleSetId ?? null;
    if (!riskRuleSetId) {
      throw notFound(`Form code "${formCode}" has no risk rule set configured.`);
    }

    const ruleSet = await fetchPublishedRuleSet(riskRuleSetId, authorizationHeader);
    if (!ruleSet) {
      throw notFound("No published rule pack version found for this form's risk rule set.");
    }

    return {
      ruleSetId: riskRuleSetId,
      ruleVersionId: ruleSet.id,
      versionNo: ruleSet.versionNo,
      rulesJson: ruleSet.rulesJson,
    };
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

  async createSubmission(
    formCode: string,
    dto: CreateSubmissionInput,
    submittedByUserId: string,
    authorizationHeader: string,
  ) {
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
    const violations = validateSubmission(fields, crossFieldRules, dto.formData);

    if (violations.length) {
      throw unprocessable('Submission failed validation.', { violations });
    }

    // Decompose the validated payload into normalized per-question rows so
    // every submitted field is individually queryable (ERD design stance,
    // line 19), driven by each field's declared input_type — no hardcoding.
    const formAnswers = buildFormAnswers(fields, dto.formData);

    const created = await this.repository.createSubmission({
      formVersionId: dto.formVersionId,
      beneficiaryId: dto.beneficiaryId,
      visitId: dto.visitId ?? null,
      submittedByUserId,
      localSubmissionUuid: dto.localSubmissionUuid,
      formDataJson: dto.formData,
      validationStatus: 'VALID',
      formAnswers,
    });

    // Promote the socio-demographic answers into beneficiary-service, which
    // owns them as structured columns (the registration form re-asks them so
    // the Sakhi sees one continuous questionnaire). Best-effort and awaited
    // after the submission is durably saved — see syncSocioDemographics.
    if (formCode === 'MOTHER_REGISTRATION') {
      await syncSocioDemographics(dto.beneficiaryId, dto.formData, authorizationHeader);
      await syncHealthHistory(dto.beneficiaryId, dto.formData, authorizationHeader);
    }

    // Triggers the risk-grading pipeline for every visit-linked submission
    // whose form has a risk_rule_set_id configured (see FormDefinition's
    // schema comment) — a form with no ruleSetId set (e.g. SUPERVISOR/SYSTEM
    // entityType forms) simply has nothing to evaluate. Best-effort, same
    // stance as syncSocioDemographics above.
    if (dto.visitId && version.formDefinition.riskRuleSetId) {
      await triggerRiskAssessment(
        {
          beneficiaryId: dto.beneficiaryId,
          visitId: dto.visitId,
          submissionId: created.id,
          ruleSetId: version.formDefinition.riskRuleSetId,
          answers: dto.formData,
        },
        authorizationHeader,
      );
    }

    return toApiFormSubmission(created);
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
