import { randomBytes } from 'node:crypto';
import { encryptPii } from '@armman/service-commons';
import { BeneficiaryService } from './beneficiary.service';
import type { BeneficiaryRepository } from './beneficiary.repository';
import type { CreateBeneficiaryInput } from './dto/create-beneficiary.dto';
import { resolveHealthBlockIdFromPhc } from '../geography/geography.client';

jest.mock('../geography/geography.client');

describe('BeneficiaryService', () => {
  const originalEnv = { ...process.env };
  const repository = {
    findMany: jest.fn(),
    findById: jest.fn(),
    findByLocalCaseUuid: jest.fn(),
    findDuplicateCandidate: jest.fn(),
    createEnrollment: jest.fn(),
  } as unknown as jest.Mocked<BeneficiaryRepository>;
  let service: BeneficiaryService;

  const CALLER_ID = '99999999-9999-9999-9999-999999999999';
  const AUTH_HEADER = 'Bearer test-token';
  const resolveHealthBlockIdFromPhcMock = jest.mocked(resolveHealthBlockIdFromPhc);

  // All SRS FR-S-2.1 required PII fields present (phone, dob, the 7 geography
  // levels, rchNumber). Geography ids are uuid-shaped to satisfy the type.
  const fullPii = {
    firstName: 'Jane',
    middleName: undefined,
    lastName: 'Doe',
    phone: '9876543210',
    dateOfBirth: new Date('1995-05-05'),
    villageId: '66666666-6666-6666-6666-666666666666',
    padaId: '77777777-7777-7777-7777-777777777777',
    healthSubCentreId: '88888888-8888-8888-8888-888888888888',
    phcId: '99999999-9999-9999-9999-999999999999',
    healthBlockId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    stateId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    districtId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    rchNumber: 'RCH-0001',
  };

  const baseMotherInput: CreateBeneficiaryInput = {
    pii: { ...fullPii },
    case: {
      localCaseUuid: 'local-case-uuid-mother-1',
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
    pii: { ...fullPii, firstName: 'Baby', lastName: 'Doe' },
    case: {
      localCaseUuid: 'local-case-uuid-child-1',
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
    resolveHealthBlockIdFromPhcMock.mockResolvedValue('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
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

  describe('create — idempotent replay on localCaseUuid', () => {
    it('returns the existing case without re-running consent/duplicate/create logic on a replay', async () => {
      repository.findByLocalCaseUuid.mockResolvedValue({
        id: 'existing-id',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        riskConditionSummaries: [],
        statusHistory: [],
      } as never);

      await expect(service.create(baseMotherInput, CALLER_ID, AUTH_HEADER)).resolves.toEqual(
        expect.objectContaining({ id: 'existing-id' }),
      );
      expect(repository.findByLocalCaseUuid).toHaveBeenCalledWith(
        baseMotherInput.case.localCaseUuid,
      );
      expect(repository.findDuplicateCandidate).not.toHaveBeenCalled();
      expect(repository.createEnrollment).not.toHaveBeenCalled();
    });

    it('proceeds with a normal create when no case exists for this localCaseUuid yet', async () => {
      repository.findByLocalCaseUuid.mockResolvedValue(null);
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockResolvedValue({
        id: 'new-id',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
      } as never);

      await expect(service.create(baseMotherInput, CALLER_ID, AUTH_HEADER)).resolves.toEqual(
        expect.objectContaining({ id: 'new-id' }),
      );
      expect(repository.createEnrollment).toHaveBeenCalledTimes(1);
    });
  });

  describe('create — consent (M2)', () => {
    it('rejects with 422 and creates nothing when consent is REFUSED', async () => {
      const dto = { ...baseMotherInput, consent: { status: 'REFUSED' as const, date: new Date() } };
      await expect(service.create(dto, CALLER_ID, AUTH_HEADER)).rejects.toMatchObject({
        status: 422,
      });
      expect(repository.findDuplicateCandidate).not.toHaveBeenCalled();
      expect(repository.createEnrollment).not.toHaveBeenCalled();
    });
  });

  describe('create — duplicate detection (FR-S-2.4 / FR-S-2.5)', () => {
    // A matched case as findDuplicateCandidate now returns it: the case with
    // its currentSummary (delivery/closure/lmp) and currentStatus.
    function matchedCase(overrides: {
      currentStatus?: string;
      dateOfDelivery?: Date | null;
      closureDate?: Date | null;
      lmpDate?: Date | null;
      summary?: boolean; // false → no summary row at all
    }) {
      const hasSummary = overrides.summary !== false;
      return {
        id: 'existing-id',
        currentStatus: overrides.currentStatus ?? 'ACTIVE',
        currentSummary: hasSummary
          ? {
              dateOfDelivery: overrides.dateOfDelivery ?? null,
              closureDate: overrides.closureDate ?? null,
              lmpDate: overrides.lmpDate ?? null,
            }
          : null,
      };
    }

    // A function, not a const: encryptPii must run AFTER beforeEach sets
    // PII_ENCRYPTION_KEY, not at describe-eval time against a stale/unset key.
    const newCase = () => ({
      id: 'new-id',
      pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
    });

    it('blocks with 409 (hard duplicate) when the matched case has neither delivery nor closure', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(matchedCase({}) as never);
      await expect(service.create(baseMotherInput, CALLER_ID, AUTH_HEADER)).rejects.toMatchObject({
        status: 409,
      });
      expect(repository.createEnrollment).not.toHaveBeenCalled();
    });

    it('blocks with 409 when the matched case has no summary row at all (SRS-literal default-deny)', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(matchedCase({ summary: false }) as never);
      await expect(service.create(baseMotherInput, CALLER_ID, AUTH_HEADER)).rejects.toMatchObject({
        status: 409,
      });
      expect(repository.createEnrollment).not.toHaveBeenCalled();
    });

    it('blocks with 409 when only delivery (not closure) exists — both are required', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(
        matchedCase({ dateOfDelivery: new Date('2026-02-01') }) as never,
      );
      await expect(service.create(baseMotherInput, CALLER_ID, AUTH_HEADER)).rejects.toMatchObject({
        status: 409,
      });
      expect(repository.createEnrollment).not.toHaveBeenCalled();
    });

    it('allows the enrollment when the matched case has BOTH delivery and closure (new pregnancy)', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(
        matchedCase({
          dateOfDelivery: new Date('2026-02-01'),
          closureDate: new Date('2026-03-01'),
        }) as never,
      );
      repository.createEnrollment.mockResolvedValue(newCase() as never);

      await expect(service.create(baseMotherInput, CALLER_ID, AUTH_HEADER)).resolves.toEqual(
        expect.objectContaining({ id: 'new-id' }),
      );
      expect(repository.createEnrollment).toHaveBeenCalledTimes(1);
    });

    it('surfaces the FR-S-2.5 re-enrolment prompt for a completed journey with a different LMP', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(
        matchedCase({
          currentStatus: 'JOURNEY_COMPLETE',
          dateOfDelivery: new Date('2025-08-01'),
          lmpDate: new Date('2024-11-01'), // differs from baseMotherInput's 2025-10-01
        }) as never,
      );

      await expect(service.create(baseMotherInput, CALLER_ID, AUTH_HEADER)).rejects.toMatchObject({
        status: 409,
        details: expect.objectContaining({ reason: 'RE_ENROLLMENT' }),
      });
      expect(repository.createEnrollment).not.toHaveBeenCalled();
    });

    it('treats an ACTIVE match (not a completed journey) as a plain hard duplicate, not a re-enrolment', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(
        matchedCase({
          currentStatus: 'ACTIVE',
          dateOfDelivery: new Date('2025-08-01'),
          lmpDate: new Date('2024-11-01'),
        }) as never,
      );

      const err = await service.create(baseMotherInput, CALLER_ID, AUTH_HEADER).catch((e) => e);
      expect(err.status).toBe(409);
      expect(err.details?.reason).toBeUndefined();
    });

    it('proceeds despite a duplicate when acknowledgeDuplicate is true', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(matchedCase({}) as never);
      repository.createEnrollment.mockResolvedValue(newCase() as never);
      const dto = { ...baseMotherInput, acknowledgeDuplicate: true };
      await expect(service.create(dto, CALLER_ID, AUTH_HEADER)).resolves.toEqual(
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
      await expect(service.create(baseMotherInput, CALLER_ID, AUTH_HEADER)).resolves.toEqual(
        expect.objectContaining({ id: 'new-id' }),
      );
    });

    it('scopes duplicate search to the case type, so a MOTHER search never matches a CHILD case', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockResolvedValue({
        id: 'new-id',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
      } as never);

      await service.create(baseMotherInput, CALLER_ID, AUTH_HEADER);

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

      await service.create(baseMotherInput, CALLER_ID, AUTH_HEADER);

      const call = repository.createEnrollment.mock.calls[0][0];
      expect(call.motherDetails?.eddDate.toISOString().slice(0, 10)).toBe('2026-07-08');
    });

    it('computes bmiAtRegistration from height and weight', async () => {
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );

      await service.create(baseMotherInput, CALLER_ID, AUTH_HEADER);

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

      await service.create(baseMotherInput, CALLER_ID, AUTH_HEADER);

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

      const result = await service.create(baseMotherInput, CALLER_ID, AUTH_HEADER);

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

      await service.create(baseChildInput, CALLER_ID, AUTH_HEADER);

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
      await service.create(dto, CALLER_ID, AUTH_HEADER);

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
      await service.create(dto, CALLER_ID, AUTH_HEADER);

      const call = repository.createEnrollment.mock.calls[0][0];
      expect(call.case.previousBeneficiaryId).toBe('88888888-8888-8888-8888-888888888888');
    });
  });

  it('propagates repository errors on create', async () => {
    repository.findDuplicateCandidate.mockResolvedValue(null);
    repository.createEnrollment.mockRejectedValue(new Error('db down'));
    await expect(service.create(baseMotherInput, CALLER_ID, AUTH_HEADER)).rejects.toThrow(
      'db down',
    );
  });
});
