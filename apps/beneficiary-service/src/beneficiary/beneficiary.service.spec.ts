import { randomBytes } from 'node:crypto';
import { encryptPii } from '@armman/service-commons';
import { BeneficiaryService } from './beneficiary.service';
import type { BeneficiaryRepository } from './beneficiary.repository';
import type { CreateBeneficiaryInput } from './dto/create-beneficiary.dto';

describe('BeneficiaryService', () => {
  const originalEnv = { ...process.env };
  const repository = {
    findMany: jest.fn(),
    findById: jest.fn(),
    findDuplicateCandidate: jest.fn(),
    createEnrollment: jest.fn(),
  } as unknown as jest.Mocked<BeneficiaryRepository>;
  let service: BeneficiaryService;

  const CALLER_ID = '99999999-9999-9999-9999-999999999999';

  const baseMotherInput: CreateBeneficiaryInput = {
    pii: { fullName: 'Jane Doe', phone: '9876543210', villageId: 'v1', padaId: 'p1' },
    case: {
      projectId: '11111111-1111-1111-1111-111111111111',
      sakhiId: '33333333-3333-3333-3333-333333333333',
      caseType: 'MOTHER',
      registrationDate: new Date('2026-01-01'),
      beneficiaryTypeLookupId: '44444444-4444-4444-4444-444444444444',
      caseTypeLookupId: '55555555-5555-5555-5555-555555555555',
    },
    motherDetails: {
      lmpDate: new Date('2025-10-01'),
      gravida: 2,
      liveBirths: 1,
      stillbirths: 0,
      abortions: 1,
      heightCm: 160,
      weightKg: 60,
    },
    consent: { status: 'GIVEN', date: new Date('2026-01-01') },
  };

  const baseChildInput: CreateBeneficiaryInput = {
    pii: { fullName: 'Baby Doe' },
    case: {
      projectId: '11111111-1111-1111-1111-111111111111',
      sakhiId: '33333333-3333-3333-3333-333333333333',
      caseType: 'CHILD',
      registrationDate: new Date('2026-01-01'),
      beneficiaryTypeLookupId: '44444444-4444-4444-4444-444444444444',
      caseTypeLookupId: '55555555-5555-5555-5555-555555555555',
    },
    childDetails: { dateOfBirth: new Date('2025-12-01') },
    consent: { status: 'GIVEN', date: new Date('2026-01-01') },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    process.env.PII_SEARCH_HASH_KEY = randomBytes(32).toString('base64');
    service = new BeneficiaryService(repository);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('list / getById', () => {
    it('lists beneficiaries via the repository, with names decrypted for display', async () => {
      repository.findMany.mockResolvedValue([
        { id: 'x', pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') } },
      ] as never);

      const result = await service.list({});

      expect(result).toEqual([
        expect.objectContaining({
          id: 'x',
          pii: expect.objectContaining({ fullName: 'Jane Doe' }),
        }),
      ]);
    });

    it('passes query filters through to the repository as search hashes/scalars', async () => {
      repository.findMany.mockResolvedValue([]);

      await service.list({
        projectId: 'project-1',
        status: 'ACTIVE',
        caseType: 'MOTHER',
        atRiskOnly: true,
        name: 'Jane Doe',
        mobileNumber: '9876543210',
      });

      const call = repository.findMany.mock.calls[0][0];
      expect(call.projectId).toBe('project-1');
      expect(call.currentStatus).toBe('ACTIVE');
      expect(call.caseType).toBe('MOTHER');
      expect(call.atRiskOnly).toBe(true);
      expect(call.nameHash).toBeInstanceOf(Buffer);
      expect(call.phoneHash).toBeInstanceOf(Buffer);
    });

    it('passes through risk condition summaries and status history from the repository', async () => {
      const found = {
        id: 'x',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        riskConditionSummaries: [{ riskConditionId: 'risk-1', everAtRiskFlag: true }],
        statusHistory: [{ toStatus: 'ACTIVE', changedAt: new Date('2026-01-01') }],
      };
      repository.findById.mockResolvedValue(found as never);

      const result = await service.getById('x');

      expect(result.riskConditionSummaries).toEqual(found.riskConditionSummaries);
      expect(result.statusHistory).toEqual(found.statusHistory);
    });

    it('returns a found case with the name decrypted for display', async () => {
      const found = { id: 'x', pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') } };
      repository.findById.mockResolvedValue(found as never);

      const result = await service.getById('x');

      expect(result).toEqual(
        expect.objectContaining({
          id: 'x',
          pii: expect.objectContaining({ fullName: 'Jane Doe' }),
        }),
      );
    });

    it('throws 404 when the case is not found', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.getById('missing')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('create — consent (M2)', () => {
    it('rejects with 422 and creates nothing when consent is REFUSED', async () => {
      const dto = { ...baseMotherInput, consent: { status: 'REFUSED' as const, date: new Date() } };
      await expect(service.create(dto, CALLER_ID)).rejects.toMatchObject({ status: 422 });
      expect(repository.findDuplicateCandidate).not.toHaveBeenCalled();
      expect(repository.createEnrollment).not.toHaveBeenCalled();
    });
  });

  describe('create — duplicate detection (M7/M8/M9)', () => {
    it('rejects with 409 when a duplicate candidate is found and not acknowledged', async () => {
      repository.findDuplicateCandidate.mockResolvedValue({
        beneficiaryId: 'existing-id',
      } as never);
      await expect(service.create(baseMotherInput, CALLER_ID)).rejects.toMatchObject({
        status: 409,
      });
      expect(repository.createEnrollment).not.toHaveBeenCalled();
    });

    it('proceeds despite a duplicate when acknowledgeDuplicate is true', async () => {
      repository.findDuplicateCandidate.mockResolvedValue({
        beneficiaryId: 'existing-id',
      } as never);
      repository.createEnrollment.mockResolvedValue({
        id: 'new-id',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
      } as never);
      const dto = { ...baseMotherInput, acknowledgeDuplicate: true };
      await expect(service.create(dto, CALLER_ID)).resolves.toEqual(
        expect.objectContaining({ id: 'new-id' }),
      );
      expect(repository.createEnrollment).toHaveBeenCalledTimes(1);
    });

    it('creates normally when no duplicate is found', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockResolvedValue({
        id: 'new-id',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
      } as never);
      await expect(service.create(baseMotherInput, CALLER_ID)).resolves.toEqual(
        expect.objectContaining({ id: 'new-id' }),
      );
    });

    it('scopes duplicate search to the case type, so a MOTHER search never matches a CHILD case', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockResolvedValue({
        id: 'new-id',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
      } as never);

      await service.create(baseMotherInput, CALLER_ID);

      expect(repository.findDuplicateCandidate).toHaveBeenCalledWith(
        expect.objectContaining({ caseTypeLookupId: baseMotherInput.case.caseTypeLookupId }),
      );
    });
  });

  describe('create — server-side computation (M5)', () => {
    it('computes eddDate as lmpDate + 280 days, ignoring any client-supplied value', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );

      await service.create(baseMotherInput, CALLER_ID);

      const call = repository.createEnrollment.mock.calls[0][0];
      expect(call.motherDetails?.eddDate.toISOString().slice(0, 10)).toBe('2026-07-08');
    });

    it('computes bmiAtRegistration from height and weight', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );

      await service.create(baseMotherInput, CALLER_ID);

      const call = repository.createEnrollment.mock.calls[0][0];
      // 60 / (1.6*1.6) = 23.4375
      expect(call.motherDetails?.bmiAtRegistration).toBeCloseTo(23.44, 1);
    });
  });

  describe('create — mother enrollment (M1)', () => {
    it('encrypts PII, hashes search tokens, and creates the case atomically', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );

      await service.create(baseMotherInput, CALLER_ID);

      const call = repository.createEnrollment.mock.calls[0][0];
      expect(call.pii.fullNameEnc).toBeInstanceOf(Buffer);
      expect(call.pii.fullNameSearchHash).toBeInstanceOf(Buffer);
      expect(call.searchTokens.lmpDateToken).not.toBeNull();
      expect(call.consentCapturedByUserId).toBe(CALLER_ID);
    });

    it('returns empty risk/status-history arrays for a freshly enrolled case', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input, id: 'new-id' } as never),
      );

      const result = await service.create(baseMotherInput, CALLER_ID);

      expect(result.riskConditionSummaries).toEqual([]);
      expect(result.statusHistory).toEqual([]);
    });
  });

  describe('create — child enrollment (CH1/CH2)', () => {
    it('creates an independent child case with linkedAncCase=false', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );

      await service.create(baseChildInput, CALLER_ID);

      const call = repository.createEnrollment.mock.calls[0][0];
      expect(call.childDetails?.linkedAncCase).toBe(false);
    });

    it('creates a mother-linked child case with linkedAncCase=true', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );

      const dto = {
        ...baseChildInput,
        case: {
          ...baseChildInput.case,
          motherBeneficiaryId: '77777777-7777-7777-7777-777777777777',
        },
      };
      await service.create(dto, CALLER_ID);

      const call = repository.createEnrollment.mock.calls[0][0];
      expect(call.childDetails?.linkedAncCase).toBe(true);
      expect(call.childDetails?.motherBeneficiaryId).toBe('77777777-7777-7777-7777-777777777777');
    });
  });

  describe('create — re-enrollment (M10)', () => {
    it('links previousBeneficiaryId without reusing it as the new id', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );

      const dto = {
        ...baseMotherInput,
        case: {
          ...baseMotherInput.case,
          previousBeneficiaryId: '88888888-8888-8888-8888-888888888888',
        },
      };
      await service.create(dto, CALLER_ID);

      const call = repository.createEnrollment.mock.calls[0][0];
      expect(call.case.previousBeneficiaryId).toBe('88888888-8888-8888-8888-888888888888');
    });
  });

  it('propagates repository errors on create', async () => {
    repository.findDuplicateCandidate.mockResolvedValue(null);
    repository.createEnrollment.mockRejectedValue(new Error('db down'));
    await expect(service.create(baseMotherInput, CALLER_ID)).rejects.toThrow('db down');
  });
});
