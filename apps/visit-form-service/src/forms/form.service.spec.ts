import { FormService } from './form.service';
import type { FormRepository } from './form.repository';

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
    it('returns the active version for a form code', async () => {
      const version = { id: 'v1', status: 'PUBLISHED' };
      repository.findActiveVersion.mockResolvedValue(version as never);
      await expect(service.getActiveVersion('MOTHER_REGISTRATION', new Date())).resolves.toBe(
        version,
      );
    });

    it('throws not-found when no published version exists', async () => {
      repository.findActiveVersion.mockResolvedValue(null);
      await expect(service.getActiveVersion('MOTHER_REGISTRATION', new Date())).rejects.toThrow(
        /No published form version/,
      );
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
      repository.findVersionById.mockResolvedValue({ id: 'v1', status: 'DRAFT' } as never);
      repository.updateDraft.mockResolvedValue({ id: 'v1' } as never);

      await service.updateDraft('v1', { schemaJson: [], validationJson: [] });

      expect(repository.updateDraft).toHaveBeenCalledWith(
        'v1',
        expect.objectContaining({ schemaJson: [], validationJson: [] }),
      );
    });

    it('rejects editing a version that is not DRAFT', async () => {
      repository.findVersionById.mockResolvedValue({ id: 'v1', status: 'PUBLISHED' } as never);
      await expect(
        service.updateDraft('v1', { schemaJson: [], validationJson: [] }),
      ).rejects.toThrow(/Only DRAFT versions can be edited/);
    });

    it('throws not-found for an unknown version id', async () => {
      repository.findVersionById.mockResolvedValue(null);
      await expect(
        service.updateDraft('missing', { schemaJson: [], validationJson: [] }),
      ).rejects.toThrow(/Form version not found/);
    });
  });

  describe('publish', () => {
    it('publishes a DRAFT and retires the previously-active version', async () => {
      repository.findVersionById.mockResolvedValue({
        id: 'v2',
        status: 'DRAFT',
        formDefinitionId: 'def-1',
      } as never);
      repository.findCurrentlyPublished.mockResolvedValue({ id: 'v1' } as never);
      repository.publish.mockResolvedValue({ id: 'v2', status: 'PUBLISHED' } as never);

      await service.publish('v2');

      expect(repository.publish).toHaveBeenCalledWith('v2', expect.any(Date), 'v1');
    });

    it('publishes with no previous version to retire when none exists', async () => {
      repository.findVersionById.mockResolvedValue({
        id: 'v1',
        status: 'DRAFT',
        formDefinitionId: 'def-1',
      } as never);
      repository.findCurrentlyPublished.mockResolvedValue(null);
      repository.publish.mockResolvedValue({ id: 'v1' } as never);

      await service.publish('v1');

      expect(repository.publish).toHaveBeenCalledWith('v1', expect.any(Date), null);
    });

    it('rejects publishing a version that is not DRAFT', async () => {
      repository.findVersionById.mockResolvedValue({ id: 'v1', status: 'RETIRED' } as never);
      await expect(service.publish('v1')).rejects.toThrow(/Only DRAFT versions can be published/);
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
      const existing = { id: 'sub-1' };
      repository.findSubmissionByLocalUuid.mockResolvedValue(existing as never);

      const result = await service.createSubmission('MOTHER_REGISTRATION', {
        formVersionId: 'version-1',
        beneficiaryId: 'b1',
        submittedByUserId: 'u1',
        localSubmissionUuid: 'retry-uuid',
        formData: {},
      });

      expect(result).toBe(existing);
      expect(repository.findVersionById).not.toHaveBeenCalled();
    });

    it('rejects when the form version does not belong to the given form code', async () => {
      repository.findSubmissionByLocalUuid.mockResolvedValue(null);
      repository.findVersionById.mockResolvedValue(publishedVersion as never);

      await expect(
        service.createSubmission('CHILD_REGISTRATION', {
          formVersionId: 'version-1',
          beneficiaryId: 'b1',
          submittedByUserId: 'u1',
          localSubmissionUuid: 'uuid-1',
          formData: { phone_owner: 'SELF' },
        }),
      ).rejects.toThrow(/does not belong to this form code/);
    });

    it('rejects when the version is not PUBLISHED', async () => {
      repository.findSubmissionByLocalUuid.mockResolvedValue(null);
      repository.findVersionById.mockResolvedValue({
        ...publishedVersion,
        status: 'DRAFT',
      } as never);

      await expect(
        service.createSubmission('MOTHER_REGISTRATION', {
          formVersionId: 'version-1',
          beneficiaryId: 'b1',
          submittedByUserId: 'u1',
          localSubmissionUuid: 'uuid-1',
          formData: { phone_owner: 'SELF' },
        }),
      ).rejects.toThrow(/not published/);
    });

    it('rejects a submission missing a required field', async () => {
      repository.findSubmissionByLocalUuid.mockResolvedValue(null);
      repository.findVersionById.mockResolvedValue(publishedVersion as never);

      const call = service.createSubmission('MOTHER_REGISTRATION', {
        formVersionId: 'version-1',
        beneficiaryId: 'b1',
        submittedByUserId: 'u1',
        localSubmissionUuid: 'uuid-1',
        formData: {},
      });

      await expect(call).rejects.toMatchObject({
        details: { violations: ['Missing required field: phone_owner'] },
      });
    });

    it('rejects a numeric value outside the declared range', async () => {
      repository.findSubmissionByLocalUuid.mockResolvedValue(null);
      repository.findVersionById.mockResolvedValue(publishedVersion as never);

      const call = service.createSubmission('MOTHER_REGISTRATION', {
        formVersionId: 'version-1',
        beneficiaryId: 'b1',
        submittedByUserId: 'u1',
        localSubmissionUuid: 'uuid-1',
        formData: { phone_owner: 'SELF', bp_systolic: 400 },
      });

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

      const call = service.createSubmission('MOTHER_REGISTRATION', {
        formVersionId: 'version-1',
        beneficiaryId: 'b1',
        submittedByUserId: 'u1',
        localSubmissionUuid: 'uuid-1',
        formData: { para: 5, gravida: 2 },
      });

      await expect(call).rejects.toMatchObject({
        details: { violations: ['para must be <= gravida'] },
      });
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

      await service.createSubmission('MOTHER_REGISTRATION', {
        formVersionId: 'version-1',
        beneficiaryId: 'b1',
        submittedByUserId: 'u1',
        localSubmissionUuid: 'uuid-1',
        formData: { gestational_age_weeks: 10 },
      });

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

      await service.createSubmission('MOTHER_REGISTRATION', {
        formVersionId: 'version-1',
        beneficiaryId: 'b1',
        submittedByUserId: 'u1',
        localSubmissionUuid: 'uuid-1',
        formData: {},
      });

      expect(repository.createSubmission).toHaveBeenCalled();
    });

    it('creates the submission with validationStatus VALID on success', async () => {
      repository.findSubmissionByLocalUuid.mockResolvedValue(null);
      repository.findVersionById.mockResolvedValue(publishedVersion as never);
      repository.createSubmission.mockResolvedValue({ id: 'sub-1' } as never);

      const result = await service.createSubmission('MOTHER_REGISTRATION', {
        formVersionId: 'version-1',
        beneficiaryId: 'b1',
        submittedByUserId: 'u1',
        localSubmissionUuid: 'uuid-1',
        formData: { phone_owner: 'SELF' },
      });

      expect(repository.createSubmission).toHaveBeenCalledWith(
        expect.objectContaining({ validationStatus: 'VALID' }),
      );
      expect(result).toEqual({ id: 'sub-1' });
    });
  });
});
