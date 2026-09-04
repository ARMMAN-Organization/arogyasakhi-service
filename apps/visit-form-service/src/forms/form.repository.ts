import type { PrismaService } from '../prisma/prisma.service';
import type { FormAnswerRow } from './form.mapper';

export interface CreateVersionData {
  formDefinitionId: string;
  versionNo: string;
  schemaJson: unknown;
  validationJson: unknown;
  checksum: Buffer;
  effectiveFrom: Date;
}

export interface UpdateDraftData {
  schemaJson: unknown;
  validationJson: unknown;
  checksum: Buffer;
}

export interface CreateSubmissionData {
  formVersionId: string;
  beneficiaryId: string;
  visitId: string | null;
  submittedByUserId: string;
  localSubmissionUuid: string;
  formDataJson: unknown;
  validationStatus: 'VALID' | 'INVALID' | 'WARNING';
  /**
   * Normalized per-question rows decomposed from formDataJson (see
   * buildFormAnswers). Written to form_answers in the same transaction as the
   * submission so a submission can never persist without its answers.
   */
  formAnswers: FormAnswerRow[];
}

/**
 * Data access for form_definitions/form_versions/form_submissions/form_answers
 * — the only tables this repository touches (forklift rule).
 */
export class FormRepository {
  constructor(private readonly prisma: PrismaService) {}

  findDefinitionByCode(formCode: string) {
    return this.prisma.formDefinition.findUnique({ where: { formCode } });
  }

  /** The currently effective PUBLISHED version for a form code, as of `asOf`. */
  findActiveVersion(formCode: string, asOf: Date) {
    return this.prisma.formVersion.findFirst({
      where: {
        formDefinition: { formCode },
        status: 'PUBLISHED',
        effectiveFrom: { lte: asOf },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  findVersionById(versionId: string) {
    return this.prisma.formVersion.findUnique({
      where: { id: versionId },
      include: { formDefinition: true },
    });
  }

  /** The version currently PUBLISHED (and not yet retired) for a form definition, if any. */
  findCurrentlyPublished(formDefinitionId: string) {
    return this.prisma.formVersion.findFirst({
      where: { formDefinitionId, status: 'PUBLISHED', effectiveTo: null },
    });
  }

  countVersions(formDefinitionId: string) {
    return this.prisma.formVersion.count({ where: { formDefinitionId } });
  }

  createDraft(data: CreateVersionData) {
    return this.prisma.formVersion.create({
      data: {
        formDefinitionId: data.formDefinitionId,
        versionNo: data.versionNo,
        schemaJson: data.schemaJson as never,
        validationJson: data.validationJson as never,
        checksum: data.checksum,
        effectiveFrom: data.effectiveFrom,
        status: 'DRAFT',
      },
    });
  }

  updateDraft(versionId: string, data: UpdateDraftData) {
    return this.prisma.formVersion.update({
      where: { id: versionId },
      data: {
        schemaJson: data.schemaJson as never,
        validationJson: data.validationJson as never,
        checksum: data.checksum,
      },
    });
  }

  /** Publishes `versionId` and retires `previousVersionId` (if any) atomically. */
  async publish(
    versionId: string,
    effectiveFrom: Date,
    previousVersionId: string | null,
    publishedByUserId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (previousVersionId) {
        await tx.formVersion.update({
          where: { id: previousVersionId },
          data: { status: 'RETIRED', effectiveTo: effectiveFrom },
        });
      }
      return tx.formVersion.update({
        where: { id: versionId },
        data: { status: 'PUBLISHED', effectiveFrom, publishedByUserId },
      });
    });
  }

  findSubmissionByLocalUuid(localSubmissionUuid: string) {
    return this.prisma.formSubmission.findUnique({ where: { localSubmissionUuid } });
  }

  /**
   * A submission by id, with its form version's schema/formCode attached —
   * used by updateSubmissionAnswers to resolve which allowlist applies and
   * to validate the submitted formData shape against the active schema.
   */
  findSubmissionById(id: string) {
    return this.prisma.formSubmission.findFirst({
      where: { id, isDeleted: false },
      include: { formVersion: { include: { formDefinition: true } } },
    });
  }

  /**
   * Patches `formDataJson` (merging just the edited keys into the existing
   * blob) and upserts each edited field's normalized form_answers row,
   * atomically — the raw payload and its per-question projection can never
   * diverge, same guarantee createSubmission's own transaction gives.
   *
   * Each answer row is upserted by (submissionId, fieldCode) rather than a
   * Prisma-level `upsert()` — form_answers has no unique constraint on that
   * pair (only a non-unique index; see schema.prisma's own comment on why),
   * so `updateMany` + a conditional `create` is used instead: update every
   * row matching (submissionId, fieldCode), and create one if none existed
   * (e.g. this field's answer was previously null/absent, so buildFormAnswers
   * never wrote it the first time — or the field is a BENEFICIARY_DUPLICATED_
   * FIELD_CODES entry that never gets a form_answers row at all, in which
   * case `answerRows` simply won't include it and this loop is a no-op for
   * that field's typed-column projection, while formDataJson is still
   * patched).
   */
  async updateSubmissionAnswers(
    submissionId: string,
    mergedFormDataJson: Record<string, unknown>,
    answerRows: FormAnswerRow[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      const submission = await tx.formSubmission.update({
        where: { id: submissionId },
        data: { formDataJson: mergedFormDataJson as never },
      });

      for (const row of answerRows) {
        const updateResult = await tx.formAnswer.updateMany({
          where: { submissionId, fieldCode: row.fieldCode, isDeleted: false },
          data: {
            answerValueText: row.answerValueText,
            answerValueNumber: row.answerValueNumber,
            answerValueDate: row.answerValueDate,
            answerValueBool: row.answerValueBool,
            answerValueJson: row.answerValueJson as never,
          },
        });
        if (updateResult.count === 0) {
          await tx.formAnswer.create({
            data: {
              submissionId,
              fieldCode: row.fieldCode,
              answerValueText: row.answerValueText,
              answerValueNumber: row.answerValueNumber,
              answerValueDate: row.answerValueDate,
              answerValueBool: row.answerValueBool,
              answerValueJson: row.answerValueJson as never,
              isIndexed: row.isIndexed,
            },
          });
        }
      }

      return submission;
    });
  }

  /**
   * The most recent submission for `beneficiaryId` against `formCode`'s
   * form_definition, regardless of which version it was answered under —
   * used to fetch a one-time form's answers (e.g. MOTHER_REGISTRATION) for
   * a server-to-server caller that needs data captured outside the
   * caller's own recurring visit form (see risk-referral-service's ANC
   * risk grading, which needs Age/Bad-Obstetric-History from registration
   * alongside the current ANC_VISIT's own vitals).
   */
  findLatestSubmissionByBeneficiaryAndFormCode(beneficiaryId: string, formCode: string) {
    return this.prisma.formSubmission.findFirst({
      where: { beneficiaryId, isDeleted: false, formVersion: { formDefinition: { formCode } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * How many non-deleted submissions exist for `beneficiaryId` against
   * `formCode`'s form_definition — used to detect "this is the
   * beneficiary's first-ever submission of this form" (e.g. Primigravida's
   * first-ANC-visit-only health-education gate) by counting AFTER the
   * current submission's own insert, so a count of exactly 1 means this
   * submission is the first (findLatestSubmissionByBeneficiaryAndFormCode
   * can't answer this on its own — it would always return the just-inserted
   * row itself).
   */
  countSubmissionsByBeneficiaryAndFormCode(beneficiaryId: string, formCode: string) {
    return this.prisma.formSubmission.count({
      where: { beneficiaryId, isDeleted: false, formVersion: { formDefinition: { formCode } } },
    });
  }

  /**
   * The most recent visit-linked submission for `beneficiaryId` across the
   * clinical-visit form codes that actually capture vitals (ANC_VISIT,
   * POSTPARTUM_VISIT, NEONATAL_VISIT, INC_VISIT, CCV_VISIT — see
   * vitalsExtractor.ts's own FORM_CODE_TO_VITALS_MAPPING for why exactly
   * these and not e.g. *_CLOSURE_VISIT, which capture no vitals fields) —
   * used by GET /beneficiaries/:beneficiaryId/latest-visit-vitals. Ordered
   * by submittedAt, not the visit's own scheduledDate, since a Sakhi may
   * submit a visit's form days after conducting it and `submittedAt` is
   * this table's own reliable timestamp regardless of that lag. Excludes
   * non-visit-linked submissions (visitId null) — those are one-time forms
   * like MOTHER_REGISTRATION, not part of the visit history this endpoint
   * surfaces.
   */
  findLatestVisitSubmission(beneficiaryId: string) {
    return this.prisma.formSubmission.findFirst({
      where: {
        beneficiaryId,
        isDeleted: false,
        visitId: { not: null },
        formVersion: {
          formDefinition: {
            formCode: {
              in: ['ANC_VISIT', 'POSTPARTUM_VISIT', 'NEONATAL_VISIT', 'INC_VISIT', 'CCV_VISIT'],
            },
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
      include: { formVersion: { include: { formDefinition: true } } },
    });
  }

  /**
   * The mother's most recent DELIVERY_VISIT submission, if any — used by
   * GET /beneficiaries/:beneficiaryId/delivery-outcomes so beneficiary-service
   * can check for a stillbirth outcome before creating a new CHILD case for
   * that mother (see resolveDeliveryChildren's own outcome !== 'live_birth'
   * guard, which this endpoint mirrors for the cross-service case). A mother
   * can only have one live DELIVERY_VISIT submission at a time in practice,
   * but `findFirst`/`orderBy: submittedAt desc` is used defensively, same
   * pattern as findLatestVisitSubmission above.
   */
  findLatestDeliverySubmission(beneficiaryId: string) {
    return this.prisma.formSubmission.findFirst({
      where: {
        beneficiaryId,
        isDeleted: false,
        formVersion: { formDefinition: { formCode: 'DELIVERY_VISIT' } },
      },
      orderBy: { submittedAt: 'desc' },
    });
  }

  /**
   * Existence + ownership check for a visit-linked submission's visitId,
   * before the insert — visit_instances is owned by this same service
   * (unlike beneficiary_cases/form_versions' cross-service equivalents), so
   * this is a direct query, not an HTTP call. Filters on beneficiaryId too,
   * not just id — without it, a client could submit beneficiaryId "A" with a
   * real, non-deleted visitId that actually belongs to a different
   * beneficiary "B", and this check would wrongly pass.
   *
   * Duplicates VisitInstanceRepository.findById's shape (same table, same
   * isDeleted convention) rather than importing that repository — this
   * service composes one FormRepository per its own doc comment ("the only
   * tables this repository touches"), and introducing a cross-repository
   * dependency for one extra filter isn't worth breaking that.
   */
  findVisitById(id: string, beneficiaryId: string) {
    return this.prisma.visitInstance.findFirst({ where: { id, beneficiaryId, isDeleted: false } });
  }

  /**
   * Persists the submission and its normalized form_answers rows atomically:
   * the submission and every answer row commit together or not at all, so the
   * raw form_data_json and its per-question projection can never diverge.
   */
  createSubmission(data: CreateSubmissionData) {
    return this.prisma.$transaction(async (tx) => {
      const submission = await tx.formSubmission.create({
        data: {
          formVersionId: data.formVersionId,
          beneficiaryId: data.beneficiaryId,
          visitId: data.visitId,
          submittedByUserId: data.submittedByUserId,
          submittedAt: new Date(),
          localSubmissionUuid: data.localSubmissionUuid,
          formDataJson: data.formDataJson as never,
          validationStatus: data.validationStatus,
        },
      });

      if (data.formAnswers.length) {
        await tx.formAnswer.createMany({
          data: data.formAnswers.map((a) => ({
            submissionId: submission.id,
            fieldCode: a.fieldCode,
            answerValueText: a.answerValueText,
            answerValueNumber: a.answerValueNumber,
            answerValueDate: a.answerValueDate,
            answerValueBool: a.answerValueBool,
            answerValueJson: a.answerValueJson as never,
            isIndexed: a.isIndexed,
          })),
        });
      }

      return submission;
    });
  }
}
