/**
 * ccvOpeningRiskState.resolver.ts (jest.mock()'d below) imports appConfig
 * from ../config/app-config, which calls process.exit(1) at module-load
 * time if DATABASE_URL isn't a valid URL — jest.mock() still requires the
 * real module once to build its automatic mock, so this must be set before
 * any import below (see reporting-etl-service's info.controller.spec.ts and
 * risk-referral-service's riskCondition.controller.spec.ts for the same
 * workaround).
 */
process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/test';

import { FormService } from './form.service';
import type { FormRepository } from './form.repository';
import type { VisitInstanceRepository } from '../visits/visitInstance.repository';
import type { AuditClient } from './audit.client';
import * as geographyClient from '../geography/geography.client';
import { syncSocioDemographics } from '../beneficiaries/socio-demographics.client';
import { syncHealthHistory } from '../beneficiaries/health-history.client';
import { findBeneficiaryById, findBeneficiaryOwnership } from '../beneficiaries/beneficiary.client';
import { createChildBeneficiary } from '../beneficiaries/create-child.client';
import { updateBeneficiaryPhase } from '../beneficiaries/update-phase.client';
import { createClosure, resolveClosureReasonLookupId } from '../closures/closure.client';
import { triggerRiskAssessment } from '../risk-assessments/riskAssessment.client';
import { resolveAndWriteCcvOpeningRiskState } from './ccvOpeningRiskState.resolver';
import { resolveVisitCompletion } from './visitCompletion.resolver';
import { resolveHealthEducationMessagesByStage } from './healthEducation.client';

jest.mock('../geography/geography.client');
jest.mock('../beneficiaries/socio-demographics.client');
jest.mock('../beneficiaries/health-history.client');
jest.mock('../beneficiaries/beneficiary.client');
jest.mock('../beneficiaries/create-child.client');
jest.mock('../beneficiaries/update-phase.client');
jest.mock('../closures/closure.client');
jest.mock('../risk-assessments/riskAssessment.client');
jest.mock('./ccvOpeningRiskState.resolver');
jest.mock('./visitCompletion.resolver');
jest.mock('./healthEducation.client');

describe('FormService', () => {
  const repository = {
    findDefinitionByCode: jest.fn(),
    findActiveVersion: jest.fn(),
    findVersionById: jest.fn(),
    findCurrentlyPublished: jest.fn(),
    countVersions: jest.fn(),
    createDraft: jest.fn(),
    updateDraft: jest.fn(),
    publish: jest.fn(),
    findSubmissionByLocalUuid: jest.fn(),
    createSubmission: jest.fn(),
    findVisitById: jest.fn(),
    findLatestSubmissionByBeneficiaryAndFormCode: jest.fn(),
    countSubmissionsByBeneficiaryAndFormCode: jest.fn(),
    findLatestVisitSubmission: jest.fn(),
    findLatestDeliverySubmission: jest.fn(),
    findSubmissionById: jest.fn(),
    updateSubmissionAnswers: jest.fn(),
  } as unknown as jest.Mocked<FormRepository>;
  const visitInstanceRepository = {
    findRecentCompletedIncVisits: jest.fn(),
    findAllCompletedInfantVisitIds: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
  } as unknown as jest.Mocked<VisitInstanceRepository>;
  const auditClient = { log: jest.fn() } as unknown as jest.Mocked<AuditClient>;
  let service: FormService;

  beforeEach(() => {
    jest.resetAllMocks();
    // Safe defaults so tests unrelated to the stage-based health-education
    // feature don't need to know about it — real content only in the
    // dedicated describe block below.
    jest.mocked(resolveHealthEducationMessagesByStage).mockResolvedValue([]);
    repository.countSubmissionsByBeneficiaryAndFormCode.mockResolvedValue(1);
    service = new FormService(repository, visitInstanceRepository, auditClient);
  });

  describe('getActiveVersion', () => {
    it('returns the active version (API-projected) for a form code', async () => {
      const version = {
        id: 'v1',
        versionNo: 'v1',
        status: 'PUBLISHED',
        checksum: Buffer.from('x'),
      };
      repository.findActiveVersion.mockResolvedValue(version as never);

      const result = await service.getActiveVersion(
        'MOTHER_REGISTRATION',
        new Date(),
        null,
        'Bearer test-token',
      );

      expect(result).toEqual(expect.objectContaining({ id: 'v1', status: 'PUBLISHED' }));
      // Internal columns must not leak into the API response.
      expect(result).not.toHaveProperty('checksum');
      // No geographyUnitId on the caller -> no cross-service lookup, no field.
      expect(result).not.toHaveProperty('geography');
    });

    it('throws not-found when no published version exists', async () => {
      repository.findActiveVersion.mockResolvedValue(null);
      await expect(
        service.getActiveVersion('MOTHER_REGISTRATION', new Date(), null, 'Bearer test-token'),
      ).rejects.toThrow(/No published form version/);
    });

    it("attaches the caller's geography chain when they have a geographyUnitId assigned", async () => {
      const version = {
        id: 'v1',
        versionNo: 'v1',
        status: 'PUBLISHED',
        checksum: Buffer.from('x'),
      };
      repository.findActiveVersion.mockResolvedValue(version as never);
      const chain = [
        {
          geographyUnitId: 'pada-1',
          geoType: 'PADA',
          parentId: 'village-1',
          geoCode: 'PADA-001',
          name: 'Sample Pada',
          status: 'ACTIVE',
        },
      ];
      jest.spyOn(geographyClient, 'getAncestorChain').mockResolvedValue(chain as never);

      const result = await service.getActiveVersion(
        'MOTHER_REGISTRATION',
        new Date(),
        'pada-1',
        'Bearer test-token',
      );

      expect(geographyClient.getAncestorChain).toHaveBeenCalledWith('pada-1', 'Bearer test-token');
      // Only geographyUnitId/geoType/name are exposed — parentId/geoCode/status dropped.
      expect(result).toEqual(
        expect.objectContaining({
          geography: [{ geographyUnitId: 'pada-1', geoType: 'PADA', name: 'Sample Pada' }],
        }),
      );
    });

    describe('NEONATAL_VISIT prefilledContext.kmcEligible', () => {
      const version = {
        id: 'v1',
        versionNo: 'v1',
        status: 'PUBLISHED',
        checksum: Buffer.from('x'),
      };

      it('omits prefilledContext entirely when no beneficiaryId is given', async () => {
        repository.findActiveVersion.mockResolvedValue(version as never);

        const result = await service.getActiveVersion(
          'NEONATAL_VISIT',
          new Date(),
          null,
          'Bearer test-token',
        );

        expect(result).not.toHaveProperty('prefilledContext');
        expect(repository.findLatestSubmissionByBeneficiaryAndFormCode).not.toHaveBeenCalled();
      });

      it('does not look up prefilledContext for a formCode other than NEONATAL_VISIT, even with a beneficiaryId', async () => {
        repository.findActiveVersion.mockResolvedValue(version as never);

        const result = await service.getActiveVersion(
          'ANC_VISIT',
          new Date(),
          null,
          'Bearer test-token',
          'ben-1',
        );

        expect(result).not.toHaveProperty('prefilledContext');
        expect(repository.findLatestSubmissionByBeneficiaryAndFormCode).not.toHaveBeenCalled();
      });

      it('resolves kmcEligible: false when the beneficiary has no DELIVERY_VISIT submission', async () => {
        repository.findActiveVersion.mockResolvedValue(version as never);
        repository.findLatestSubmissionByBeneficiaryAndFormCode.mockResolvedValue(null);

        const result = await service.getActiveVersion(
          'NEONATAL_VISIT',
          new Date(),
          null,
          'Bearer test-token',
          'ben-1',
        );

        expect(repository.findLatestSubmissionByBeneficiaryAndFormCode).toHaveBeenCalledWith(
          'ben-1',
          'DELIVERY_VISIT',
        );
        expect(result).toEqual(
          expect.objectContaining({ prefilledContext: { kmcEligible: false } }),
        );
        expect(findBeneficiaryById).not.toHaveBeenCalled();
      });

      it('resolves kmcEligible: false when birth weight >= 2.5kg and term is full_term, without looking up the beneficiary DOB', async () => {
        repository.findActiveVersion.mockResolvedValue(version as never);
        repository.findLatestSubmissionByBeneficiaryAndFormCode.mockResolvedValue({
          formDataJson: { child1_birth_weight_kg: 3.2, term_of_delivery: 'full_term' },
        } as never);

        const result = await service.getActiveVersion(
          'NEONATAL_VISIT',
          new Date(),
          null,
          'Bearer test-token',
          'ben-1',
        );

        expect(result).toEqual(
          expect.objectContaining({ prefilledContext: { kmcEligible: false } }),
        );
        expect(findBeneficiaryById).not.toHaveBeenCalled();
      });

      it('resolves kmcEligible: true for low birth weight (<2.5kg) when the baby is <=2 months old', async () => {
        repository.findActiveVersion.mockResolvedValue(version as never);
        repository.findLatestSubmissionByBeneficiaryAndFormCode.mockResolvedValue({
          formDataJson: { child1_birth_weight_kg: 2.0, term_of_delivery: 'full_term' },
        } as never);
        jest.mocked(findBeneficiaryById).mockResolvedValue({
          childDateOfBirth: '2026-07-01T00:00:00.000Z',
        } as never);

        const result = await service.getActiveVersion(
          'NEONATAL_VISIT',
          new Date('2026-08-01T00:00:00.000Z'),
          null,
          'Bearer test-token',
          'ben-1',
        );

        expect(result).toEqual(
          expect.objectContaining({ prefilledContext: { kmcEligible: true } }),
        );
      });

      it('resolves kmcEligible: true for a preterm delivery regardless of birth weight, when the baby is <=2 months old', async () => {
        repository.findActiveVersion.mockResolvedValue(version as never);
        repository.findLatestSubmissionByBeneficiaryAndFormCode.mockResolvedValue({
          formDataJson: { child1_birth_weight_kg: 3.0, term_of_delivery: 'pre_term' },
        } as never);
        jest.mocked(findBeneficiaryById).mockResolvedValue({
          childDateOfBirth: '2026-07-01T00:00:00.000Z',
        } as never);

        const result = await service.getActiveVersion(
          'NEONATAL_VISIT',
          new Date('2026-08-01T00:00:00.000Z'),
          null,
          'Bearer test-token',
          'ben-1',
        );

        expect(result).toEqual(
          expect.objectContaining({ prefilledContext: { kmcEligible: true } }),
        );
      });

      it('resolves kmcEligible: false when otherwise eligible but the baby is older than 2 months', async () => {
        repository.findActiveVersion.mockResolvedValue(version as never);
        repository.findLatestSubmissionByBeneficiaryAndFormCode.mockResolvedValue({
          formDataJson: { child1_birth_weight_kg: 2.0, term_of_delivery: 'full_term' },
        } as never);
        jest.mocked(findBeneficiaryById).mockResolvedValue({
          childDateOfBirth: '2026-01-01T00:00:00.000Z',
        } as never);

        const result = await service.getActiveVersion(
          'NEONATAL_VISIT',
          new Date('2026-08-01T00:00:00.000Z'),
          null,
          'Bearer test-token',
          'ben-1',
        );

        expect(result).toEqual(
          expect.objectContaining({ prefilledContext: { kmcEligible: false } }),
        );
      });

      it('resolves kmcEligible: false (fail closed) when the beneficiary/DOB cannot be resolved', async () => {
        repository.findActiveVersion.mockResolvedValue(version as never);
        repository.findLatestSubmissionByBeneficiaryAndFormCode.mockResolvedValue({
          formDataJson: { child1_birth_weight_kg: 2.0, term_of_delivery: 'full_term' },
        } as never);
        jest.mocked(findBeneficiaryById).mockResolvedValue(null);

        const result = await service.getActiveVersion(
          'NEONATAL_VISIT',
          new Date('2026-08-01T00:00:00.000Z'),
          null,
          'Bearer test-token',
          'ben-1',
        );

        expect(result).toEqual(
          expect.objectContaining({ prefilledContext: { kmcEligible: false } }),
        );
      });
    });
  });

  describe('createDraft', () => {
    it('creates a draft with an auto-incremented version number', async () => {
      repository.findDefinitionByCode.mockResolvedValue({ id: 'def-1' } as never);
      repository.countVersions.mockResolvedValue(2);
      repository.createDraft.mockResolvedValue({ id: 'draft-3', versionNo: 'v3' } as never);

      const result = await service.createDraft('MOTHER_REGISTRATION', {});

      expect(repository.createDraft).toHaveBeenCalledWith(
        expect.objectContaining({ formDefinitionId: 'def-1', versionNo: 'v3', schemaJson: [] }),
      );
      expect(result).toEqual({ id: 'draft-3', versionNo: 'v3' });
    });

    it('surfaces a concurrent version-number collision as a 409, not a 500', async () => {
      repository.findDefinitionByCode.mockResolvedValue({ id: 'def-1' } as never);
      repository.countVersions.mockResolvedValue(2);
      // Prisma P2002 unique-constraint violation on [formDefinitionId, versionNo].
      repository.createDraft.mockRejectedValue({ code: 'P2002' });

      await expect(service.createDraft('MOTHER_REGISTRATION', {})).rejects.toMatchObject({
        status: 409,
      });
    });

    it('throws not-found for an unknown form code', async () => {
      repository.findDefinitionByCode.mockResolvedValue(null);
      await expect(service.createDraft('NOT_A_FORM', {})).rejects.toThrow(/Unknown form code/);
    });

    it('rejects cloning from a version belonging to a different form definition', async () => {
      repository.findDefinitionByCode.mockResolvedValue({ id: 'def-1' } as never);
      repository.findVersionById.mockResolvedValue({
        id: 'other-version',
        formDefinitionId: 'def-2',
      } as never);

      await expect(
        service.createDraft('MOTHER_REGISTRATION', { cloneFromVersionId: 'other-version' }),
      ).rejects.toThrow(/does not belong to this form code/);
    });

    it('clones schemaJson/validationJson from the source version', async () => {
      repository.findDefinitionByCode.mockResolvedValue({ id: 'def-1' } as never);
      repository.findVersionById.mockResolvedValue({
        id: 'source-version',
        formDefinitionId: 'def-1',
        schemaJson: [
          { question_code: 'lmp_date', label: 'LMP', input_type: 'date', required: true },
        ],
        validationJson: [],
      } as never);
      repository.countVersions.mockResolvedValue(1);
      repository.createDraft.mockResolvedValue({ id: 'draft-2' } as never);

      await service.createDraft('MOTHER_REGISTRATION', { cloneFromVersionId: 'source-version' });

      expect(repository.createDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          schemaJson: [
            { question_code: 'lmp_date', label: 'LMP', input_type: 'date', required: true },
          ],
        }),
      );
    });
  });

  describe('updateDraft', () => {
    it('updates schemaJson/validationJson when the version is DRAFT', async () => {
      repository.findVersionById.mockResolvedValue({
        id: 'v1',
        status: 'DRAFT',
        formDefinition: { formCode: 'MOTHER_REGISTRATION' },
      } as never);
      repository.updateDraft.mockResolvedValue({ id: 'v1' } as never);

      await service.updateDraft('MOTHER_REGISTRATION', 'v1', {
        schemaJson: [],
        validationJson: [],
      });

      expect(repository.updateDraft).toHaveBeenCalledWith(
        'v1',
        expect.objectContaining({ schemaJson: [], validationJson: [] }),
      );
    });

    it('rejects when the version does not belong to the given form code', async () => {
      repository.findVersionById.mockResolvedValue({
        id: 'v1',
        status: 'DRAFT',
        formDefinition: { formCode: 'MOTHER_REGISTRATION' },
      } as never);

      await expect(
        service.updateDraft('CHILD_REGISTRATION', 'v1', { schemaJson: [], validationJson: [] }),
      ).rejects.toThrow(/does not belong to this form code/);
    });

    it('rejects editing a version that is not DRAFT', async () => {
      repository.findVersionById.mockResolvedValue({
        id: 'v1',
        status: 'PUBLISHED',
        formDefinition: { formCode: 'MOTHER_REGISTRATION' },
      } as never);
      await expect(
        service.updateDraft('MOTHER_REGISTRATION', 'v1', { schemaJson: [], validationJson: [] }),
      ).rejects.toThrow(/Only DRAFT versions can be edited/);
    });

    it('throws not-found for an unknown version id', async () => {
      repository.findVersionById.mockResolvedValue(null);
      await expect(
        service.updateDraft('MOTHER_REGISTRATION', 'missing', {
          schemaJson: [],
          validationJson: [],
        }),
      ).rejects.toThrow(/Form version not found/);
    });
  });

  describe('publish', () => {
    const draftVersion = {
      id: 'v2',
      status: 'DRAFT',
      formDefinitionId: 'def-1',
      formDefinition: { formCode: 'MOTHER_REGISTRATION' },
      schemaJson: [
        { question_code: 'phone_owner', label: 'Phone owner', input_type: 'text', required: true },
      ],
    };

    it('publishes a DRAFT and retires the previously-active version', async () => {
      repository.findVersionById.mockResolvedValue(draftVersion as never);
      repository.findCurrentlyPublished.mockResolvedValue({ id: 'v1' } as never);
      repository.publish.mockResolvedValue({ id: 'v2', status: 'PUBLISHED' } as never);

      await service.publish('MOTHER_REGISTRATION', 'v2', 'admin-1');

      expect(repository.publish).toHaveBeenCalledWith('v2', expect.any(Date), 'v1', 'admin-1');
    });

    it('publishes with no previous version to retire when none exists', async () => {
      repository.findVersionById.mockResolvedValue({
        ...draftVersion,
        id: 'v1',
      } as never);
      repository.findCurrentlyPublished.mockResolvedValue(null);
      repository.publish.mockResolvedValue({ id: 'v1' } as never);

      await service.publish('MOTHER_REGISTRATION', 'v1', 'admin-1');

      expect(repository.publish).toHaveBeenCalledWith('v1', expect.any(Date), null, 'admin-1');
    });

    it('rejects when the version does not belong to the given form code', async () => {
      repository.findVersionById.mockResolvedValue(draftVersion as never);
      await expect(service.publish('CHILD_REGISTRATION', 'v2', 'admin-1')).rejects.toThrow(
        /does not belong to this form code/,
      );
    });

    it('rejects publishing a version that is not DRAFT', async () => {
      repository.findVersionById.mockResolvedValue({
        ...draftVersion,
        status: 'RETIRED',
      } as never);
      await expect(service.publish('MOTHER_REGISTRATION', 'v1', 'admin-1')).rejects.toThrow(
        /Only DRAFT versions can be published/,
      );
    });

    it('rejects publishing a draft with an empty schemaJson', async () => {
      repository.findVersionById.mockResolvedValue({
        ...draftVersion,
        schemaJson: [],
      } as never);
      await expect(service.publish('MOTHER_REGISTRATION', 'v2', 'admin-1')).rejects.toThrow(
        /at least one well-formed field/,
      );
    });
  });

  describe('createSubmission', () => {
    const publishedVersion = {
      id: 'version-1',
      status: 'PUBLISHED',
      formDefinition: { formCode: 'MOTHER_REGISTRATION' },
      schemaJson: [
        { question_code: 'phone_owner', label: 'Phone owner', input_type: 'text', required: true },
        {
          question_code: 'bp_systolic',
          label: 'BP Systolic',
          input_type: 'number',
          required: false,
          numericRange: { min: 70, max: 300 },
        },
      ],
      validationJson: [],
    };

    it('returns the existing submission on a retried localSubmissionUuid (idempotent)', async () => {
      const existing = { id: 'sub-1', ruleVersionId: 'rule-1', syncBatchId: 'batch-1' };
      repository.findSubmissionByLocalUuid.mockResolvedValue(existing as never);

      const result = await service.createSubmission(
        'MOTHER_REGISTRATION',
        {
          formVersionId: 'version-1',
          beneficiaryId: 'b1',
          localSubmissionUuid: 'retry-uuid',
          formData: {},
        },
        'u1',
        'Bearer test-token',
      );

      expect(result).toEqual(expect.objectContaining({ id: 'sub-1' }));
      // Internal columns must not leak into the API response.
      expect(result).not.toHaveProperty('ruleVersionId');
      expect(result).not.toHaveProperty('syncBatchId');
      expect(repository.findVersionById).not.toHaveBeenCalled();
    });

    it('rejects when the form version does not belong to the given form code', async () => {
      repository.findSubmissionByLocalUuid.mockResolvedValue(null);
      repository.findVersionById.mockResolvedValue(publishedVersion as never);

      await expect(
        service.createSubmission(
          'CHILD_REGISTRATION',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: { phone_owner: 'SELF' },
          },
          'u1',
          'Bearer test-token',
        ),
      ).rejects.toThrow(/does not belong to this form code/);
    });

    it('rejects when the version is not PUBLISHED', async () => {
      repository.findSubmissionByLocalUuid.mockResolvedValue(null);
      repository.findVersionById.mockResolvedValue({
        ...publishedVersion,
        status: 'DRAFT',
      } as never);

      await expect(
        service.createSubmission(
          'MOTHER_REGISTRATION',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: { phone_owner: 'SELF' },
          },
          'u1',
          'Bearer test-token',
        ),
      ).rejects.toThrow(/not published/);
    });

    it('rejects a submission missing a required field', async () => {
      repository.findSubmissionByLocalUuid.mockResolvedValue(null);
      repository.findVersionById.mockResolvedValue(publishedVersion as never);

      const call = service.createSubmission(
        'MOTHER_REGISTRATION',
        {
          formVersionId: 'version-1',
          beneficiaryId: 'b1',
          localSubmissionUuid: 'uuid-1',
          formData: {},
        },
        'u1',
        'Bearer test-token',
      );

      await expect(call).rejects.toMatchObject({
        details: { violations: ['Missing required field: phone_owner'] },
      });
    });

    it('rejects a numeric value outside the declared range', async () => {
      repository.findSubmissionByLocalUuid.mockResolvedValue(null);
      repository.findVersionById.mockResolvedValue(publishedVersion as never);

      const call = service.createSubmission(
        'MOTHER_REGISTRATION',
        {
          formVersionId: 'version-1',
          beneficiaryId: 'b1',
          localSubmissionUuid: 'uuid-1',
          formData: { phone_owner: 'SELF', bp_systolic: 400 },
        },
        'u1',
        'Bearer test-token',
      );

      await expect(call).rejects.toMatchObject({
        details: { violations: ['bp_systolic must be between 70 and 300'] },
      });
    });

    it('rejects a cross-field LTE violation', async () => {
      repository.findSubmissionByLocalUuid.mockResolvedValue(null);
      repository.findVersionById.mockResolvedValue({
        ...publishedVersion,
        schemaJson: [
          { question_code: 'para', label: 'Para', input_type: 'number', required: false },
          { question_code: 'gravida', label: 'Gravida', input_type: 'number', required: false },
        ],
        validationJson: [{ rule: 'LTE', fields: ['para', 'gravida'] }],
      } as never);

      const call = service.createSubmission(
        'MOTHER_REGISTRATION',
        {
          formVersionId: 'version-1',
          beneficiaryId: 'b1',
          localSubmissionUuid: 'uuid-1',
          formData: { para: 5, gravida: 2 },
        },
        'u1',
        'Bearer test-token',
      );

      await expect(call).rejects.toMatchObject({
        details: { violations: ['para must be <= gravida'] },
      });
    });

    it('skips a cross-field LTE check when a referenced field is legitimately absent', async () => {
      repository.findSubmissionByLocalUuid.mockResolvedValue(null);
      repository.findVersionById.mockResolvedValue({
        ...publishedVersion,
        schemaJson: [
          { question_code: 'para', label: 'Para', input_type: 'number', required: false },
          { question_code: 'gravida', label: 'Gravida', input_type: 'number', required: false },
        ],
        validationJson: [{ rule: 'LTE', fields: ['para', 'gravida'] }],
      } as never);
      repository.createSubmission.mockResolvedValue({ id: 'sub-1' } as never);

      // Neither `para` nor `gravida` was answered — both are optional, so the
      // cross-field rule should not fire at all (not "must be numeric").
      await service.createSubmission(
        'MOTHER_REGISTRATION',
        {
          formVersionId: 'version-1',
          beneficiaryId: 'b1',
          localSubmissionUuid: 'uuid-1',
          formData: {},
        },
        'u1',
        'Bearer test-token',
      );

      expect(repository.createSubmission).toHaveBeenCalled();
    });

    it('skips the required check for a field hidden by skip logic', async () => {
      repository.findSubmissionByLocalUuid.mockResolvedValue(null);
      repository.findVersionById.mockResolvedValue({
        ...publishedVersion,
        schemaJson: [
          {
            question_code: 'fetal_heart_rate',
            label: 'Fetal Heart Rate',
            input_type: 'number',
            required: true,
            visibleWhen: { field: 'gestational_age_weeks', operator: 'gte', value: 20 },
          },
        ],
      } as never);
      repository.createSubmission.mockResolvedValue({ id: 'sub-1' } as never);

      await service.createSubmission(
        'MOTHER_REGISTRATION',
        {
          formVersionId: 'version-1',
          beneficiaryId: 'b1',
          localSubmissionUuid: 'uuid-1',
          formData: { gestational_age_weeks: 10 },
        },
        'u1',
        'Bearer test-token',
      );

      expect(repository.createSubmission).toHaveBeenCalled();
    });

    it('skips the required check for a system-computed field', async () => {
      repository.findSubmissionByLocalUuid.mockResolvedValue(null);
      repository.findVersionById.mockResolvedValue({
        ...publishedVersion,
        schemaJson: [
          {
            question_code: 'edd_date',
            label: 'EDD',
            input_type: 'date',
            required: true,
            computedFrom: 'EDD_FROM_LMP',
          },
        ],
      } as never);
      repository.createSubmission.mockResolvedValue({ id: 'sub-1' } as never);

      await service.createSubmission(
        'MOTHER_REGISTRATION',
        {
          formVersionId: 'version-1',
          beneficiaryId: 'b1',
          localSubmissionUuid: 'uuid-1',
          formData: {},
        },
        'u1',
        'Bearer test-token',
      );

      expect(repository.createSubmission).toHaveBeenCalled();
    });

    it('creates the submission with validationStatus VALID on success', async () => {
      repository.findSubmissionByLocalUuid.mockResolvedValue(null);
      repository.findVersionById.mockResolvedValue(publishedVersion as never);
      repository.createSubmission.mockResolvedValue({ id: 'sub-1' } as never);

      const result = await service.createSubmission(
        'MOTHER_REGISTRATION',
        {
          formVersionId: 'version-1',
          beneficiaryId: 'b1',
          localSubmissionUuid: 'uuid-1',
          formData: { phone_owner: 'SELF' },
        },
        'u1',
        'Bearer test-token',
      );

      expect(repository.createSubmission).toHaveBeenCalledWith(
        expect.objectContaining({ validationStatus: 'VALID' }),
      );
      expect(result).toEqual({ id: 'sub-1', stageEducationContent: [] });
    });

    describe('visit completion on submission', () => {
      it('attempts to complete the linked visit after a successful visit-linked submission', async () => {
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(publishedVersion as never);
        repository.findVisitById.mockResolvedValue({ id: 'visit-1' } as never);
        repository.createSubmission.mockResolvedValue({ id: 'sub-1' } as never);

        await service.createSubmission(
          'MOTHER_REGISTRATION',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            visitId: 'visit-1',
            localSubmissionUuid: 'uuid-1',
            formData: { phone_owner: 'SELF' },
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(resolveVisitCompletion)).toHaveBeenCalledWith(
          'MOTHER_REGISTRATION',
          'visit-1',
          'u1',
          visitInstanceRepository,
          'Bearer test-token',
        );
      });

      it('still attempts completion (with visitId undefined) for a submission with no visitId', async () => {
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(publishedVersion as never);
        repository.createSubmission.mockResolvedValue({ id: 'sub-1' } as never);

        await service.createSubmission(
          'MOTHER_REGISTRATION',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: { phone_owner: 'SELF' },
          },
          'u1',
          'Bearer test-token',
        );

        // resolveVisitCompletion itself no-ops on an undefined visitId — the
        // service always calls it, the resolver decides whether there's
        // anything to complete (same "always call, resolver no-ops" shape
        // as the other best-effort calls in this function).
        expect(jest.mocked(resolveVisitCompletion)).toHaveBeenCalledWith(
          'MOTHER_REGISTRATION',
          undefined,
          'u1',
          visitInstanceRepository,
          'Bearer test-token',
        );
      });

      it('is awaited after the submission already committed, so its own best-effort tolerance (see visitCompletion.resolver.spec.ts) is what protects the submission, not an extra guard here', async () => {
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(publishedVersion as never);
        repository.findVisitById.mockResolvedValue({ id: 'visit-1' } as never);
        repository.createSubmission.mockResolvedValue({ id: 'sub-1' } as never);
        jest.mocked(resolveVisitCompletion).mockResolvedValue(undefined);

        const result = await service.createSubmission(
          'MOTHER_REGISTRATION',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            visitId: 'visit-1',
            localSubmissionUuid: 'uuid-1',
            formData: { phone_owner: 'SELF' },
          },
          'u1',
          'Bearer test-token',
        );

        expect(result).toEqual({ id: 'sub-1', stageEducationContent: [] });
        expect(repository.createSubmission).toHaveBeenCalled();
      });
    });

    describe('NEONATAL_VISIT server-side kmcEligible revalidation', () => {
      const neonatalVersion = {
        id: 'version-1',
        status: 'PUBLISHED',
        formDefinition: { formCode: 'NEONATAL_VISIT' },
        schemaJson: [
          {
            question_code: 'is_kmc_practiced',
            label: 'Is KMC practiced?',
            input_type: 'radio',
            required: true,
            visibleWhen: { field: 'kmcEligible', operator: 'eq', value: true },
          },
        ],
        validationJson: [],
      };

      it('requires is_kmc_practiced when the linked DELIVERY_VISIT shows low birth weight', async () => {
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(neonatalVersion as never);
        repository.findLatestSubmissionByBeneficiaryAndFormCode.mockResolvedValue({
          formDataJson: { child1_birth_weight_kg: 2.0, term_of_delivery: 'full_term' },
        } as never);
        jest.mocked(findBeneficiaryById).mockResolvedValue({
          childDateOfBirth: new Date().toISOString(),
        } as never);

        const call = service.createSubmission(
          'NEONATAL_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {},
          },
          'u1',
          'Bearer test-token',
        );

        await expect(call).rejects.toMatchObject({
          details: { violations: ['Missing required field: is_kmc_practiced'] },
        });
      });

      it('does not require is_kmc_practiced when the linked DELIVERY_VISIT shows normal birth weight/term', async () => {
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(neonatalVersion as never);
        repository.findLatestSubmissionByBeneficiaryAndFormCode.mockResolvedValue({
          formDataJson: { child1_birth_weight_kg: 3.2, term_of_delivery: 'full_term' },
        } as never);
        repository.createSubmission.mockResolvedValue({ id: 'sub-1' } as never);

        await service.createSubmission(
          'NEONATAL_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {},
          },
          'u1',
          'Bearer test-token',
        );

        expect(repository.createSubmission).toHaveBeenCalled();
      });

      it('never persists kmcEligible into the stored formData', async () => {
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(neonatalVersion as never);
        repository.findLatestSubmissionByBeneficiaryAndFormCode.mockResolvedValue({
          formDataJson: { child1_birth_weight_kg: 2.0, term_of_delivery: 'full_term' },
        } as never);
        jest.mocked(findBeneficiaryById).mockResolvedValue({
          childDateOfBirth: new Date().toISOString(),
        } as never);
        repository.createSubmission.mockResolvedValue({ id: 'sub-1' } as never);

        await service.createSubmission(
          'NEONATAL_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: { is_kmc_practiced: 'yes' },
          },
          'u1',
          'Bearer test-token',
        );

        const call = repository.createSubmission.mock.calls[0][0] as {
          formDataJson?: Record<string, unknown>;
        };
        expect(call.formDataJson).not.toHaveProperty('kmcEligible');
      });
    });

    describe('visitId validation', () => {
      it('proceeds when visitId is omitted — no visit check is attempted', async () => {
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(publishedVersion as never);
        repository.createSubmission.mockResolvedValue({ id: 'sub-1' } as never);

        await service.createSubmission(
          'MOTHER_REGISTRATION',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: { phone_owner: 'SELF' },
          },
          'u1',
          'Bearer test-token',
        );

        expect(repository.findVisitById).not.toHaveBeenCalled();
        expect(repository.createSubmission).toHaveBeenCalled();
      });

      it('proceeds when visitId refers to an existing visit owned by this beneficiary', async () => {
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(publishedVersion as never);
        repository.findVisitById.mockResolvedValue({ id: 'visit-1' } as never);
        repository.createSubmission.mockResolvedValue({ id: 'sub-1' } as never);

        await service.createSubmission(
          'MOTHER_REGISTRATION',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            visitId: 'visit-1',
            localSubmissionUuid: 'uuid-1',
            formData: { phone_owner: 'SELF' },
          },
          'u1',
          'Bearer test-token',
        );

        expect(repository.findVisitById).toHaveBeenCalledWith('visit-1', 'b1');
        expect(repository.createSubmission).toHaveBeenCalled();
      });

      it('runs the visitId check after formData validation, not before', async () => {
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(publishedVersion as never);
        repository.findVisitById.mockResolvedValue(null);

        const promise = service.createSubmission(
          'MOTHER_REGISTRATION',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            visitId: 'missing-visit',
            localSubmissionUuid: 'uuid-1',
            // bp_systolic is out of numericRange (70-300) AND visitId is
            // missing — the formData violation must still be reported, not
            // masked by the visitId check running first.
            formData: { phone_owner: 'SELF', bp_systolic: 999 },
          },
          'u1',
          'Bearer test-token',
        );

        await expect(promise).rejects.toMatchObject({ status: 422 });
        expect(repository.findVisitById).not.toHaveBeenCalled();
      });

      it('rejects with 404 when visitId does not refer to an existing visit, without inserting', async () => {
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(publishedVersion as never);
        repository.findVisitById.mockResolvedValue(null);

        const promise = service.createSubmission(
          'MOTHER_REGISTRATION',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            visitId: 'missing-visit',
            localSubmissionUuid: 'uuid-1',
            formData: { phone_owner: 'SELF' },
          },
          'u1',
          'Bearer test-token',
        );

        await expect(promise).rejects.toMatchObject({ status: 404, message: 'Visit not found.' });
        expect(repository.createSubmission).not.toHaveBeenCalled();
      });

      it('translates a foreign-key-violation race on the visit_id constraint into the same 404', async () => {
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(publishedVersion as never);
        repository.findVisitById.mockResolvedValue({ id: 'visit-1' } as never);
        repository.createSubmission.mockRejectedValue({
          code: 'P2003',
          meta: { field_name: 'form_submissions_visit_id_fkey (index)' },
        });

        const promise = service.createSubmission(
          'MOTHER_REGISTRATION',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            visitId: 'visit-1',
            localSubmissionUuid: 'uuid-1',
            formData: { phone_owner: 'SELF' },
          },
          'u1',
          'Bearer test-token',
        );

        await expect(promise).rejects.toMatchObject({ status: 404, message: 'Visit not found.' });
      });

      it('does not report "Visit not found" for a P2003 on an unrelated FK (e.g. form_version_id)', async () => {
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(publishedVersion as never);
        const fkError = {
          code: 'P2003',
          meta: { field_name: 'form_submissions_form_version_id_fkey (index)' },
        };
        repository.createSubmission.mockRejectedValue(fkError);

        const promise = service.createSubmission(
          'MOTHER_REGISTRATION',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: { phone_owner: 'SELF' },
          },
          'u1',
          'Bearer test-token',
        );

        await expect(promise).rejects.toBe(fkError);
      });

      it('does not translate an unrelated createSubmission error', async () => {
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(publishedVersion as never);
        repository.findVisitById.mockResolvedValue({ id: 'visit-1' } as never);
        const originalError = new Error('some other db failure');
        repository.createSubmission.mockRejectedValue(originalError);

        const promise = service.createSubmission(
          'MOTHER_REGISTRATION',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            visitId: 'visit-1',
            localSubmissionUuid: 'uuid-1',
            formData: { phone_owner: 'SELF' },
          },
          'u1',
          'Bearer test-token',
        );

        await expect(promise).rejects.toBe(originalError);
      });

      it('replays the winning row on a concurrent P2002 race on localSubmissionUuid', async () => {
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(publishedVersion as never);
        repository.createSubmission.mockRejectedValue({ code: 'P2002' });
        const winningRow = { id: 'sub-winner', beneficiaryId: 'b1' };
        // Re-queried after the race is detected — this second call simulates
        // the concurrent request's row having since committed.
        repository.findSubmissionByLocalUuid
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(winningRow as never);

        const result = await service.createSubmission(
          'MOTHER_REGISTRATION',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: { phone_owner: 'SELF' },
          },
          'u1',
          'Bearer test-token',
        );

        expect(result).toMatchObject({ id: 'sub-winner' });
      });

      it('resolves stageEducationContent for the race LOSER too, not just the sequential replay path (PR #222 review finding)', async () => {
        const nnVersion = {
          id: 'version-1',
          status: 'PUBLISHED',
          formDefinition: { formCode: 'NEONATAL_VISIT' },
          schemaJson: [{ question_code: 'x', label: 'x', input_type: 'text', required: false }],
          validationJson: [],
        };
        repository.findVersionById.mockResolvedValue(nnVersion as never);
        repository.createSubmission.mockRejectedValue({ code: 'P2002' });
        const winningRow = {
          id: 'sub-winner',
          beneficiaryId: 'b1',
          submittedAt: new Date('2026-08-01T00:00:00.000Z'),
          createdAt: new Date('2026-08-01T00:00:01.000Z'),
        };
        repository.findSubmissionByLocalUuid
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(winningRow as never);
        jest.mocked(resolveHealthEducationMessagesByStage).mockImplementation(async (stage) =>
          stage === 'NN1 and NN2'
            ? [
                {
                  id: 'm1',
                  riskConditionId: null,
                  conditionLabel: 'Neonatal Care',
                  stage,
                  messageOrder: 1,
                  titleEn: 'Neonatal Care',
                  bodyEn: 'x',
                  bodyMarathi: '',
                  mediaType: 'TEXT',
                  mediaFile: null,
                  sortOrder: 1,
                },
              ]
            : ([] as never),
        );

        const result = await service.createSubmission(
          'NEONATAL_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {},
          },
          'u1',
          'Bearer test-token',
        );

        // Previously this response dropped stageEducationContent entirely
        // (not even an empty array) — the race loser's response shape was
        // inconsistent with the sequential-replay path's response, for
        // what should be an idempotent replay of the same logical
        // submission.
        expect(result.stageEducationContent).toEqual([
          expect.objectContaining({ topicCode: 'Neonatal Care' }),
        ]);
      });

      it('rethrows a P2002 when no winning row can be found on re-query', async () => {
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(publishedVersion as never);
        const p2002Error = { code: 'P2002' };
        repository.createSubmission.mockRejectedValue(p2002Error);

        const promise = service.createSubmission(
          'MOTHER_REGISTRATION',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: { phone_owner: 'SELF' },
          },
          'u1',
          'Bearer test-token',
        );

        await expect(promise).rejects.toBe(p2002Error);
      });
    });

    it('syncs socio-demographic answers to beneficiary-service for MOTHER_REGISTRATION', async () => {
      repository.findSubmissionByLocalUuid.mockResolvedValue(null);
      repository.findVersionById.mockResolvedValue(publishedVersion as never);
      repository.createSubmission.mockResolvedValue({ id: 'sub-1' } as never);
      const formData = { phone_owner: 'SELF', what_is_your_religion: 'hindu' };

      await service.createSubmission(
        'MOTHER_REGISTRATION',
        {
          formVersionId: 'version-1',
          beneficiaryId: 'b1',
          localSubmissionUuid: 'uuid-1',
          formData,
        },
        'u1',
        'Bearer test-token',
      );

      expect(jest.mocked(syncSocioDemographics)).toHaveBeenCalledWith(
        'b1',
        formData,
        'Bearer test-token',
      );
    });

    it('does not sync socio-demographics for a non-MOTHER_REGISTRATION form', async () => {
      repository.findSubmissionByLocalUuid.mockResolvedValue(null);
      repository.findVersionById.mockResolvedValue({
        ...publishedVersion,
        formDefinition: { formCode: 'CHILD_REGISTRATION' },
      } as never);
      repository.createSubmission.mockResolvedValue({ id: 'sub-1' } as never);

      await service.createSubmission(
        'CHILD_REGISTRATION',
        {
          formVersionId: 'version-1',
          beneficiaryId: 'b1',
          localSubmissionUuid: 'uuid-1',
          formData: { phone_owner: 'SELF' },
        },
        'u1',
        'Bearer test-token',
      );

      expect(jest.mocked(syncSocioDemographics)).not.toHaveBeenCalled();
    });

    it('syncs self-reported health history to beneficiary-service for MOTHER_REGISTRATION', async () => {
      repository.findSubmissionByLocalUuid.mockResolvedValue(null);
      repository.findVersionById.mockResolvedValue(publishedVersion as never);
      repository.createSubmission.mockResolvedValue({ id: 'sub-1' } as never);
      const formData = {
        phone_owner: 'SELF',
        have_you_ever_been_diagnosed_with_or_treated_for_any_of_the_following_medical_conditions: [
          'hypertension_high_bp',
        ],
      };

      await service.createSubmission(
        'MOTHER_REGISTRATION',
        {
          formVersionId: 'version-1',
          beneficiaryId: 'b1',
          localSubmissionUuid: 'uuid-1',
          formData,
        },
        'u1',
        'Bearer test-token',
      );

      expect(jest.mocked(syncHealthHistory)).toHaveBeenCalledWith(
        'b1',
        formData,
        'Bearer test-token',
      );
    });

    it('does not sync health history for a non-MOTHER_REGISTRATION form', async () => {
      repository.findSubmissionByLocalUuid.mockResolvedValue(null);
      repository.findVersionById.mockResolvedValue({
        ...publishedVersion,
        formDefinition: { formCode: 'CHILD_REGISTRATION' },
      } as never);
      repository.createSubmission.mockResolvedValue({ id: 'sub-1' } as never);

      await service.createSubmission(
        'CHILD_REGISTRATION',
        {
          formVersionId: 'version-1',
          beneficiaryId: 'b1',
          localSubmissionUuid: 'uuid-1',
          formData: { phone_owner: 'SELF' },
        },
        'u1',
        'Bearer test-token',
      );

      expect(jest.mocked(syncHealthHistory)).not.toHaveBeenCalled();
    });

    it('syncs both socio-demographics and health history for the same MOTHER_REGISTRATION submission', async () => {
      repository.findSubmissionByLocalUuid.mockResolvedValue(null);
      repository.findVersionById.mockResolvedValue(publishedVersion as never);
      repository.createSubmission.mockResolvedValue({ id: 'sub-1' } as never);
      const formData = { phone_owner: 'SELF', what_is_your_religion: 'hindu' };

      await service.createSubmission(
        'MOTHER_REGISTRATION',
        {
          formVersionId: 'version-1',
          beneficiaryId: 'b1',
          localSubmissionUuid: 'uuid-1',
          formData,
        },
        'u1',
        'Bearer test-token',
      );

      expect(jest.mocked(syncSocioDemographics)).toHaveBeenCalledWith(
        'b1',
        formData,
        'Bearer test-token',
      );
      expect(jest.mocked(syncHealthHistory)).toHaveBeenCalledWith(
        'b1',
        formData,
        'Bearer test-token',
      );
    });

    it('decomposes formData into typed form_answers and passes them to the repository', () => {
      repository.findSubmissionByLocalUuid.mockResolvedValue(null);
      repository.findVersionById.mockResolvedValue(publishedVersion as never);
      repository.createSubmission.mockResolvedValue({ id: 'sub-1' } as never);

      return service
        .createSubmission(
          'MOTHER_REGISTRATION',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: { phone_owner: 'SELF', bp_systolic: '120' },
          },
          'u1',
          'Bearer test-token',
        )
        .then(() => {
          const arg = repository.createSubmission.mock.calls[0][0];
          expect(arg.formAnswers).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ fieldCode: 'phone_owner', answerValueText: 'SELF' }),
              // "120" for a number-typed field is coerced to a number column.
              expect.objectContaining({ fieldCode: 'bp_systolic', answerValueNumber: 120 }),
            ]),
          );
        });
    });

    describe('DELIVERY_VISIT child-profile auto-creation', () => {
      const motherCase = {
        id: 'b1',
        sakhiId: 'sakhi-1',
        projectId: 'project-1',
        beneficiaryTypeLookupId: 'type-1',
        caseTypeLookupId: 'case-type-1',
        currentPhase: 'ANC',
        villageId: 'village-1',
        padaId: 'pada-1',
        healthSubCentreId: 'sc-1',
        phcId: 'phc-1',
        stateId: 'state-1',
        districtId: 'district-1',
        childDateOfBirth: null,
        fullName: 'Jane Doe',
      };

      const deliveryVersion = {
        id: 'version-1',
        status: 'PUBLISHED',
        formDefinition: { formCode: 'DELIVERY_VISIT' },
        // Minimal — none required, so these tests can submit whichever
        // childN_* fields each case needs without also having to satisfy an
        // unrelated required field from a different form's schema.
        schemaJson: [
          { question_code: 'date_of_delivery', label: 'x', input_type: 'date', required: false },
          {
            question_code: 'number_of_babies_born',
            label: 'x',
            input_type: 'number',
            required: false,
          },
          ...['child1', 'child2', 'child3'].flatMap((prefix) => [
            {
              question_code: `${prefix}_delivery_outcome`,
              label: 'x',
              input_type: 'dropdown',
              required: false,
            },
            {
              question_code: `${prefix}_sex_of_baby`,
              label: 'x',
              input_type: 'dropdown',
              required: false,
            },
            {
              question_code: `${prefix}_birth_weight_kg`,
              label: 'x',
              input_type: 'number',
              required: false,
            },
            {
              question_code: `${prefix}_birth_length_cm`,
              label: 'x',
              input_type: 'number',
              required: false,
            },
          ]),
        ],
        validationJson: [],
      };

      beforeEach(() => {
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(deliveryVersion as never);
        repository.createSubmission.mockResolvedValue({ id: 'sub-1' } as never);
        jest.mocked(findBeneficiaryById).mockResolvedValue(motherCase);
        jest.mocked(createChildBeneficiary).mockResolvedValue('child-1');
      });

      it('creates a child beneficiary for a single live birth', async () => {
        await service.createSubmission(
          'DELIVERY_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {
              date_of_delivery: '2026-08-01',
              child1_delivery_outcome: 'live_birth',
              child1_sex_of_baby: 'male',
              child1_birth_weight_kg: 2.4,
              child1_birth_length_cm: 45,
            },
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(createChildBeneficiary)).toHaveBeenCalledTimes(1);
        expect(jest.mocked(createChildBeneficiary)).toHaveBeenCalledWith(
          expect.objectContaining({
            motherCase,
            localCaseUuid: 'uuid-1-child1',
            sex: 'MALE',
            birthWeightKg: 2.4,
            birthLengthCm: 45,
            birthOrder: 1,
          }),
          'Bearer test-token',
        );
      });

      it('creates one child beneficiary per live-born child in a multi-birth submission', async () => {
        await service.createSubmission(
          'DELIVERY_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {
              date_of_delivery: '2026-08-01',
              number_of_babies_born: 2,
              child1_delivery_outcome: 'live_birth',
              child1_sex_of_baby: 'male',
              child2_delivery_outcome: 'live_birth',
              child2_sex_of_baby: 'female',
            },
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(createChildBeneficiary)).toHaveBeenCalledTimes(2);
        expect(jest.mocked(createChildBeneficiary)).toHaveBeenCalledWith(
          expect.objectContaining({ localCaseUuid: 'uuid-1-child1', sex: 'MALE', birthOrder: 1 }),
          'Bearer test-token',
        );
        expect(jest.mocked(createChildBeneficiary)).toHaveBeenCalledWith(
          expect.objectContaining({
            localCaseUuid: 'uuid-1-child2',
            sex: 'FEMALE',
            birthOrder: 2,
          }),
          'Bearer test-token',
        );
      });

      it('does not create a beneficiary for a stillborn child', async () => {
        await service.createSubmission(
          'DELIVERY_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {
              date_of_delivery: '2026-08-01',
              child1_delivery_outcome: 'antepartum_still_birth_fresh',
            },
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(createChildBeneficiary)).not.toHaveBeenCalled();
      });

      // Regression test: in a twin case where the earlier slot was a
      // stillbirth, the surviving twin's birthOrder must still reflect its
      // real slot (2), not shift to 1 because it's the only child actually
      // created — beneficiary-service's slot-based stillbirth guard relies
      // on this to check the CORRECT slot's outcome, not just "some slot."
      it('assigns the correct birthOrder to a live-born twin even when an earlier slot was stillborn', async () => {
        await service.createSubmission(
          'DELIVERY_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {
              date_of_delivery: '2026-08-01',
              number_of_babies_born: 2,
              child1_delivery_outcome: 'antepartum_still_birth_fresh',
              child2_delivery_outcome: 'live_birth',
              child2_sex_of_baby: 'female',
            },
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(createChildBeneficiary)).toHaveBeenCalledTimes(1);
        expect(jest.mocked(createChildBeneficiary)).toHaveBeenCalledWith(
          expect.objectContaining({ localCaseUuid: 'uuid-1-child2', birthOrder: 2 }),
          'Bearer test-token',
        );
      });

      it('does not create a beneficiary for a non-existent child slot', async () => {
        await service.createSubmission(
          'DELIVERY_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {
              date_of_delivery: '2026-08-01',
              child1_delivery_outcome: 'live_birth',
              // child2/child3 absent — single birth.
            },
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(createChildBeneficiary)).toHaveBeenCalledTimes(1);
      });

      it('does not attempt child creation for a non-DELIVERY_VISIT form', async () => {
        repository.findVersionById.mockResolvedValue({
          ...publishedVersion,
          formDefinition: { formCode: 'MOTHER_REGISTRATION' },
        } as never);

        await service.createSubmission(
          'MOTHER_REGISTRATION',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: { phone_owner: 'SELF' },
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(findBeneficiaryById)).not.toHaveBeenCalled();
        expect(jest.mocked(createChildBeneficiary)).not.toHaveBeenCalled();
      });

      it('does not throw and skips child creation when the mother case cannot be found', async () => {
        jest.mocked(findBeneficiaryById).mockResolvedValue(null);

        const result = await service.createSubmission(
          'DELIVERY_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {
              date_of_delivery: '2026-08-01',
              child1_delivery_outcome: 'live_birth',
            },
          },
          'u1',
          'Bearer test-token',
        );

        expect(result).toEqual({ id: 'sub-1', stageEducationContent: [] });
        expect(jest.mocked(createChildBeneficiary)).not.toHaveBeenCalled();
      });
    });

    describe('DELIVERY_VISIT currentPhase advance (CR-041)', () => {
      const motherCase = {
        id: 'b1',
        sakhiId: 'sakhi-1',
        projectId: 'project-1',
        beneficiaryTypeLookupId: 'type-1',
        caseTypeLookupId: 'case-type-1',
        currentPhase: 'ANC',
        villageId: 'village-1',
        padaId: 'pada-1',
        healthSubCentreId: 'sc-1',
        phcId: 'phc-1',
        stateId: 'state-1',
        districtId: 'district-1',
        childDateOfBirth: null,
        fullName: 'Jane Doe',
      };

      const deliveryVersion = {
        id: 'version-1',
        status: 'PUBLISHED',
        formDefinition: { formCode: 'DELIVERY_VISIT' },
        schemaJson: [
          { question_code: 'date_of_delivery', label: 'x', input_type: 'date', required: false },
          ...['child1', 'child2'].flatMap((prefix) => [
            {
              question_code: `${prefix}_delivery_outcome`,
              label: 'x',
              input_type: 'dropdown',
              required: false,
            },
          ]),
        ],
        validationJson: [],
      };

      beforeEach(() => {
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(deliveryVersion as never);
        repository.createSubmission.mockResolvedValue({ id: 'sub-1' } as never);
        jest.mocked(findBeneficiaryById).mockResolvedValue(motherCase);
      });

      it("advances the mother's phase to PP after a successful submission", async () => {
        jest.mocked(createChildBeneficiary).mockResolvedValue(null);

        await service.createSubmission(
          'DELIVERY_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: { date_of_delivery: '2026-08-01' },
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(updateBeneficiaryPhase)).toHaveBeenCalledWith(
          'b1',
          'PP',
          'Bearer test-token',
        );
      });

      it('advances each successfully created child to NN', async () => {
        jest
          .mocked(createChildBeneficiary)
          .mockResolvedValueOnce('child-1')
          .mockResolvedValueOnce('child-2');

        await service.createSubmission(
          'DELIVERY_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {
              date_of_delivery: '2026-08-01',
              child1_delivery_outcome: 'live_birth',
              child2_delivery_outcome: 'live_birth',
            },
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(updateBeneficiaryPhase)).toHaveBeenCalledWith(
          'child-1',
          'NN',
          'Bearer test-token',
        );
        expect(jest.mocked(updateBeneficiaryPhase)).toHaveBeenCalledWith(
          'child-2',
          'NN',
          'Bearer test-token',
        );
        expect(jest.mocked(updateBeneficiaryPhase)).toHaveBeenCalledWith(
          'b1',
          'PP',
          'Bearer test-token',
        );
      });

      it('only advances a child that was actually created — a failed creation is skipped', async () => {
        jest
          .mocked(createChildBeneficiary)
          .mockResolvedValueOnce('child-1')
          .mockResolvedValueOnce(null);

        await service.createSubmission(
          'DELIVERY_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {
              date_of_delivery: '2026-08-01',
              child1_delivery_outcome: 'live_birth',
              child2_delivery_outcome: 'live_birth',
            },
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(updateBeneficiaryPhase)).toHaveBeenCalledWith(
          'child-1',
          'NN',
          'Bearer test-token',
        );
        expect(jest.mocked(updateBeneficiaryPhase)).not.toHaveBeenCalledWith(
          null,
          'NN',
          'Bearer test-token',
        );
      });

      it('still advances the mother even if child auto-creation fails entirely', async () => {
        jest.mocked(createChildBeneficiary).mockResolvedValue(null);

        await service.createSubmission(
          'DELIVERY_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: { date_of_delivery: '2026-08-01', child1_delivery_outcome: 'live_birth' },
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(updateBeneficiaryPhase)).toHaveBeenCalledWith(
          'b1',
          'PP',
          'Bearer test-token',
        );
      });

      it('does not call updateBeneficiaryPhase for a non-DELIVERY_VISIT form', async () => {
        repository.findVersionById.mockResolvedValue({
          ...publishedVersion,
          formDefinition: { formCode: 'MOTHER_REGISTRATION' },
        } as never);

        await service.createSubmission(
          'MOTHER_REGISTRATION',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: { phone_owner: 'SELF' },
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(updateBeneficiaryPhase)).not.toHaveBeenCalled();
      });
    });

    describe('CHILD phase advance on INC/CCV visit submission (CR-041)', () => {
      const incVersion = {
        id: 'version-1',
        status: 'PUBLISHED',
        formDefinition: { formCode: 'INC_VISIT' },
        schemaJson: [
          {
            question_code: 'birth_weight_in_kg',
            label: 'x',
            input_type: 'number',
            required: false,
          },
        ],
        validationJson: [],
      };

      beforeEach(() => {
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.createSubmission.mockResolvedValue({ id: 'sub-1' } as never);
      });

      it('advances a CHILD case to INC on an INC_VISIT submission', async () => {
        repository.findVersionById.mockResolvedValue(incVersion as never);

        await service.createSubmission(
          'INC_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'child-1',
            localSubmissionUuid: 'uuid-1',
            formData: {},
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(updateBeneficiaryPhase)).toHaveBeenCalledWith(
          'child-1',
          'INC',
          'Bearer test-token',
        );
      });

      it('advances a CHILD case to INC on the legacy NEONATAL_VISIT alias', async () => {
        repository.findVersionById.mockResolvedValue({
          ...incVersion,
          formDefinition: { formCode: 'NEONATAL_VISIT' },
        } as never);

        await service.createSubmission(
          'NEONATAL_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'child-1',
            localSubmissionUuid: 'uuid-1',
            formData: {},
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(updateBeneficiaryPhase)).toHaveBeenCalledWith(
          'child-1',
          'INC',
          'Bearer test-token',
        );
      });

      it('advances a CHILD case to CCV on a CCV_VISIT submission', async () => {
        repository.findVersionById.mockResolvedValue({
          ...incVersion,
          formDefinition: { formCode: 'CCV_VISIT' },
        } as never);

        await service.createSubmission(
          'CCV_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'child-1',
            localSubmissionUuid: 'uuid-1',
            formData: {},
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(updateBeneficiaryPhase)).toHaveBeenCalledWith(
          'child-1',
          'CCV',
          'Bearer test-token',
        );
      });

      it('does not call updateBeneficiaryPhase for a form code with no CHILD-phase mapping', async () => {
        repository.findVersionById.mockResolvedValue({
          ...incVersion,
          formDefinition: { formCode: 'MOTHER_REGISTRATION' },
        } as never);

        await service.createSubmission(
          'MOTHER_REGISTRATION',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {},
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(updateBeneficiaryPhase)).not.toHaveBeenCalled();
      });

      it('still saves the submission even if the phase-advance call rejects outright', async () => {
        repository.findVersionById.mockResolvedValue(incVersion as never);
        jest.mocked(updateBeneficiaryPhase).mockRejectedValueOnce(new Error('network down'));

        const result = await service.createSubmission(
          'INC_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'child-1',
            localSubmissionUuid: 'uuid-1',
            formData: {},
          },
          'u1',
          'Bearer test-token',
        );

        expect(result).toEqual(expect.objectContaining({ id: 'sub-1' }));
      });
    });

    describe('BR-13 ccvOpeningRiskState trigger on the actual INC->CCV transition', () => {
      const ccvVersion = {
        id: 'version-1',
        status: 'PUBLISHED',
        formDefinition: { formCode: 'CCV_VISIT' },
        schemaJson: [
          { question_code: 'weight_in_kg', label: 'x', input_type: 'number', required: false },
        ],
        validationJson: [],
      };

      beforeEach(() => {
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.createSubmission.mockResolvedValue({ id: 'sub-1' } as never);
        repository.findVersionById.mockResolvedValue(ccvVersion as never);
      });

      it('resolves ccvOpeningRiskState when the case was at INC before this submission (the actual transition)', async () => {
        jest.mocked(findBeneficiaryById).mockResolvedValue({
          currentPhase: 'INC',
          childDateOfBirth: '2025-01-01T00:00:00.000Z',
        } as never);

        await service.createSubmission(
          'CCV_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'child-1',
            localSubmissionUuid: 'uuid-1',
            formData: {},
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(resolveAndWriteCcvOpeningRiskState)).toHaveBeenCalledWith(
          'child-1',
          '2025-01-01T00:00:00.000Z',
          visitInstanceRepository,
          'Bearer test-token',
        );
      });

      it('does not resolve ccvOpeningRiskState on a repeat CCV_VISIT (case already at CCV)', async () => {
        jest.mocked(findBeneficiaryById).mockResolvedValue({
          currentPhase: 'CCV',
          childDateOfBirth: '2025-01-01T00:00:00.000Z',
        } as never);

        await service.createSubmission(
          'CCV_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'child-1',
            localSubmissionUuid: 'uuid-1',
            formData: {},
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(resolveAndWriteCcvOpeningRiskState)).not.toHaveBeenCalled();
      });

      it('does not resolve ccvOpeningRiskState when the case has no childDateOfBirth', async () => {
        jest.mocked(findBeneficiaryById).mockResolvedValue({
          currentPhase: 'INC',
          childDateOfBirth: null,
        } as never);

        await service.createSubmission(
          'CCV_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'child-1',
            localSubmissionUuid: 'uuid-1',
            formData: {},
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(resolveAndWriteCcvOpeningRiskState)).not.toHaveBeenCalled();
      });

      it('does not resolve ccvOpeningRiskState for a non-CCV CHILD phase advance (INC_VISIT)', async () => {
        repository.findVersionById.mockResolvedValue({
          ...ccvVersion,
          formDefinition: { formCode: 'INC_VISIT' },
        } as never);
        jest.mocked(findBeneficiaryById).mockResolvedValue({
          currentPhase: 'NN',
          childDateOfBirth: '2025-01-01T00:00:00.000Z',
        } as never);

        await service.createSubmission(
          'INC_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'child-1',
            localSubmissionUuid: 'uuid-1',
            formData: {},
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(resolveAndWriteCcvOpeningRiskState)).not.toHaveBeenCalled();
        expect(jest.mocked(findBeneficiaryById)).not.toHaveBeenCalled();
      });
    });

    describe('ANC_VISIT risk assessment trigger with registration-derived answers', () => {
      const ancVersion = {
        id: 'version-1',
        status: 'PUBLISHED',
        formDefinition: { formCode: 'ANC_VISIT', riskRuleSetId: 'rule-set-1' },
        schemaJson: [
          {
            question_code: 'haemoglobin_hb_g_dl',
            label: 'x',
            input_type: 'number',
            required: false,
          },
        ],
        validationJson: [],
      };

      beforeEach(() => {
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(ancVersion as never);
        repository.createSubmission.mockResolvedValue({
          id: 'sub-1',
          submittedAt: new Date('2026-08-01T00:00:00.000Z'),
        } as never);
        repository.findVisitById.mockResolvedValue({ id: 'visit-1' } as never);
      });

      it("merges age/gravida/livingChildren/abortions/priorComplications from the beneficiary's MOTHER_REGISTRATION submission, and passes riskPhase ANC", async () => {
        repository.findLatestSubmissionByBeneficiaryAndFormCode.mockResolvedValue({
          formDataJson: {
            age_of_the_beneficiary: 22,
            gravida_total_number_of_pregnancies: 2,
            living_children: 2,
            abortions_pregnancy_losses_before_24_weeks: 0,
            did_you_experience_any_complications_during_birth_delivery_in_previous_pregnancies: [
              'no_complications',
            ],
          },
        } as never);

        await service.createSubmission(
          'ANC_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            visitId: 'visit-1',
            localSubmissionUuid: 'uuid-1',
            formData: { haemoglobin_hb_g_dl: 9.5 },
          },
          'u1',
          'Bearer test-token',
        );

        expect(repository.findLatestSubmissionByBeneficiaryAndFormCode).toHaveBeenCalledWith(
          'b1',
          'MOTHER_REGISTRATION',
        );
        // badObstetricHistoryFlag is no longer computed here — the ANC risk
        // rule pack (GoRules) now derives it from these raw fields (see
        // PR #172 review: business thresholds live in GoRules).
        expect(jest.mocked(triggerRiskAssessment)).toHaveBeenCalledWith(
          expect.objectContaining({
            riskPhase: 'ANC',
            answers: {
              haemoglobin_hb_g_dl: 9.5,
              age: 22,
              gravida: 2,
              livingChildren: 2,
              abortions: 0,
              priorComplications: ['no_complications'],
              visitDate: '2026-08-01T00:00:00.000Z',
            },
            actualCompletionDate: '2026-08-01',
          }),
          'Bearer test-token',
        );
      });

      it('passes only the registration fields that are actually present as numbers/arrays', async () => {
        repository.findLatestSubmissionByBeneficiaryAndFormCode.mockResolvedValue({
          formDataJson: { gravida_total_number_of_pregnancies: 3, living_children: 1 },
        } as never);

        await service.createSubmission(
          'ANC_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            visitId: 'visit-1',
            localSubmissionUuid: 'uuid-1',
            formData: {},
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(triggerRiskAssessment)).toHaveBeenCalledWith(
          expect.objectContaining({
            answers: {
              gravida: 3,
              livingChildren: 1,
              visitDate: '2026-08-01T00:00:00.000Z',
            },
          }),
          'Bearer test-token',
        );
      });

      it('merges sickleCellStatus from the registration submission when present', async () => {
        repository.findLatestSubmissionByBeneficiaryAndFormCode.mockResolvedValue({
          formDataJson: {
            gravida_total_number_of_pregnancies: 2,
            have_you_been_detected_with_sickle_cell_disease_or_sickle_cell_trait_sct:
              'sickle_cell_disease_scd',
          },
        } as never);

        await service.createSubmission(
          'ANC_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            visitId: 'visit-1',
            localSubmissionUuid: 'uuid-1',
            formData: {},
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(triggerRiskAssessment)).toHaveBeenCalledWith(
          expect.objectContaining({
            answers: expect.objectContaining({ sickleCellStatus: 'sickle_cell_disease_scd' }),
          }),
          'Bearer test-token',
        );
      });

      it('omits sickleCellStatus when the registration submission has no answer for it', async () => {
        repository.findLatestSubmissionByBeneficiaryAndFormCode.mockResolvedValue({
          formDataJson: { gravida_total_number_of_pregnancies: 2 },
        } as never);

        await service.createSubmission(
          'ANC_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            visitId: 'visit-1',
            localSubmissionUuid: 'uuid-1',
            formData: {},
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(triggerRiskAssessment)).toHaveBeenCalledWith(
          expect.objectContaining({
            answers: expect.not.objectContaining({ sickleCellStatus: expect.anything() }),
          }),
          'Bearer test-token',
        );
      });

      it('merges historyOfHypertension: true when the registration medical-conditions list includes hypertension_high_bp', async () => {
        repository.findLatestSubmissionByBeneficiaryAndFormCode.mockResolvedValue({
          formDataJson: {
            gravida_total_number_of_pregnancies: 2,
            have_you_ever_been_diagnosed_with_or_treated_for_any_of_the_following_medical_conditions:
              ['hypertension_high_bp'],
          },
        } as never);

        await service.createSubmission(
          'ANC_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            visitId: 'visit-1',
            localSubmissionUuid: 'uuid-1',
            formData: {},
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(triggerRiskAssessment)).toHaveBeenCalledWith(
          expect.objectContaining({
            answers: expect.objectContaining({ historyOfHypertension: true }),
          }),
          'Bearer test-token',
        );
      });

      it('merges historyOfHypertension: false when the medical-conditions list is answered but excludes hypertension', async () => {
        repository.findLatestSubmissionByBeneficiaryAndFormCode.mockResolvedValue({
          formDataJson: {
            gravida_total_number_of_pregnancies: 2,
            have_you_ever_been_diagnosed_with_or_treated_for_any_of_the_following_medical_conditions:
              ['no_known_medical_condition'],
          },
        } as never);

        await service.createSubmission(
          'ANC_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            visitId: 'visit-1',
            localSubmissionUuid: 'uuid-1',
            formData: {},
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(triggerRiskAssessment)).toHaveBeenCalledWith(
          expect.objectContaining({
            answers: expect.objectContaining({ historyOfHypertension: false }),
          }),
          'Bearer test-token',
        );
      });

      it('omits historyOfHypertension when the registration submission never answered the medical-conditions question', async () => {
        repository.findLatestSubmissionByBeneficiaryAndFormCode.mockResolvedValue({
          formDataJson: { gravida_total_number_of_pregnancies: 2 },
        } as never);

        await service.createSubmission(
          'ANC_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            visitId: 'visit-1',
            localSubmissionUuid: 'uuid-1',
            formData: {},
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(triggerRiskAssessment)).toHaveBeenCalledWith(
          expect.objectContaining({
            answers: expect.not.objectContaining({ historyOfHypertension: expect.anything() }),
          }),
          'Bearer test-token',
        );
      });

      it('proceeds without registration-derived answers when no MOTHER_REGISTRATION submission exists', async () => {
        repository.findLatestSubmissionByBeneficiaryAndFormCode.mockResolvedValue(null);

        await service.createSubmission(
          'ANC_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            visitId: 'visit-1',
            localSubmissionUuid: 'uuid-1',
            formData: { haemoglobin_hb_g_dl: 9.5 },
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(triggerRiskAssessment)).toHaveBeenCalledWith(
          expect.objectContaining({
            riskPhase: 'ANC',
            answers: {
              haemoglobin_hb_g_dl: 9.5,
              visitDate: '2026-08-01T00:00:00.000Z',
            },
          }),
          'Bearer test-token',
        );
      });

      it('does not look up MOTHER_REGISTRATION for a form other than ANC_VISIT', async () => {
        repository.findVersionById.mockResolvedValue({
          ...ancVersion,
          formDefinition: { formCode: 'CHILD_REGISTRATION', riskRuleSetId: 'rule-set-1' },
        } as never);

        await service.createSubmission(
          'CHILD_REGISTRATION',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            visitId: 'visit-1',
            localSubmissionUuid: 'uuid-1',
            formData: { some_field: 'x' },
          },
          'u1',
          'Bearer test-token',
        );

        expect(repository.findLatestSubmissionByBeneficiaryAndFormCode).not.toHaveBeenCalled();
      });
    });

    describe('stageEducationContent — SRS stage-based health-education wiring', () => {
      it('resolves unconditional ANC content (Danger Signs) using registration-derived LMP for gestationalWeeks', async () => {
        const ancVersion = {
          id: 'version-1',
          status: 'PUBLISHED',
          formDefinition: { formCode: 'ANC_VISIT' },
          schemaJson: [{ question_code: 'x', label: 'x', input_type: 'text', required: false }],
          validationJson: [],
        };
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(ancVersion as never);
        repository.createSubmission.mockResolvedValue({
          id: 'sub-1',
          submittedAt: new Date('2026-08-01T00:00:00.000Z'),
        } as never);
        repository.findLatestSubmissionByBeneficiaryAndFormCode.mockResolvedValue({
          formDataJson: { lmp_date: '2026-01-01' },
        } as never);
        repository.countSubmissionsByBeneficiaryAndFormCode.mockResolvedValue(3);
        jest.mocked(resolveHealthEducationMessagesByStage).mockImplementation(async (stage) =>
          stage === 'Show this for all the ANC visits'
            ? [
                {
                  id: 'm1',
                  riskConditionId: null,
                  conditionLabel: 'Danger Signs during Pregnancy',
                  stage,
                  messageOrder: 1,
                  titleEn: 'Danger Signs',
                  bodyEn: 'x',
                  bodyMarathi: '',
                  mediaType: 'TEXT',
                  mediaFile: null,
                  sortOrder: 1,
                },
              ]
            : ([] as never),
        );

        const result = await service.createSubmission(
          'ANC_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {},
          },
          'u1',
          'Bearer test-token',
        );

        expect(result.stageEducationContent).toEqual([
          {
            topicCode: 'Danger Signs during Pregnancy',
            topicName: 'Danger Signs',
            mediaType: 'TEXT',
            contentUrl: null,
          },
        ]);
      });

      it("passes isFirstVisitOfFormCode true when this is the beneficiary's only ANC_VISIT submission so far", async () => {
        const ancVersion = {
          id: 'version-1',
          status: 'PUBLISHED',
          formDefinition: { formCode: 'ANC_VISIT' },
          schemaJson: [{ question_code: 'x', label: 'x', input_type: 'text', required: false }],
          validationJson: [],
        };
        const createdAt = new Date('2026-08-01T00:00:01.000Z');
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(ancVersion as never);
        repository.createSubmission.mockResolvedValue({
          id: 'sub-1',
          submittedAt: new Date('2026-08-01T00:00:00.000Z'),
          createdAt,
        } as never);
        repository.findLatestSubmissionByBeneficiaryAndFormCode.mockResolvedValue(null);
        repository.countSubmissionsByBeneficiaryAndFormCode.mockResolvedValue(1);

        await service.createSubmission(
          'ANC_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {},
          },
          'u1',
          'Bearer test-token',
        );

        // createdAt is the just-created row's OWN createdAt (the count
        // cutoff), not "now" — see countSubmissionsByBeneficiaryAndFormCode's
        // doc comment on why this matters for replay correctness.
        expect(repository.countSubmissionsByBeneficiaryAndFormCode).toHaveBeenCalledWith(
          'b1',
          'ANC_VISIT',
          createdAt,
        );
      });

      it('resolves Neonatal Care content for NEONATAL_VISIT, no LMP lookup needed', async () => {
        const nnVersion = {
          id: 'version-1',
          status: 'PUBLISHED',
          formDefinition: { formCode: 'NEONATAL_VISIT' },
          schemaJson: [{ question_code: 'x', label: 'x', input_type: 'text', required: false }],
          validationJson: [],
        };
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(nnVersion as never);
        repository.createSubmission.mockResolvedValue({
          id: 'sub-1',
          submittedAt: new Date('2026-08-01T00:00:00.000Z'),
        } as never);
        jest.mocked(resolveHealthEducationMessagesByStage).mockImplementation(async (stage) =>
          stage === 'NN1 and NN2'
            ? [
                {
                  id: 'm1',
                  riskConditionId: null,
                  conditionLabel: 'Neonatal Care',
                  stage,
                  messageOrder: 1,
                  titleEn: 'Neonatal Care',
                  bodyEn: 'x',
                  bodyMarathi: '',
                  mediaType: 'TEXT',
                  mediaFile: null,
                  sortOrder: 1,
                },
              ]
            : ([] as never),
        );

        const result = await service.createSubmission(
          'NEONATAL_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {},
          },
          'u1',
          'Bearer test-token',
        );

        expect(result.stageEducationContent).toEqual([
          expect.objectContaining({ topicCode: 'Neonatal Care' }),
        ]);
        expect(jest.mocked(findBeneficiaryById)).not.toHaveBeenCalled();
      });

      it("resolves age-gated INC content using the child beneficiary's date of birth", async () => {
        const incVersion = {
          id: 'version-1',
          status: 'PUBLISHED',
          formDefinition: { formCode: 'INC_VISIT' },
          schemaJson: [{ question_code: 'x', label: 'x', input_type: 'text', required: false }],
          validationJson: [],
        };
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(incVersion as never);
        repository.createSubmission.mockResolvedValue({
          id: 'sub-1',
          submittedAt: new Date('2026-08-01T00:00:00.000Z'),
        } as never);
        jest.mocked(findBeneficiaryById).mockResolvedValue({
          childDateOfBirth: '2026-01-01',
        } as never);
        jest.mocked(resolveHealthEducationMessagesByStage).mockImplementation(async (stage) =>
          stage === 'All INC visits between 6th and 10th month'
            ? [
                {
                  id: 'm1',
                  riskConditionId: null,
                  conditionLabel: 'Infant Care: Complementary Feeding',
                  stage,
                  messageOrder: 3,
                  titleEn: 'Complementary Feeding',
                  bodyEn: 'x',
                  bodyMarathi: '',
                  mediaType: 'TEXT',
                  mediaFile: null,
                  sortOrder: 1,
                },
              ]
            : ([] as never),
        );

        const result = await service.createSubmission(
          'INC_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {},
          },
          'u1',
          'Bearer test-token',
        );

        // submittedAt 2026-08-01, DOB 2026-01-01 -> 7 months old, within the
        // 6-10 month Complementary Feeding window.
        expect(result.stageEducationContent).toEqual([
          expect.objectContaining({ topicCode: 'Infant Care: Complementary Feeding' }),
        ]);
      });

      it('resolves Post-loss content for a DELIVERY_VISIT submission recording a stillbirth', async () => {
        const deliveryVersion = {
          id: 'version-1',
          status: 'PUBLISHED',
          formDefinition: { formCode: 'DELIVERY_VISIT' },
          schemaJson: [{ question_code: 'x', label: 'x', input_type: 'text', required: false }],
          validationJson: [],
        };
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(deliveryVersion as never);
        repository.createSubmission.mockResolvedValue({
          id: 'sub-1',
          submittedAt: new Date('2026-08-01T00:00:00.000Z'),
        } as never);
        jest.mocked(resolveHealthEducationMessagesByStage).mockImplementation(async (stage) =>
          stage.startsWith('If the delivery outcome')
            ? [
                {
                  id: 'm1',
                  riskConditionId: null,
                  conditionLabel: 'Post miscarriage/abortion/still birth',
                  stage,
                  messageOrder: 1,
                  titleEn: 'Loss support',
                  bodyEn: 'x',
                  bodyMarathi: '',
                  mediaType: 'TEXT',
                  mediaFile: null,
                  sortOrder: 1,
                },
              ]
            : ([] as never),
        );

        const result = await service.createSubmission(
          'DELIVERY_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: { child1_delivery_outcome: 'antepartum_still_birth_fresh' },
          },
          'u1',
          'Bearer test-token',
        );

        expect(result.stageEducationContent).toEqual([
          expect.objectContaining({ topicCode: 'Post miscarriage/abortion/still birth' }),
        ]);
      });

      it('resolves Post-loss content for an ANC_CLOSURE_VISIT submission with a miscarriage reason', async () => {
        const closureVersion = {
          id: 'version-1',
          status: 'PUBLISHED',
          formDefinition: { formCode: 'ANC_CLOSURE_VISIT' },
          schemaJson: [{ question_code: 'x', label: 'x', input_type: 'text', required: false }],
          validationJson: [],
        };
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(closureVersion as never);
        repository.createSubmission.mockResolvedValue({
          id: 'sub-1',
          submittedAt: new Date('2026-08-01T00:00:00.000Z'),
        } as never);
        jest.mocked(resolveHealthEducationMessagesByStage).mockImplementation(async (stage) =>
          stage.startsWith('If the delivery outcome')
            ? [
                {
                  id: 'm1',
                  riskConditionId: null,
                  conditionLabel: 'Post miscarriage/abortion/still birth',
                  stage,
                  messageOrder: 1,
                  titleEn: 'Loss support',
                  bodyEn: 'x',
                  bodyMarathi: '',
                  mediaType: 'TEXT',
                  mediaFile: null,
                  sortOrder: 1,
                },
              ]
            : ([] as never),
        );

        const result = await service.createSubmission(
          'ANC_CLOSURE_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            // continue_with_closure: 'yes' is required — closure_reason is
            // only trusted when the Sakhi actually confirmed the closure
            // (review finding on PR #222: reading it unconditionally could
            // fire Post-loss content for a hidden-but-still-submitted
            // closure_reason value even when no closure was created).
            formData: { continue_with_closure: 'yes', closure_reason: 'miscarriage' },
          },
          'u1',
          'Bearer test-token',
        );

        expect(result.stageEducationContent).toEqual([
          expect.objectContaining({ topicCode: 'Post miscarriage/abortion/still birth' }),
        ]);
      });

      it('does NOT resolve Post-loss content for ANC_CLOSURE_VISIT when continue_with_closure is not yes, even if closure_reason is a loss reason', async () => {
        const closureVersion = {
          id: 'version-1',
          status: 'PUBLISHED',
          formDefinition: { formCode: 'ANC_CLOSURE_VISIT' },
          schemaJson: [{ question_code: 'x', label: 'x', input_type: 'text', required: false }],
          validationJson: [],
        };
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(closureVersion as never);
        repository.createSubmission.mockResolvedValue({
          id: 'sub-1',
          submittedAt: new Date('2026-08-01T00:00:00.000Z'),
        } as never);
        jest.mocked(resolveHealthEducationMessagesByStage).mockResolvedValue([
          {
            id: 'm1',
            riskConditionId: null,
            conditionLabel: 'Post miscarriage/abortion/still birth',
            stage:
              "If the delivery outcome is 'Still birth' or 'Miscarriage' and 'Abortion' in Closure form",
            messageOrder: 1,
            titleEn: 'Loss support',
            bodyEn: 'x',
            bodyMarathi: '',
            mediaType: 'TEXT',
            mediaFile: null,
            sortOrder: 1,
          },
        ]);

        // A Sakhi who selected continue_with_closure='yes' + a loss reason,
        // then reconsidered and set continue_with_closure='no' before
        // submitting, but whose client didn't clear the now-hidden
        // closure_reason field — the exact hidden-field-state scenario
        // flagged in review.
        const result = await service.createSubmission(
          'ANC_CLOSURE_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: { continue_with_closure: 'no', closure_reason: 'miscarriage' },
          },
          'u1',
          'Bearer test-token',
        );

        expect(result.stageEducationContent).toEqual([]);
      });

      it('returns an empty array for a formCode with no stage-based content (e.g. MOTHER_REGISTRATION)', async () => {
        const version = {
          id: 'version-1',
          status: 'PUBLISHED',
          formDefinition: { formCode: 'MOTHER_REGISTRATION' },
          schemaJson: [{ question_code: 'x', label: 'x', input_type: 'text', required: false }],
          validationJson: [],
        };
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(version as never);
        repository.createSubmission.mockResolvedValue({
          id: 'sub-1',
          submittedAt: new Date('2026-08-01T00:00:00.000Z'),
        } as never);

        const result = await service.createSubmission(
          'MOTHER_REGISTRATION',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {},
          },
          'u1',
          'Bearer test-token',
        );

        expect(result.stageEducationContent).toEqual([]);
        expect(jest.mocked(resolveHealthEducationMessagesByStage)).not.toHaveBeenCalled();
      });

      it('degrades to an empty array (never fails the submission) when resolution throws', async () => {
        const ancVersion = {
          id: 'version-1',
          status: 'PUBLISHED',
          formDefinition: { formCode: 'ANC_VISIT' },
          schemaJson: [{ question_code: 'x', label: 'x', input_type: 'text', required: false }],
          validationJson: [],
        };
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(ancVersion as never);
        repository.createSubmission.mockResolvedValue({
          id: 'sub-1',
          submittedAt: new Date('2026-08-01T00:00:00.000Z'),
        } as never);
        repository.countSubmissionsByBeneficiaryAndFormCode.mockRejectedValue(new Error('db down'));

        const result = await service.createSubmission(
          'ANC_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {},
          },
          'u1',
          'Bearer test-token',
        );

        expect(result.stageEducationContent).toEqual([]);
      });

      it('re-resolves stageEducationContent on an idempotent replay (retried localSubmissionUuid)', async () => {
        const existing = {
          id: 'sub-1',
          beneficiaryId: 'b1',
          submittedAt: new Date('2026-08-01T00:00:00.000Z'),
        };
        repository.findSubmissionByLocalUuid.mockResolvedValue(existing as never);
        jest.mocked(resolveHealthEducationMessagesByStage).mockImplementation(async (stage) =>
          stage === 'NN1 and NN2'
            ? [
                {
                  id: 'm1',
                  riskConditionId: null,
                  conditionLabel: 'Neonatal Care',
                  stage,
                  messageOrder: 1,
                  titleEn: 'Neonatal Care',
                  bodyEn: 'x',
                  bodyMarathi: '',
                  mediaType: 'TEXT',
                  mediaFile: null,
                  sortOrder: 1,
                },
              ]
            : ([] as never),
        );

        const result = await service.createSubmission(
          'NEONATAL_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'retry-uuid',
            formData: {},
          },
          'u1',
          'Bearer test-token',
        );

        expect(result.stageEducationContent).toEqual([
          expect.objectContaining({ topicCode: 'Neonatal Care' }),
        ]);
        expect(repository.findVersionById).not.toHaveBeenCalled();
      });
    });

    describe('FORM_CODE_TO_RISK_PHASE mapping (PR #172 review)', () => {
      // Every formCode below is given riskRuleSetId: 'rule-set-1' so
      // triggerRiskAssessment fires, and each assertion checks the actual
      // riskPhase value sent — not just objectContaining(...) with the field
      // omitted, which previously let an invalid/fallback riskPhase (e.g. the
      // raw, un-mapped formCode) pass this suite silently (see PR #172
      // review: expect.objectContaining never asserted riskPhase, so
      // DELIVERY_VISIT/POSTPARTUM_VISIT/MOTHER_REGISTRATION/CHILD_REGISTRATION
      // being missing from the map went undetected).
      beforeEach(() => {
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.createSubmission.mockResolvedValue({
          id: 'sub-1',
          submittedAt: new Date('2026-08-01T00:00:00.000Z'),
        } as never);
        repository.findVisitById.mockResolvedValue({ id: 'visit-1' } as never);
        repository.findLatestSubmissionByBeneficiaryAndFormCode.mockResolvedValue(null);
      });

      const CASES: Array<[string, string]> = [
        ['MOTHER_REGISTRATION', 'REGISTRATION'],
        ['CHILD_REGISTRATION', 'REGISTRATION'],
        ['ANC_VISIT', 'ANC'],
        ['DELIVERY_VISIT', 'DELIVERY'],
        ['POSTPARTUM_VISIT', 'PP'],
        ['NEONATAL_VISIT', 'INC'],
        ['INC_VISIT', 'INC'],
        ['CCV_VISIT', 'INC'],
      ];

      it.each(CASES)('sends riskPhase %s -> %s', async (formCode, expectedRiskPhase) => {
        repository.findVersionById.mockResolvedValue({
          id: 'version-1',
          status: 'PUBLISHED',
          formDefinition: { formCode, riskRuleSetId: 'rule-set-1' },
          schemaJson: [{ question_code: 'x', label: 'x', input_type: 'text', required: false }],
          validationJson: [],
        } as never);

        await service.createSubmission(
          formCode,
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            visitId: 'visit-1',
            localSubmissionUuid: 'uuid-1',
            formData: {},
          },
          'u1',
          'Bearer test-token',
        );

        expect(jest.mocked(triggerRiskAssessment)).toHaveBeenCalledWith(
          expect.objectContaining({ riskPhase: expectedRiskPhase }),
          'Bearer test-token',
        );
      });

      it('throws rather than sending an invalid riskPhase for a formCode with a riskRuleSetId but no mapping entry', async () => {
        repository.findVersionById.mockResolvedValue({
          id: 'version-1',
          status: 'PUBLISHED',
          formDefinition: { formCode: 'SOME_UNMAPPED_FORM', riskRuleSetId: 'rule-set-1' },
          schemaJson: [{ question_code: 'x', label: 'x', input_type: 'text', required: false }],
          validationJson: [],
        } as never);

        await expect(
          service.createSubmission(
            'SOME_UNMAPPED_FORM',
            {
              formVersionId: 'version-1',
              beneficiaryId: 'b1',
              visitId: 'visit-1',
              localSubmissionUuid: 'uuid-1',
              formData: {},
            },
            'u1',
            'Bearer test-token',
          ),
        ).rejects.toThrow(/FORM_CODE_TO_RISK_PHASE/);

        expect(jest.mocked(triggerRiskAssessment)).not.toHaveBeenCalled();
      });
    });

    describe('DELIVERY_VISIT childBeneficiaryIds in response', () => {
      const motherCase = {
        id: 'b1',
        sakhiId: 'sakhi-1',
        projectId: 'project-1',
        beneficiaryTypeLookupId: 'type-1',
        caseTypeLookupId: 'case-type-1',
        currentPhase: 'ANC',
        villageId: 'village-1',
        padaId: 'pada-1',
        healthSubCentreId: 'sc-1',
        phcId: 'phc-1',
        stateId: 'state-1',
        districtId: 'district-1',
        childDateOfBirth: null,
        fullName: 'Jane Doe',
      };

      const deliveryVersion = {
        id: 'version-1',
        status: 'PUBLISHED',
        formDefinition: { formCode: 'DELIVERY_VISIT' },
        schemaJson: [
          { question_code: 'date_of_delivery', label: 'x', input_type: 'date', required: false },
          ...['child1', 'child2', 'child3'].flatMap((prefix) => [
            {
              question_code: `${prefix}_delivery_outcome`,
              label: 'x',
              input_type: 'dropdown',
              required: false,
            },
          ]),
        ],
        validationJson: [],
      };

      const deliveryFormData = {
        date_of_delivery: '2026-08-01',
        child1_delivery_outcome: 'live_birth',
        child2_delivery_outcome: 'live_birth',
        child3_delivery_outcome: 'live_birth',
      };

      beforeEach(() => {
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.findVersionById.mockResolvedValue(deliveryVersion as never);
        repository.createSubmission.mockResolvedValue({ id: 'sub-1' } as never);
        jest.mocked(findBeneficiaryById).mockResolvedValue(motherCase);
      });

      it('includes a single child id for a single live birth', async () => {
        jest.mocked(createChildBeneficiary).mockResolvedValue('child-1');

        const result = await service.createSubmission(
          'DELIVERY_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: { date_of_delivery: '2026-08-01', child1_delivery_outcome: 'live_birth' },
          },
          'u1',
          'Bearer test-token',
        );

        expect(result).toEqual(expect.objectContaining({ childBeneficiaryIds: ['child-1'] }));
      });

      it('includes both child ids, in order, for twins', async () => {
        jest
          .mocked(createChildBeneficiary)
          .mockImplementation(async (input) =>
            input.localCaseUuid === 'uuid-1-child1' ? 'child-1' : 'child-2',
          );

        const result = await service.createSubmission(
          'DELIVERY_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {
              date_of_delivery: '2026-08-01',
              child1_delivery_outcome: 'live_birth',
              child2_delivery_outcome: 'live_birth',
            },
          },
          'u1',
          'Bearer test-token',
        );

        expect(result).toEqual(
          expect.objectContaining({ childBeneficiaryIds: ['child-1', 'child-2'] }),
        );
      });

      it('includes all three child ids, in order, for triplets', async () => {
        jest.mocked(createChildBeneficiary).mockImplementation(async (input) => {
          if (input.localCaseUuid === 'uuid-1-child1') return 'child-1';
          if (input.localCaseUuid === 'uuid-1-child2') return 'child-2';
          return 'child-3';
        });

        const result = await service.createSubmission(
          'DELIVERY_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: deliveryFormData,
          },
          'u1',
          'Bearer test-token',
        );

        expect(result).toEqual(
          expect.objectContaining({ childBeneficiaryIds: ['child-1', 'child-2', 'child-3'] }),
        );
      });

      it('omits childBeneficiaryIds entirely when there is no live birth', async () => {
        jest.mocked(createChildBeneficiary).mockResolvedValue(null);

        const result = await service.createSubmission(
          'DELIVERY_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {
              date_of_delivery: '2026-08-01',
              child1_delivery_outcome: 'antepartum_still_birth_fresh',
            },
          },
          'u1',
          'Bearer test-token',
        );

        expect('childBeneficiaryIds' in result).toBe(false);
      });

      it('includes only the live-born child when one of two is stillborn', async () => {
        jest.mocked(createChildBeneficiary).mockResolvedValue('child-1');

        const result = await service.createSubmission(
          'DELIVERY_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {
              date_of_delivery: '2026-08-01',
              child1_delivery_outcome: 'live_birth',
              child2_delivery_outcome: 'antepartum_still_birth_fresh',
            },
          },
          'u1',
          'Bearer test-token',
        );

        expect(result).toEqual(expect.objectContaining({ childBeneficiaryIds: ['child-1'] }));
      });

      it('omits a child whose beneficiary-service creation call failed, keeps the others', async () => {
        jest
          .mocked(createChildBeneficiary)
          .mockImplementation(async (input) =>
            input.localCaseUuid === 'uuid-1-child1' ? 'child-1' : null,
          );

        const result = await service.createSubmission(
          'DELIVERY_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {
              date_of_delivery: '2026-08-01',
              child1_delivery_outcome: 'live_birth',
              child2_delivery_outcome: 'live_birth',
            },
          },
          'u1',
          'Bearer test-token',
        );

        expect(result).toEqual(expect.objectContaining({ childBeneficiaryIds: ['child-1'] }));
      });

      it('still returns the child id even when its phase-advance call fails', async () => {
        jest.mocked(createChildBeneficiary).mockResolvedValue('child-1');
        jest.mocked(updateBeneficiaryPhase).mockRejectedValue(new Error('network error'));

        const result = await service.createSubmission(
          'DELIVERY_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: { date_of_delivery: '2026-08-01', child1_delivery_outcome: 'live_birth' },
          },
          'u1',
          'Bearer test-token',
        );

        expect(result).toEqual(expect.objectContaining({ childBeneficiaryIds: ['child-1'] }));
      });

      it('omits childBeneficiaryIds for a non-DELIVERY_VISIT form', async () => {
        repository.findVersionById.mockResolvedValue({
          ...publishedVersion,
          formDefinition: { formCode: 'MOTHER_REGISTRATION' },
        } as never);

        const result = await service.createSubmission(
          'MOTHER_REGISTRATION',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: { phone_owner: 'SELF' },
          },
          'u1',
          'Bearer test-token',
        );

        expect('childBeneficiaryIds' in result).toBe(false);
      });

      it('omits childBeneficiaryIds when the mother case cannot be found', async () => {
        jest.mocked(findBeneficiaryById).mockResolvedValue(null);

        const result = await service.createSubmission(
          'DELIVERY_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: { date_of_delivery: '2026-08-01', child1_delivery_outcome: 'live_birth' },
          },
          'u1',
          'Bearer test-token',
        );

        expect('childBeneficiaryIds' in result).toBe(false);
      });

      describe('idempotent replay', () => {
        it('re-resolves the same child ids on a retried DELIVERY_VISIT submission', async () => {
          const existing = { id: 'sub-1' };
          repository.findSubmissionByLocalUuid.mockResolvedValue(existing as never);
          jest
            .mocked(createChildBeneficiary)
            .mockImplementation(async (input) =>
              input.localCaseUuid === 'uuid-1-child1' ? 'child-1' : 'child-2',
            );

          const result = await service.createSubmission(
            'DELIVERY_VISIT',
            {
              formVersionId: 'version-1',
              beneficiaryId: 'b1',
              localSubmissionUuid: 'uuid-1',
              formData: {
                date_of_delivery: '2026-08-01',
                child1_delivery_outcome: 'live_birth',
                child2_delivery_outcome: 'live_birth',
              },
            },
            'u1',
            'Bearer test-token',
          );

          expect(jest.mocked(createChildBeneficiary)).toHaveBeenCalledWith(
            expect.objectContaining({ localCaseUuid: 'uuid-1-child1' }),
            'Bearer test-token',
          );
          expect(jest.mocked(createChildBeneficiary)).toHaveBeenCalledWith(
            expect.objectContaining({ localCaseUuid: 'uuid-1-child2' }),
            'Bearer test-token',
          );
          expect(result).toEqual(
            expect.objectContaining({ childBeneficiaryIds: ['child-1', 'child-2'] }),
          );
          expect(repository.findVersionById).not.toHaveBeenCalled();
        });

        it('does not attempt child resolution on replay of a non-DELIVERY_VISIT submission', async () => {
          const existing = { id: 'sub-1' };
          repository.findSubmissionByLocalUuid.mockResolvedValue(existing as never);

          const result = await service.createSubmission(
            'MOTHER_REGISTRATION',
            {
              formVersionId: 'version-1',
              beneficiaryId: 'b1',
              localSubmissionUuid: 'retry-uuid',
              formData: {},
            },
            'u1',
            'Bearer test-token',
          );

          expect(jest.mocked(findBeneficiaryById)).not.toHaveBeenCalled();
          expect(jest.mocked(createChildBeneficiary)).not.toHaveBeenCalled();
          expect('childBeneficiaryIds' in result).toBe(false);
        });

        it('omits childBeneficiaryIds on replay when child resolution now fails', async () => {
          const existing = { id: 'sub-1' };
          repository.findSubmissionByLocalUuid.mockResolvedValue(existing as never);
          jest.mocked(createChildBeneficiary).mockResolvedValue(null);

          const result = await service.createSubmission(
            'DELIVERY_VISIT',
            {
              formVersionId: 'version-1',
              beneficiaryId: 'b1',
              localSubmissionUuid: 'uuid-1',
              formData: { date_of_delivery: '2026-08-01', child1_delivery_outcome: 'live_birth' },
            },
            'u1',
            'Bearer test-token',
          );

          expect('childBeneficiaryIds' in result).toBe(false);
        });
      });
    });

    describe('ANC_CLOSURE_VISIT / CHILD_CLOSURE_VISIT auto-closure', () => {
      const ancClosureVersion = {
        id: 'version-1',
        status: 'PUBLISHED',
        formDefinition: { formCode: 'ANC_CLOSURE_VISIT' },
        schemaJson: [
          {
            question_code: 'continue_with_closure',
            label: 'x',
            input_type: 'radio',
            required: false,
          },
          { question_code: 'closure_reason', label: 'x', input_type: 'dropdown', required: false },
          {
            question_code: 'closure_visit_date',
            label: 'x',
            input_type: 'date',
            required: false,
          },
          { question_code: 'date_of_event', label: 'x', input_type: 'date', required: false },
        ],
        validationJson: [],
      };

      const childClosureVersion = {
        ...ancClosureVersion,
        formDefinition: { formCode: 'CHILD_CLOSURE_VISIT' },
      };

      beforeEach(() => {
        repository.findSubmissionByLocalUuid.mockResolvedValue(null);
        repository.createSubmission.mockResolvedValue({ id: 'sub-1' } as never);
        jest.mocked(resolveClosureReasonLookupId).mockResolvedValue('reason-lookup-id');
      });

      it.each([
        ['withdrawal_of_consent', 'NON_MEDICAL'],
        ['miscarriage', 'MEDICAL'],
        ['abortion_spontaneous_induced_mtp', 'MEDICAL'],
        ['maternal_death', 'MEDICAL'],
        ['program_cycle_completed', 'PROGRAM_COMPLETION'],
      ])('maps closure_reason %s to closureType %s', async (reason, expectedType) => {
        repository.findVersionById.mockResolvedValue(ancClosureVersion as never);

        await service.createSubmission(
          'ANC_CLOSURE_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {
              continue_with_closure: 'yes',
              closure_reason: reason,
              closure_visit_date: '2026-08-18',
              date_of_event: '2026-08-18',
            },
          },
          'sakhi-1',
          'Bearer test-token',
        );

        expect(jest.mocked(createClosure)).toHaveBeenCalledWith(
          expect.objectContaining({ closureType: expectedType }),
          'Bearer test-token',
        );
      });

      it('maps CHILD_CLOSURE_VISIT infant_child_death to MEDICAL', async () => {
        repository.findVersionById.mockResolvedValue(childClosureVersion as never);

        await service.createSubmission(
          'CHILD_CLOSURE_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {
              continue_with_closure: 'yes',
              closure_reason: 'infant_child_death',
              closure_visit_date: '2026-08-18',
            },
          },
          'sakhi-1',
          'Bearer test-token',
        );

        expect(jest.mocked(createClosure)).toHaveBeenCalledWith(
          expect.objectContaining({ closureType: 'MEDICAL' }),
          'Bearer test-token',
        );
      });

      it('sets supervisorStatus: PENDING only for migration', async () => {
        repository.findVersionById.mockResolvedValue(ancClosureVersion as never);

        await service.createSubmission(
          'ANC_CLOSURE_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {
              continue_with_closure: 'yes',
              closure_reason: 'migration',
              closure_visit_date: '2026-08-18',
            },
          },
          'sakhi-1',
          'Bearer test-token',
        );

        expect(jest.mocked(createClosure)).toHaveBeenCalledWith(
          expect.objectContaining({ supervisorStatus: 'PENDING' }),
          'Bearer test-token',
        );
      });

      it('does not set supervisorStatus for a non-migration reason', async () => {
        repository.findVersionById.mockResolvedValue(ancClosureVersion as never);

        await service.createSubmission(
          'ANC_CLOSURE_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {
              continue_with_closure: 'yes',
              closure_reason: 'withdrawal_of_consent',
              closure_visit_date: '2026-08-18',
            },
          },
          'sakhi-1',
          'Bearer test-token',
        );

        expect(jest.mocked(createClosure)).toHaveBeenCalledWith(
          expect.not.objectContaining({ supervisorStatus: expect.anything() }),
          'Bearer test-token',
        );
      });

      it('does not create a closure when continue_with_closure is no', async () => {
        repository.findVersionById.mockResolvedValue(ancClosureVersion as never);

        await service.createSubmission(
          'ANC_CLOSURE_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: { continue_with_closure: 'no' },
          },
          'sakhi-1',
          'Bearer test-token',
        );

        expect(jest.mocked(createClosure)).not.toHaveBeenCalled();
      });

      it('does not create a closure when continue_with_closure is missing', async () => {
        repository.findVersionById.mockResolvedValue(ancClosureVersion as never);

        await service.createSubmission(
          'ANC_CLOSURE_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: { closure_reason: 'migration', closure_visit_date: '2026-08-18' },
          },
          'sakhi-1',
          'Bearer test-token',
        );

        expect(jest.mocked(createClosure)).not.toHaveBeenCalled();
      });

      it('does not create a closure when the reason does not resolve to a lookup value', async () => {
        repository.findVersionById.mockResolvedValue(ancClosureVersion as never);
        jest.mocked(resolveClosureReasonLookupId).mockResolvedValue(null);

        await service.createSubmission(
          'ANC_CLOSURE_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {
              continue_with_closure: 'yes',
              closure_reason: 'not_a_real_reason',
              closure_visit_date: '2026-08-18',
            },
          },
          'sakhi-1',
          'Bearer test-token',
        );

        expect(jest.mocked(createClosure)).not.toHaveBeenCalled();
      });

      it('still returns a successful submission when createClosure throws', async () => {
        repository.findVersionById.mockResolvedValue(ancClosureVersion as never);
        jest.mocked(createClosure).mockRejectedValue(new Error('down'));

        const result = await service.createSubmission(
          'ANC_CLOSURE_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {
              continue_with_closure: 'yes',
              closure_reason: 'migration',
              closure_visit_date: '2026-08-18',
            },
          },
          'sakhi-1',
          'Bearer test-token',
        );

        expect(result).toEqual({ id: 'sub-1', stageEducationContent: [] });
      });

      it('derives localClosureUuid deterministically from localSubmissionUuid', async () => {
        repository.findVersionById.mockResolvedValue(ancClosureVersion as never);

        await service.createSubmission(
          'ANC_CLOSURE_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-42',
            formData: {
              continue_with_closure: 'yes',
              closure_reason: 'migration',
              closure_visit_date: '2026-08-18',
            },
          },
          'sakhi-1',
          'Bearer test-token',
        );

        expect(jest.mocked(createClosure)).toHaveBeenCalledWith(
          expect.objectContaining({ localClosureUuid: 'uuid-42-closure' }),
          'Bearer test-token',
        );
      });

      it('passes eventDate/closureDate/submittedByUserId/beneficiaryId through', async () => {
        repository.findVersionById.mockResolvedValue(ancClosureVersion as never);

        await service.createSubmission(
          'ANC_CLOSURE_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b42',
            localSubmissionUuid: 'uuid-1',
            formData: {
              continue_with_closure: 'yes',
              closure_reason: 'migration',
              closure_visit_date: '2026-08-20',
              date_of_event: '2026-08-15',
            },
          },
          'sakhi-99',
          'Bearer test-token',
        );

        expect(jest.mocked(createClosure)).toHaveBeenCalledWith(
          expect.objectContaining({
            beneficiaryId: 'b42',
            closureDate: '2026-08-20',
            eventDate: '2026-08-15',
            submittedByUserId: 'sakhi-99',
          }),
          'Bearer test-token',
        );
      });

      it('does not call createClosure for a non-closure form', async () => {
        repository.findVersionById.mockResolvedValue(publishedVersion as never);

        await service.createSubmission(
          'MOTHER_REGISTRATION',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: { phone_owner: 'SELF' },
          },
          'sakhi-1',
          'Bearer test-token',
        );

        expect(jest.mocked(createClosure)).not.toHaveBeenCalled();
      });

      it('re-runs createClosure on an idempotent replay (same localSubmissionUuid)', async () => {
        const existing = {
          id: 'sub-1',
          beneficiaryId: 'b1',
          ruleVersionId: null,
          syncBatchId: null,
        };
        repository.findSubmissionByLocalUuid.mockResolvedValue(existing as never);

        await service.createSubmission(
          'ANC_CLOSURE_VISIT',
          {
            formVersionId: 'version-1',
            beneficiaryId: 'b1',
            localSubmissionUuid: 'uuid-1',
            formData: {
              continue_with_closure: 'yes',
              closure_reason: 'migration',
              closure_visit_date: '2026-08-18',
            },
          },
          'sakhi-1',
          'Bearer test-token',
        );

        // createClosure itself is idempotent downstream (same localClosureUuid
        // resolves to the same closure via closure-reopen-service), so a
        // replay re-running this call is safe and matches resolveDeliveryChildren's
        // own re-run-on-replay behavior.
        expect(jest.mocked(createClosure)).toHaveBeenCalledWith(
          expect.objectContaining({ localClosureUuid: 'uuid-1-closure' }),
          'Bearer test-token',
        );
      });
    });
  });

  describe('getLatestVisitVitals', () => {
    const sakhiCaller = { id: 'sakhi-1', roles: ['SAKHI'] as const };

    beforeEach(() => {
      jest.mocked(findBeneficiaryOwnership).mockResolvedValue({ sakhiId: 'sakhi-1' } as never);
    });

    it("extracts the latest visit's vitals per its own formCode's mapping", async () => {
      repository.findLatestVisitSubmission.mockResolvedValue({
        visitId: 'visit-1',
        submittedAt: new Date('2026-08-01T00:00:00.000Z'),
        formDataJson: { blood_pressure_bp_systolic: 120, haemoglobin_hb_g_dl: 11.5 },
        formVersion: { formDefinition: { formCode: 'ANC_VISIT' } },
      } as never);

      const result = await service.getLatestVisitVitals('ben-1', sakhiCaller, 'Bearer test-token');

      expect(result).toEqual(
        expect.objectContaining({
          visitId: 'visit-1',
          submittedAt: new Date('2026-08-01T00:00:00.000Z'),
          systolicBp: 120,
          hemoglobinGDl: 11.5,
          weightKg: null,
        }),
      );
    });

    it('returns an all-null snapshot with null visitId/submittedAt when the beneficiary has never had a qualifying visit', async () => {
      repository.findLatestVisitSubmission.mockResolvedValue(null);

      const result = await service.getLatestVisitVitals('ben-1', sakhiCaller, 'Bearer test-token');

      expect(result).toEqual({
        visitId: null,
        submittedAt: null,
        weightKg: null,
        systolicBp: null,
        diastolicBp: null,
        temperatureF: null,
        hemoglobinGDl: null,
        muacCm: null,
        respiratoryRate: null,
        bloodSugarMgDl: null,
      });
    });

    it("rejects when the beneficiary is outside the calling SAKHI's own roster", async () => {
      jest.mocked(findBeneficiaryOwnership).mockResolvedValue({ sakhiId: 'someone-else' } as never);

      await expect(
        service.getLatestVisitVitals('ben-1', sakhiCaller, 'Bearer test-token'),
      ).rejects.toThrow(/outside your own roster/);
      expect(repository.findLatestVisitSubmission).not.toHaveBeenCalled();
    });

    it('throws not-found when the beneficiary case does not exist', async () => {
      jest.mocked(findBeneficiaryOwnership).mockResolvedValue(null);

      await expect(
        service.getLatestVisitVitals('ben-1', sakhiCaller, 'Bearer test-token'),
      ).rejects.toThrow(/not found/i);
    });

    it('resolves ownership via findBeneficiaryOwnership, NOT findBeneficiaryById — using the full profile lookup here would call back into GET /beneficiaries/:id and recreate the vitals request cycle', async () => {
      repository.findLatestVisitSubmission.mockResolvedValue(null);

      await service.getLatestVisitVitals('ben-1', sakhiCaller, 'Bearer test-token');

      expect(jest.mocked(findBeneficiaryOwnership)).toHaveBeenCalledWith(
        'ben-1',
        'Bearer test-token',
      );
      expect(jest.mocked(findBeneficiaryById)).not.toHaveBeenCalled();
    });
  });

  describe('getDeliveryOutcomes', () => {
    it('returns one outcome per child slot present on the latest DELIVERY_VISIT submission, each tagged with its own birthOrder', async () => {
      repository.findLatestDeliverySubmission.mockResolvedValue({
        formDataJson: {
          child1_delivery_outcome: 'live_birth',
          child2_delivery_outcome: 'antepartum_still_birth_fresh',
        },
      } as never);

      const result = await service.getDeliveryOutcomes('mother-1');

      expect(result).toEqual({
        outcomes: [
          { birthOrder: 1, outcome: 'live_birth' },
          { birthOrder: 2, outcome: 'antepartum_still_birth_fresh' },
        ],
      });
    });

    it('returns an empty outcomes array when the mother has no DELIVERY_VISIT submission yet', async () => {
      repository.findLatestDeliverySubmission.mockResolvedValue(null);

      const result = await service.getDeliveryOutcomes('mother-1');

      expect(result).toEqual({ outcomes: [] });
    });

    it('skips a child slot with no delivery-outcome value recorded', async () => {
      repository.findLatestDeliverySubmission.mockResolvedValue({
        formDataJson: { child1_delivery_outcome: 'live_birth' },
      } as never);

      const result = await service.getDeliveryOutcomes('mother-1');

      expect(result).toEqual({ outcomes: [{ birthOrder: 1, outcome: 'live_birth' }] });
    });

    // Regression test for the bug this birthOrder tagging exists to fix: a
    // missing MIDDLE slot must not shift the birthOrder of the slot(s)
    // after it. Before this change, the response was a flat string[] built
    // by filtering out empty slots — child1 absent + child2 present used to
    // collapse to `outcomes: ['antepartum_still_birth_fresh']`, which a
    // consumer had no way to distinguish from "child1 was the stillbirth."
    it('preserves the correct birthOrder when an earlier slot is empty and a later one is present', async () => {
      repository.findLatestDeliverySubmission.mockResolvedValue({
        formDataJson: { child2_delivery_outcome: 'antepartum_still_birth_fresh' },
      } as never);

      const result = await service.getDeliveryOutcomes('mother-1');

      expect(result).toEqual({
        outcomes: [{ birthOrder: 2, outcome: 'antepartum_still_birth_fresh' }],
      });
    });
  });

  describe('updateSubmissionAnswers', () => {
    // who_owns_the_phone/sickle_cell fields are allowlisted for
    // MOTHER_REGISTRATION AND have a real form_answers row (not one of
    // BENEFICIARY_DUPLICATED_FIELD_CODES, unlike enter_the_beneficiary_address/
    // gravida_total_number_of_pregnancies/etc — see beneficiary-duplicated-
    // fields.ts, whose skip in buildFormAnswers applies here too, covered by
    // its own dedicated test below).
    const motherRegistrationFields = [
      {
        question_code: 'who_owns_the_phone',
        label: 'Who owns the phone?',
        input_type: 'select',
        required: true,
      },
      {
        question_code: 'have_you_been_detected_with_sickle_cell_disease_or_sickle_cell_trait_sct',
        label: 'Sickle Cell',
        input_type: 'select',
        required: true,
      },
      {
        question_code: 'enter_the_beneficiary_address',
        label: 'Enter the beneficiary address',
        input_type: 'text_geo',
        required: true,
      },
      {
        question_code: 'lmp_date',
        label: 'LMP Date',
        input_type: 'date',
        required: true,
      },
      {
        question_code: 'trimester_of_preganancy',
        label: 'Trimester of preganancy',
        input_type: 'text',
        required: true,
      },
    ];

    const sakhiCaller = { id: 'sakhi-1', roles: ['SAKHI'] as const };

    function mockSubmission(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: 'sub-1',
        beneficiaryId: 'ben-1',
        formDataJson: {
          who_owns_the_phone: 'self',
          have_you_been_detected_with_sickle_cell_disease_or_sickle_cell_trait_sct:
            'not_tested_yet',
          enter_the_beneficiary_address: 'Old address',
          trimester_of_preganancy: 'second',
        },
        formVersion: {
          schemaJson: motherRegistrationFields,
          formDefinition: { formCode: 'MOTHER_REGISTRATION' },
        },
        ...overrides,
      };
    }

    beforeEach(() => {
      // Legitimate-edit tests: the calling SAKHI owns the submission's
      // beneficiary (ben-1), so assertCallerOwnsBeneficiary's roster check
      // passes and the edit proceeds — see the dedicated IDOR test below for
      // the rejection path.
      jest.mocked(findBeneficiaryOwnership).mockResolvedValue({ sakhiId: 'sakhi-1' } as never);
    });

    it('patches one allowlisted field, updating both formDataJson and the matching FormAnswer row', async () => {
      repository.findSubmissionById.mockResolvedValue(mockSubmission() as never);
      repository.updateSubmissionAnswers.mockResolvedValue({
        id: 'sub-1',
        formDataJson: { who_owns_the_phone: 'husband' },
      } as never);

      await service.updateSubmissionAnswers(
        'sub-1',
        [{ fieldCode: 'who_owns_the_phone', value: 'husband' }],
        sakhiCaller,
        'Bearer token',
      );

      expect(repository.updateSubmissionAnswers).toHaveBeenCalledWith(
        'sub-1',
        expect.objectContaining({ who_owns_the_phone: 'husband' }),
        [
          expect.objectContaining({
            fieldCode: 'who_owns_the_phone',
            answerValueText: 'husband',
          }),
        ],
      );
    });

    it('applies multiple field edits in one call atomically (single repository call)', async () => {
      repository.findSubmissionById.mockResolvedValue(mockSubmission() as never);
      repository.updateSubmissionAnswers.mockResolvedValue(mockSubmission() as never);

      await service.updateSubmissionAnswers(
        'sub-1',
        [
          { fieldCode: 'who_owns_the_phone', value: 'husband' },
          {
            fieldCode: 'have_you_been_detected_with_sickle_cell_disease_or_sickle_cell_trait_sct',
            value: 'sickle_cell_trait_sct_carrier',
          },
        ],
        sakhiCaller,
        'Bearer token',
      );

      expect(repository.updateSubmissionAnswers).toHaveBeenCalledTimes(1);
      const [, mergedFormData, answerRows] = repository.updateSubmissionAnswers.mock.calls[0];
      expect(mergedFormData).toEqual(
        expect.objectContaining({
          who_owns_the_phone: 'husband',
          have_you_been_detected_with_sickle_cell_disease_or_sickle_cell_trait_sct:
            'sickle_cell_trait_sct_carrier',
          enter_the_beneficiary_address: 'Old address',
        }),
      );
      expect(answerRows).toHaveLength(2);
    });

    // The allowlist deliberately includes fields (e.g. Address, per SRS J.4)
    // whose question_code is also one of BENEFICIARY_DUPLICATED_FIELD_CODES
    // — buildFormAnswers skips those from the form_answers projection
    // regardless of caller (see form.mapper.ts's own doc comment), so this
    // endpoint must still patch formDataJson for them even though no
    // FormAnswer row is written or updated.
    it('patches formDataJson but writes no FormAnswer row for a beneficiary-duplicated allowlisted field', async () => {
      repository.findSubmissionById.mockResolvedValue(mockSubmission() as never);
      repository.updateSubmissionAnswers.mockResolvedValue(mockSubmission() as never);

      await service.updateSubmissionAnswers(
        'sub-1',
        [{ fieldCode: 'enter_the_beneficiary_address', value: 'New address' }],
        sakhiCaller,
        'Bearer token',
      );

      expect(repository.updateSubmissionAnswers).toHaveBeenCalledWith(
        'sub-1',
        expect.objectContaining({ enter_the_beneficiary_address: 'New address' }),
        [],
      );
    });

    it('rejects the whole request (422, no partial apply) when a field is not allowlisted for the form code', async () => {
      repository.findSubmissionById.mockResolvedValue(mockSubmission() as never);

      await expect(
        service.updateSubmissionAnswers(
          'sub-1',
          [
            { fieldCode: 'enter_the_beneficiary_address', value: 'New address' },
            { fieldCode: 'trimester_of_preganancy', value: 'third' },
          ],
          sakhiCaller,
          'Bearer token',
        ),
      ).rejects.toThrow(/not editable after submission/);

      expect(repository.updateSubmissionAnswers).not.toHaveBeenCalled();
    });

    it('rejects LMP date specifically — excluded from the PW Registration allowlist even though SRS J.4 lists it, since LMP correction has its own approval-gated flow', async () => {
      repository.findSubmissionById.mockResolvedValue(mockSubmission() as never);

      await expect(
        service.updateSubmissionAnswers(
          'sub-1',
          [{ fieldCode: 'lmp_date', value: '2026-01-01' }],
          sakhiCaller,
          'Bearer token',
        ),
      ).rejects.toThrow(/not editable after submission/);

      expect(repository.updateSubmissionAnswers).not.toHaveBeenCalled();
    });

    it('rejects with 400 when a fieldCode does not exist on the submission form at all', async () => {
      repository.findSubmissionById.mockResolvedValue(mockSubmission() as never);

      await expect(
        service.updateSubmissionAnswers(
          'sub-1',
          [{ fieldCode: 'not_a_real_field', value: 'x' }],
          sakhiCaller,
          'Bearer token',
        ),
      ).rejects.toThrow(/Unknown fieldCode/);

      expect(repository.updateSubmissionAnswers).not.toHaveBeenCalled();
    });

    it('throws 404 when the submission does not exist', async () => {
      repository.findSubmissionById.mockResolvedValue(null);

      await expect(
        service.updateSubmissionAnswers(
          'missing-sub',
          [{ fieldCode: 'enter_the_beneficiary_address', value: 'x' }],
          sakhiCaller,
          'Bearer token',
        ),
      ).rejects.toThrow(/not found/);
    });

    it('calls the audit client with beforeJson/afterJson per edited field after a successful edit', async () => {
      repository.findSubmissionById.mockResolvedValue(mockSubmission() as never);
      repository.updateSubmissionAnswers.mockResolvedValue(mockSubmission() as never);

      await service.updateSubmissionAnswers(
        'sub-1',
        [{ fieldCode: 'enter_the_beneficiary_address', value: 'New address' }],
        sakhiCaller,
        'Bearer token',
      );

      expect(auditClient.log).toHaveBeenCalledWith(
        'sakhi-1',
        'FORM_ANSWER_EDIT',
        'FormSubmission',
        'sub-1',
        { enter_the_beneficiary_address: 'Old address' },
        { enter_the_beneficiary_address: 'New address' },
        'Bearer token',
        undefined,
      );
    });

    it('still succeeds and still audit-logs when a field is patched to its current value (no no-op exemption)', async () => {
      repository.findSubmissionById.mockResolvedValue(mockSubmission() as never);
      repository.updateSubmissionAnswers.mockResolvedValue(mockSubmission() as never);

      await service.updateSubmissionAnswers(
        'sub-1',
        [{ fieldCode: 'enter_the_beneficiary_address', value: 'Old address' }],
        sakhiCaller,
        'Bearer token',
      );

      expect(repository.updateSubmissionAnswers).toHaveBeenCalledTimes(1);
      expect(auditClient.log).toHaveBeenCalledWith(
        'sakhi-1',
        'FORM_ANSWER_EDIT',
        'FormSubmission',
        'sub-1',
        { enter_the_beneficiary_address: 'Old address' },
        { enter_the_beneficiary_address: 'Old address' },
        'Bearer token',
        undefined,
      );
    });

    it('does not fail the request when the best-effort audit write throws', async () => {
      repository.findSubmissionById.mockResolvedValue(mockSubmission() as never);
      repository.updateSubmissionAnswers.mockResolvedValue(mockSubmission() as never);
      auditClient.log.mockRejectedValue(new Error('audit-service unreachable'));
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await expect(
        service.updateSubmissionAnswers(
          'sub-1',
          [{ fieldCode: 'enter_the_beneficiary_address', value: 'New address' }],
          sakhiCaller,
          'Bearer token',
        ),
      ).resolves.toBeDefined();

      errorSpy.mockRestore();
    });

    it('rejects the whole request when an unknown fieldCode and an unallowlisted fieldCode are both present, unknown reported first', async () => {
      repository.findSubmissionById.mockResolvedValue(mockSubmission() as never);

      await expect(
        service.updateSubmissionAnswers(
          'sub-1',
          [
            { fieldCode: 'not_a_real_field', value: 'x' },
            { fieldCode: 'trimester_of_preganancy', value: 'third' },
          ],
          sakhiCaller,
          'Bearer token',
        ),
      ).rejects.toThrow(/Unknown fieldCode/);

      expect(repository.updateSubmissionAnswers).not.toHaveBeenCalled();
    });

    it('rejects all forms with no SRS J.4 entry (e.g. ANC_VISIT) with every field unallowlisted', async () => {
      repository.findSubmissionById.mockResolvedValue(
        mockSubmission({
          formVersion: {
            schemaJson: [
              {
                question_code: 'weight_kg',
                label: 'Weight',
                input_type: 'number',
                required: true,
              },
            ],
            formDefinition: { formCode: 'ANC_VISIT' },
          },
        }) as never,
      );

      await expect(
        service.updateSubmissionAnswers(
          'sub-1',
          [{ fieldCode: 'weight_kg', value: 60 }],
          sakhiCaller,
          'Bearer token',
        ),
      ).rejects.toThrow(/not editable after submission/);
    });

    // Critical-severity IDOR (write path): a SAKHI who does not own/have in
    // their roster the beneficiary behind this submission must be rejected
    // BEFORE any edit is checked or applied — not silently succeed against a
    // beneficiary case they have no legitimate relationship to.
    it("rejects the edit (IDOR guard) when the calling SAKHI does not own the submission's beneficiary, before any edit is applied", async () => {
      repository.findSubmissionById.mockResolvedValue(mockSubmission() as never);
      jest.mocked(findBeneficiaryOwnership).mockResolvedValue({ sakhiId: 'someone-else' } as never);

      await expect(
        service.updateSubmissionAnswers(
          'sub-1',
          [{ fieldCode: 'who_owns_the_phone', value: 'husband' }],
          sakhiCaller,
          'Bearer token',
        ),
      ).rejects.toThrow(/outside your own roster/);

      expect(repository.updateSubmissionAnswers).not.toHaveBeenCalled();
      expect(auditClient.log).not.toHaveBeenCalled();
    });

    it("throws not-found (IDOR guard) when the submission's beneficiary case does not exist", async () => {
      repository.findSubmissionById.mockResolvedValue(mockSubmission() as never);
      jest.mocked(findBeneficiaryOwnership).mockResolvedValue(null);

      await expect(
        service.updateSubmissionAnswers(
          'sub-1',
          [{ fieldCode: 'who_owns_the_phone', value: 'husband' }],
          sakhiCaller,
          'Bearer token',
        ),
      ).rejects.toThrow(/not found/i);

      expect(repository.updateSubmissionAnswers).not.toHaveBeenCalled();
    });

    it("checks ownership against the submission's own beneficiaryId", async () => {
      repository.findSubmissionById.mockResolvedValue(
        mockSubmission({ beneficiaryId: 'ben-42' }) as never,
      );
      repository.updateSubmissionAnswers.mockResolvedValue(mockSubmission() as never);
      jest.mocked(findBeneficiaryOwnership).mockResolvedValue({ sakhiId: 'sakhi-1' } as never);

      await service.updateSubmissionAnswers(
        'sub-1',
        [{ fieldCode: 'who_owns_the_phone', value: 'husband' }],
        sakhiCaller,
        'Bearer token',
      );

      expect(jest.mocked(findBeneficiaryOwnership)).toHaveBeenCalledWith('ben-42', 'Bearer token');
    });
  });
});
