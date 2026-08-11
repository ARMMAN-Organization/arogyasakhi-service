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
      include: { formDefinition: true },
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
