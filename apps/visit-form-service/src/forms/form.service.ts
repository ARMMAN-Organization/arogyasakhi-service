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
import { findBeneficiaryById } from '../beneficiaries/beneficiary.client';
import { createChildBeneficiary } from '../beneficiaries/create-child.client';
import { updateBeneficiaryPhase } from '../beneficiaries/update-phase.client';
import { createClosure, resolveClosureReasonLookupId } from '../closures/closure.client';
import { getAncestorChain } from '../geography/geography.client';
import { triggerRiskAssessment } from '../risk-assessments/riskAssessment.client';

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
    if (existing) {
      const childBeneficiaryIds =
        formCode === 'DELIVERY_VISIT'
          ? await this.resolveDeliveryChildren(dto, existing.beneficiaryId, authorizationHeader)
          : undefined;
      if (formCode === 'ANC_CLOSURE_VISIT' || formCode === 'CHILD_CLOSURE_VISIT') {
        // Re-run on replay same as resolveDeliveryChildren above — createClosure
        // derives a deterministic localClosureUuid from localSubmissionUuid, so
        // a repeat call resolves to the same closure via closure-reopen-service's
        // own idempotency check rather than creating a duplicate.
        await toleratePhaseAdvance(
          this.resolveClosureRequest(
            dto,
            existing.beneficiaryId,
            submittedByUserId,
            authorizationHeader,
          ),
        );
      }
      return toApiFormSubmission(existing, childBeneficiaryIds);
    }

    const version = await this.repository.findVersionById(dto.formVersionId);
    if (!version) throw notFound('Form version not found.');
    if (version.formDefinition.formCode !== formCode) {
      throw badRequest('formVersionId does not belong to this form code.');
    }
    if (version.status !== 'PUBLISHED') {
      throw badRequest('Form version is not published.');
    }

    // Client-supplied visitId can be stale (a race between the visit's own
    // POST /visits and this submission, or a bad replay) — check before the
    // insert so this fails as a clean, named 404 instead of an unhandled FK
    // violation. See createSubmission's P2003 catch below for the remaining
    // check-then-insert race window this can't close on its own.
    if (dto.visitId) {
      const visit = await this.repository.findVisitById(dto.visitId);
      if (!visit) throw notFound('Visit not found.');
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

    let created;
    try {
      created = await this.repository.createSubmission({
        formVersionId: dto.formVersionId,
        beneficiaryId: dto.beneficiaryId,
        visitId: dto.visitId ?? null,
        submittedByUserId,
        localSubmissionUuid: dto.localSubmissionUuid,
        formDataJson: dto.formData,
        validationStatus: 'VALID',
        formAnswers,
      });
    } catch (err) {
      // Backstop for the race the check above can't close on its own: the
      // visit existed at check time but was gone by the time this insert ran.
      // Same "fail loud, named 404" contract either way, not a 500.
      if (isForeignKeyViolation(err)) throw notFound('Visit not found.');
      throw err;
    }

    // Promote the socio-demographic answers into beneficiary-service, which
    // owns them as structured columns (the registration form re-asks them so
    // the Sakhi sees one continuous questionnaire). Best-effort and awaited
    // after the submission is durably saved — see syncSocioDemographics.
    if (formCode === 'MOTHER_REGISTRATION') {
      await syncSocioDemographics(dto.beneficiaryId, dto.formData, authorizationHeader);
      await syncHealthHistory(dto.beneficiaryId, dto.formData, authorizationHeader);
    }

    // Auto-creates a CHILD beneficiary case for each live-born child on a
    // Delivery submission (SRS: "Delivery form... auto-creates the child
    // profile on submission") and returns their ids so the caller can
    // prefill the new child's records in the same mobile session — see
    // resolveDeliveryChildren for the per-child best-effort details.
    const childBeneficiaryIds =
      formCode === 'DELIVERY_VISIT'
        ? await this.resolveDeliveryChildren(dto, dto.beneficiaryId, authorizationHeader)
        : undefined;

    // Closes the loop the SRS's closure flow otherwise leaves open:
    // submitting ANC_CLOSURE_VISIT/CHILD_CLOSURE_VISIT alone has no effect on
    // the beneficiary's own record — see resolveClosureRequest for the
    // continue_with_closure gate and reason-mapping details. Best-effort,
    // same tolerance as the phase-advance calls above.
    if (formCode === 'ANC_CLOSURE_VISIT' || formCode === 'CHILD_CLOSURE_VISIT') {
      await toleratePhaseAdvance(
        this.resolveClosureRequest(dto, dto.beneficiaryId, submittedByUserId, authorizationHeader),
      );
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

    return toApiFormSubmission(created, childBeneficiaryIds);
  }

  /**
   * Resolves the CHILD beneficiary case(s) for a DELIVERY_VISIT submission —
   * one createChildBeneficiary() call per childN_* block whose delivery
   * outcome is LIVE_BIRTH, independent and best-effort per child so one
   * failing call (e.g. in a twin/triplet birth) never blocks the others or
   * the already-saved submission. Also advances the mother's phase to PP and
   * each created child's phase to NN (CR-041) — a phase-advance failure never
   * drops that child's id from the result, since the id already exists by
   * the time phase-advance is attempted.
   *
   * Deliberately re-run on an idempotent replay (same localSubmissionUuid) as
   * well as on first submission: createChildBeneficiary is itself idempotent
   * on its deterministic per-child localCaseUuid (beneficiary-service's own
   * POST /beneficiaries dedup), so a replay resolves to the same child ids
   * that were created the first time, without creating duplicates — this is
   * what lets a retried submission still return childBeneficiaryIds instead
   * of the caller having no way to find the child it already created.
   *
   * `beneficiaryId` is a separate parameter (not read off `dto`) so a replay
   * call site can pass the originally-stored `existing.beneficiaryId`
   * instead of trusting the retry request's own body — same reasoning
   * resolveClosureRequest already applies to its own replay call site; a
   * retried request with a swapped beneficiaryId in its body must not run
   * child-creation against a different beneficiary than the one actually
   * recorded.
   */
  private async resolveDeliveryChildren(
    dto: CreateSubmissionInput,
    beneficiaryId: string,
    authorizationHeader: string,
  ): Promise<string[] | undefined> {
    // Unlike every other downstream call in createSubmission
    // (createChildBeneficiary, updateBeneficiaryPhase, createClosure, risk/
    // socio-demographic/health-history syncs), findBeneficiaryById throws
    // (badGateway) on anything but a 404 — caught here so a transient
    // beneficiary-service failure can't turn an already-durably-saved
    // submission into a failed HTTP response; only a genuine 404 (no
    // motherCase) is expected to short-circuit this method.
    let motherCase;
    try {
      motherCase = await findBeneficiaryById(beneficiaryId, authorizationHeader);
    } catch (err) {
      console.warn(
        `Unable to resolve mother beneficiary ${dto.beneficiaryId} for DELIVERY_VISIT ` +
          `child auto-creation; the submission itself was still saved. ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
      return undefined;
    }
    if (!motherCase) return undefined;

    const dateOfDelivery = dto.formData.date_of_delivery
      ? new Date(String(dto.formData.date_of_delivery))
      : null;
    const childPrefixes = ['child1', 'child2', 'child3'] as const;
    const SEX_MAP: Record<string, 'MALE' | 'FEMALE' | 'INTERSEX_OTHER'> = {
      male: 'MALE',
      female: 'FEMALE',
      intersex_other: 'INTERSEX_OTHER',
    };

    const childIds = await Promise.all(
      childPrefixes.map(async (prefix) => {
        const outcome = dto.formData[`${prefix}_delivery_outcome`];
        if (outcome !== 'live_birth' || !dateOfDelivery) return undefined;

        const sexCode = dto.formData[`${prefix}_sex_of_baby`];
        const birthWeightKg = dto.formData[`${prefix}_birth_weight_kg`];
        const birthLengthCm = dto.formData[`${prefix}_birth_length_cm`];

        const childId = await createChildBeneficiary(
          {
            motherCase,
            // Deterministic per child so a dropped-connection retry of this
            // specific call, or a full submission replay, lands on the same
            // case instead of creating a duplicate.
            localCaseUuid: `${dto.localSubmissionUuid}-${prefix}`,
            registrationDate: dateOfDelivery,
            dateOfBirth: dateOfDelivery,
            sex: typeof sexCode === 'string' ? SEX_MAP[sexCode] : undefined,
            birthWeightKg:
              typeof birthWeightKg === 'number' || typeof birthWeightKg === 'string'
                ? Number(birthWeightKg)
                : undefined,
            birthLengthCm:
              typeof birthLengthCm === 'number' || typeof birthLengthCm === 'string'
                ? Number(birthLengthCm)
                : undefined,
          },
          authorizationHeader,
        );

        // Only for a child that actually got created — a failed
        // createChildBeneficiary call above already logged its own warning;
        // there is no case here to advance. The phase-advance call is
        // tolerated separately so its failure never drops childId from the
        // result — the id is already resolved by this point.
        if (childId) {
          // updateBeneficiaryPhase already logs its own warning on a non-2xx
          // response; toleratePhaseAdvance only guards against the call
          // rejecting outright (e.g. a thrown network error) so it can never
          // take down submission handling — same best-effort stance as
          // createChildBeneficiary above.
          await toleratePhaseAdvance(updateBeneficiaryPhase(childId, 'NN', authorizationHeader));
        }

        return childId ?? undefined;
      }),
    );

    // Mother's phase always advances once a DELIVERY_VISIT is recorded,
    // independent of whether any child case above succeeded — the mother's
    // own journey (ANC -> PP) doesn't depend on a child profile existing
    // (CR-041). Tolerated the same way as the per-child calls above.
    await toleratePhaseAdvance(
      updateBeneficiaryPhase(dto.beneficiaryId, 'PP', authorizationHeader),
    );

    return childIds.filter((id): id is string => id !== undefined);
  }

  /**
   * Auto-creates a closure via closure-reopen-service's POST /closures on an
   * ANC_CLOSURE_VISIT/CHILD_CLOSURE_VISIT submission — without this, the
   * closure form's own answers are saved (this service's job), but the
   * beneficiary's currentStatus never advances, since nothing else calls
   * POST /closures on the Sakhi's behalf.
   *
   * Skips entirely when continue_with_closure isn't 'yes' — the form's own
   * visibleWhen gating means every closure-relevant field is absent/moot in
   * that case (a Sakhi who backed out of the closure decision on this
   * screen), so there is nothing to close.
   *
   * closureType (MEDICAL/NON_MEDICAL/PROGRAM_COMPLETION) is derived from the
   * resolved CLOSURE_REASON lookup valueCode, not asked separately on the
   * form — MEDICAL for death/miscarriage/abortion reasons, PROGRAM_COMPLETION
   * for program-cycle-completed, NON_MEDICAL for everything else (withdrawal,
   * migration). supervisorStatus: 'PENDING' is set only for MIGRATION,
   * matching POST /closures' own existing review-gating rule — every other
   * reason closes the beneficiary immediately.
   *
   * An unrecognized/missing closure_reason value skips the call rather than
   * throwing — the form submission itself is already valid and saved; a
   * reason-mapping gap is a follow-up/ops concern, not a reason to fail an
   * otherwise-successful submission.
   */
  private async resolveClosureRequest(
    dto: CreateSubmissionInput,
    beneficiaryId: string,
    submittedByUserId: string,
    authorizationHeader: string,
  ): Promise<void> {
    if (dto.formData.continue_with_closure !== 'yes') return;

    const closureReasonCode = dto.formData.closure_reason;
    if (typeof closureReasonCode !== 'string') return;

    const closureReasonLookupValueId = await resolveClosureReasonLookupId(
      closureReasonCode,
      authorizationHeader,
    );
    if (!closureReasonLookupValueId) return;

    const MEDICAL_REASONS = new Set([
      'miscarriage',
      'abortion_spontaneous_induced_mtp',
      'maternal_death',
      'infant_child_death',
    ]);
    const closureType =
      closureReasonCode === 'program_cycle_completed'
        ? 'PROGRAM_COMPLETION'
        : MEDICAL_REASONS.has(closureReasonCode)
          ? 'MEDICAL'
          : 'NON_MEDICAL';

    const closureDate = dto.formData.closure_visit_date;
    if (typeof closureDate !== 'string') return;
    const eventDate = dto.formData.date_of_event;

    await createClosure(
      {
        // Deterministic so a dropped-connection retry of this specific call,
        // or a full submission replay, resolves to the same closure via
        // closure-reopen-service's own localClosureUuid dedup instead of
        // creating a duplicate.
        localClosureUuid: `${dto.localSubmissionUuid}-closure`,
        beneficiaryId,
        closureType,
        closureReasonLookupValueId,
        eventDate: typeof eventDate === 'string' ? eventDate : undefined,
        closureDate,
        submittedByUserId,
        ...(closureReasonCode === 'migration' ? { supervisorStatus: 'PENDING' as const } : {}),
      },
      authorizationHeader,
    );
  }
}

/**
 * Swallows a rejected updateBeneficiaryPhase call so it can never fail
 * submission handling — the client itself already logs a warning on a
 * non-2xx response; this only guards against the call rejecting outright.
 */
async function toleratePhaseAdvance(call: Promise<void>): Promise<void> {
  await Promise.resolve(call).catch(() => undefined);
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

/** Narrows a caught Prisma error to a foreign-key violation (P2003). */
function isForeignKeyViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2003'
  );
}
