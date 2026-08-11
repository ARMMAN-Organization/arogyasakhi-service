import { FormService } from './form.service';
import type { FormRepository } from './form.repository';
import * as geographyClient from '../geography/geography.client';
import { syncSocioDemographics } from '../beneficiaries/socio-demographics.client';
import { syncHealthHistory } from '../beneficiaries/health-history.client';
import { fetchPublishedRuleSet } from '../rules/ruleVersion.client';

jest.mock('../geography/geography.client');
jest.mock('../beneficiaries/socio-demographics.client');
jest.mock('../beneficiaries/health-history.client');
jest.mock('../rules/ruleVersion.client');

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
  } as unknown as jest.Mocked<FormRepository>;
  let service: FormService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new FormService(repository);
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

    it('surfaces riskRuleSetId from the joined formDefinition', async () => {
      repository.findActiveVersion.mockResolvedValue({
        id: 'v1',
        versionNo: 'v1',
        status: 'PUBLISHED',
        checksum: Buffer.from('x'),
        formDefinition: { riskRuleSetId: 'set-1' },
      } as never);

      const result = await service.getActiveVersion(
        'ANC_VISIT',
        new Date(),
        null,
        'Bearer test-token',
      );

      expect(result).toMatchObject({ riskRuleSetId: 'set-1' });
    });

    it('defaults riskRuleSetId to null when the form has no risk rule set configured', async () => {
      repository.findActiveVersion.mockResolvedValue({
        id: 'v1',
        versionNo: 'v1',
        status: 'PUBLISHED',
        checksum: Buffer.from('x'),
        formDefinition: { riskRuleSetId: null },
      } as never);

      const result = await service.getActiveVersion(
        'MOTHER_REGISTRATION',
        new Date(),
        null,
        'Bearer test-token',
      );

      expect(result).toMatchObject({ riskRuleSetId: null });
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
  });

  describe('getActiveVersionRiskRules', () => {
    it('resolves formCode -> riskRuleSetId -> rulesJson in one call', async () => {
      repository.findActiveVersion.mockResolvedValue({
        id: 'v1',
        formDefinition: { riskRuleSetId: 'set-1' },
      } as never);
      jest.mocked(fetchPublishedRuleSet).mockResolvedValue({
        id: 'ver-1',
        ruleSetId: 'set-1',
        versionNo: 'v2',
        rulesJson: { rules: [] },
        status: 'PUBLISHED',
      });

      const result = await service.getActiveVersionRiskRules(
        'ANC_VISIT',
        new Date(),
        'Bearer test-token',
      );

      expect(fetchPublishedRuleSet).toHaveBeenCalledWith('set-1', 'Bearer test-token');
      expect(result).toEqual({
        ruleSetId: 'set-1',
        ruleVersionId: 'ver-1',
        versionNo: 'v2',
        rulesJson: { rules: [] },
      });
    });

    it('404s when the form has no active version', async () => {
      repository.findActiveVersion.mockResolvedValue(null);

      await expect(
        service.getActiveVersionRiskRules('ANC_VISIT', new Date(), 'Bearer test-token'),
      ).rejects.toMatchObject({ status: 404 });
      expect(fetchPublishedRuleSet).not.toHaveBeenCalled();
    });

    it('404s when the form has no risk rule set configured', async () => {
      repository.findActiveVersion.mockResolvedValue({
        id: 'v1',
        formDefinition: { riskRuleSetId: null },
      } as never);

      await expect(
        service.getActiveVersionRiskRules('MOTHER_REGISTRATION', new Date(), 'Bearer test-token'),
      ).rejects.toMatchObject({ status: 404 });
      expect(fetchPublishedRuleSet).not.toHaveBeenCalled();
    });

    it('404s when the rule set has no published version', async () => {
      repository.findActiveVersion.mockResolvedValue({
        id: 'v1',
        formDefinition: { riskRuleSetId: 'set-1' },
      } as never);
      jest.mocked(fetchPublishedRuleSet).mockResolvedValue(null);

      await expect(
        service.getActiveVersionRiskRules('ANC_VISIT', new Date(), 'Bearer test-token'),
      ).rejects.toMatchObject({ status: 404 });
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
      expect(result).toMatchObject({ id: 'draft-3', versionNo: 'v3' });
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
      expect(result).toEqual({ id: 'sub-1' });
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
  });
});
