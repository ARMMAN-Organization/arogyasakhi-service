import { randomBytes } from 'node:crypto';
import { encryptPii, type AuthenticatedUser } from '@armman/service-commons';
import { BeneficiaryService } from './beneficiary.service';
import type { BeneficiaryRepository } from './beneficiary.repository';
import type { CreateBeneficiaryInput } from './dto/create-beneficiary.dto';
import { resolveHealthBlockIdFromPhc } from '../geography/geography.client';
import { resolveLookupValues } from '../lookups/lookup.client';
import { listSakhiIdsForSupervisor } from '../sakhi/sakhi.client';

jest.mock('../geography/geography.client');
jest.mock('../lookups/lookup.client');
jest.mock('../sakhi/sakhi.client');

describe('BeneficiaryService', () => {
  const originalEnv = { ...process.env };
  const repository = {
    findMany: jest.fn(),
    findById: jest.fn(),
    findByLocalCaseUuid: jest.fn(),
    findDuplicateCandidate: jest.fn(),
    createEnrollment: jest.fn(),
    updateMotherLmp: jest.fn(),
    reactivateCase: jest.fn(),
  } as unknown as jest.Mocked<BeneficiaryRepository>;
  let service: BeneficiaryService;

  const CALLER_ID = '99999999-9999-9999-9999-999999999999';
  const AUTH_HEADER = 'Bearer test-token';
  const resolveHealthBlockIdFromPhcMock = jest.mocked(resolveHealthBlockIdFromPhc);
  const resolveLookupValuesMock = jest.mocked(resolveLookupValues);
  const listSakhiIdsForSupervisorMock = jest.mocked(listSakhiIdsForSupervisor);

  function caller(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
    return {
      id: CALLER_ID,
      roles: ['SAKHI'],
      projectId: '11111111-1111-1111-1111-111111111111',
      geographyUnitId: null,
      ...overrides,
    };
  }

  // All SRS FR-S-2.1 required PII fields present (phone, dob, the 7 geography
  // levels, rchNumber). Geography ids are uuid-shaped to satisfy the type.
  const fullPii = {
    fullName: 'Jane Doe',
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
    pii: { ...fullPii, fullName: 'Baby Doe' },
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
    resolveLookupValuesMock.mockResolvedValue({});
    service = new BeneficiaryService(repository);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('applyLmpChange', () => {
    const beneficiaryId = '22222222-2222-2222-2222-222222222222';
    const sakhiId = '55555555-5555-5555-5555-555555555555';

    function caseRow(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: beneficiaryId,
        sakhiId,
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        ...overrides,
      };
    }

    it('recomputes eddDate (lmpDate + 280 days) and persists via the repository', async () => {
      repository.findById.mockResolvedValue(caseRow() as never);
      repository.updateMotherLmp.mockResolvedValue(true);

      await service.applyLmpChange(
        beneficiaryId,
        new Date('2026-06-15'),
        caller({ roles: ['ADMIN'] }),
        AUTH_HEADER,
      );

      expect(repository.updateMotherLmp).toHaveBeenCalledWith(
        beneficiaryId,
        new Date('2026-06-15'),
        new Date('2027-03-22'),
      );
    });

    it('returns the updated case via getById', async () => {
      repository.findById.mockResolvedValue(caseRow() as never);
      repository.updateMotherLmp.mockResolvedValue(true);

      const result = await service.applyLmpChange(
        beneficiaryId,
        new Date('2026-06-15'),
        caller({ roles: ['ADMIN'] }),
        AUTH_HEADER,
      );
      expect(result).toMatchObject({ id: beneficiaryId });
    });

    it('404s on an unknown beneficiary id', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.applyLmpChange(
          beneficiaryId,
          new Date('2026-06-15'),
          caller({ roles: ['ADMIN'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 404 });
      expect(repository.updateMotherLmp).not.toHaveBeenCalled();
    });

    it('404s when no mother_case_details row exists for this beneficiary', async () => {
      repository.findById.mockResolvedValue(caseRow() as never);
      repository.updateMotherLmp.mockResolvedValue(false);

      await expect(
        service.applyLmpChange(
          beneficiaryId,
          new Date('2026-06-15'),
          caller({ roles: ['ADMIN'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('403s when a SUPERVISOR targets a case outside their own roster', async () => {
      repository.findById.mockResolvedValue(caseRow() as never);
      listSakhiIdsForSupervisorMock.mockResolvedValue(['some-other-sakhi']);

      await expect(
        service.applyLmpChange(
          beneficiaryId,
          new Date('2026-06-15'),
          caller({ roles: ['SUPERVISOR'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.updateMotherLmp).not.toHaveBeenCalled();
    });

    it('allows a SUPERVISOR to update a case in their own roster', async () => {
      repository.findById.mockResolvedValue(caseRow() as never);
      repository.updateMotherLmp.mockResolvedValue(true);
      listSakhiIdsForSupervisorMock.mockResolvedValue([sakhiId]);

      await service.applyLmpChange(
        beneficiaryId,
        new Date('2026-06-15'),
        caller({ roles: ['SUPERVISOR'] }),
        AUTH_HEADER,
      );

      expect(repository.updateMotherLmp).toHaveBeenCalled();
    });
  });

  describe('reactivateCase', () => {
    const beneficiaryId = '22222222-2222-2222-2222-222222222222';
    const supervisorId = '44444444-4444-4444-4444-444444444444';
    const sakhiId = '55555555-5555-5555-5555-555555555555';

    function caseRow(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: beneficiaryId,
        sakhiId,
        currentStatus: 'CLOSED',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        ...overrides,
      };
    }

    it('reactivates a CLOSED case and returns it via getById', async () => {
      repository.findById
        .mockResolvedValueOnce(caseRow() as never)
        .mockResolvedValueOnce(caseRow() as never);
      repository.reactivateCase.mockResolvedValue(true);

      const result = await service.reactivateCase(
        beneficiaryId,
        supervisorId,
        caller({ roles: ['ADMIN'] }),
        AUTH_HEADER,
      );

      expect(repository.reactivateCase).toHaveBeenCalledWith(beneficiaryId, supervisorId);
      expect(result).toMatchObject({ id: beneficiaryId });
    });

    it('404s on an unknown beneficiary id', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.reactivateCase(
          beneficiaryId,
          supervisorId,
          caller({ roles: ['ADMIN'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 404 });
      expect(repository.reactivateCase).not.toHaveBeenCalled();
    });

    it('409s when the case is not currently CLOSED', async () => {
      repository.findById.mockResolvedValue(caseRow({ currentStatus: 'ACTIVE' }) as never);

      await expect(
        service.reactivateCase(
          beneficiaryId,
          supervisorId,
          caller({ roles: ['ADMIN'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(repository.reactivateCase).not.toHaveBeenCalled();
    });

    it('409s when the conditional update races with a concurrent status change', async () => {
      repository.findById.mockResolvedValueOnce(caseRow() as never);
      repository.reactivateCase.mockResolvedValue(false);

      await expect(
        service.reactivateCase(
          beneficiaryId,
          supervisorId,
          caller({ roles: ['ADMIN'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('403s when a SUPERVISOR targets a case outside their own roster', async () => {
      repository.findById.mockResolvedValue(caseRow() as never);
      listSakhiIdsForSupervisorMock.mockResolvedValue(['some-other-sakhi']);

      await expect(
        service.reactivateCase(
          beneficiaryId,
          supervisorId,
          caller({ id: supervisorId, roles: ['SUPERVISOR'] }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.reactivateCase).not.toHaveBeenCalled();
    });

    it('allows a SUPERVISOR to reactivate a case in their own roster', async () => {
      repository.findById
        .mockResolvedValueOnce(caseRow() as never)
        .mockResolvedValueOnce(caseRow() as never);
      repository.reactivateCase.mockResolvedValue(true);
      listSakhiIdsForSupervisorMock.mockResolvedValue([sakhiId]);

      await service.reactivateCase(
        beneficiaryId,
        supervisorId,
        caller({ id: supervisorId, roles: ['SUPERVISOR'] }),
        AUTH_HEADER,
      );

      expect(repository.reactivateCase).toHaveBeenCalledWith(beneficiaryId, supervisorId);
    });
  });

  describe('list / getById', () => {
    it('lists beneficiaries via the repository, with names decrypted for display', async () => {
      repository.findMany.mockResolvedValue({
        items: [{ id: 'x', pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') } }] as never,
        nextCursor: null,
      });

      const result = await service.list({ limit: 50 }, caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(result).toEqual({
        items: [
          expect.objectContaining({
            id: 'x',
            pii: expect.objectContaining({ fullName: 'Jane Doe' }),
          }),
        ],
        nextCursor: null,
      });
    });

    it('passes query filters through to the repository as search hashes/scalars', async () => {
      repository.findMany.mockResolvedValue({ items: [], nextCursor: null });

      await service.list(
        {
          projectId: 'project-1',
          status: 'ACTIVE',
          caseType: 'MOTHER',
          atRiskOnly: true,
          name: 'Jane Doe',
          mobileNumber: '9876543210',
          fromDate: '2026-01-01',
          toDate: '2026-01-31',
          limit: 50,
        },
        caller({ roles: ['ADMIN'] }),
        AUTH_HEADER,
      );

      const call = repository.findMany.mock.calls[0][0];
      expect(call.projectId).toBe('project-1');
      expect(call.currentStatus).toBe('ACTIVE');
      expect(call.caseType).toBe('MOTHER');
      expect(call.atRiskOnly).toBe(true);
      expect(call.nameHash).toBeInstanceOf(Buffer);
      expect(call.phoneHash).toBeInstanceOf(Buffer);
      expect(call.fromDate).toBe('2026-01-01');
      expect(call.toDate).toBe('2026-01-31');
      expect(call.limit).toBe(50);
    });

    it('SAKHI caller is forced to see only their own cases, regardless of query params', async () => {
      repository.findMany.mockResolvedValue({ items: [], nextCursor: null });

      await service.list(
        { projectId: 'some-other-project', limit: 50 },
        caller({ id: 'sakhi-1', roles: ['SAKHI'] }),
        AUTH_HEADER,
      );

      const call = repository.findMany.mock.calls[0][0];
      expect(call.sakhiId).toBe('sakhi-1');
      expect(call.sakhiIds).toBeUndefined();
      expect(listSakhiIdsForSupervisorMock).not.toHaveBeenCalled();
    });

    it('SAKHI-supplied sakhiId is ignored — own id always wins', async () => {
      repository.findMany.mockResolvedValue({ items: [], nextCursor: null });

      await service.list(
        { sakhiId: 'someone-else', limit: 50 },
        caller({ id: 'sakhi-1', roles: ['SAKHI'] }),
        AUTH_HEADER,
      );

      const call = repository.findMany.mock.calls[0][0];
      expect(call.sakhiId).toBe('sakhi-1');
    });

    it('SUPERVISOR caller sees only their own Sakhis, resolved via the Sakhi lookup', async () => {
      repository.findMany.mockResolvedValue({ items: [], nextCursor: null });
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a', 'sakhi-b']);

      await service.list(
        { limit: 50 },
        caller({ id: 'sup-1', roles: ['SUPERVISOR'], projectId: 'project-1' }),
        AUTH_HEADER,
      );

      expect(listSakhiIdsForSupervisorMock).toHaveBeenCalledWith('project-1', 'sup-1', AUTH_HEADER);
      const call = repository.findMany.mock.calls[0][0];
      expect(call.sakhiIds).toEqual(['sakhi-a', 'sakhi-b']);
      expect(call.sakhiId).toBeUndefined();
    });

    it('SUPERVISOR narrowing to a sakhiId within their roster scopes to that one Sakhi', async () => {
      repository.findMany.mockResolvedValue({ items: [], nextCursor: null });
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a', 'sakhi-b']);

      await service.list(
        { sakhiId: 'sakhi-b', limit: 50 },
        caller({ id: 'sup-1', roles: ['SUPERVISOR'], projectId: 'project-1' }),
        AUTH_HEADER,
      );

      const call = repository.findMany.mock.calls[0][0];
      expect(call.sakhiId).toBe('sakhi-b');
      expect(call.sakhiIds).toBeUndefined();
    });

    it('rejects a SUPERVISOR narrowing to a sakhiId outside their roster', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a', 'sakhi-b']);

      await expect(
        service.list(
          { sakhiId: 'not-mine', limit: 50 },
          caller({ id: 'sup-1', roles: ['SUPERVISOR'], projectId: 'project-1' }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.findMany).not.toHaveBeenCalled();
    });

    it('SUPERVISOR with zero Sakhis gets an empty result, not all beneficiaries', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue([]);
      repository.findMany.mockResolvedValue({ items: [], nextCursor: null });

      const result = await service.list(
        { limit: 50 },
        caller({ id: 'sup-1', roles: ['SUPERVISOR'] }),
        AUTH_HEADER,
      );

      expect(result).toEqual({ items: [], nextCursor: null });
      const call = repository.findMany.mock.calls[0][0];
      expect(call.sakhiIds).toEqual([]);
    });

    it('rejects a SUPERVISOR caller with no projectId instead of resolving Sakhis with an empty path', async () => {
      await expect(
        service.list(
          { limit: 50 },
          caller({ id: 'sup-1', roles: ['SUPERVISOR'], projectId: null }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(listSakhiIdsForSupervisorMock).not.toHaveBeenCalled();
      expect(repository.findMany).not.toHaveBeenCalled();
    });

    it('MANAGER caller sees all beneficiaries — no sakhi scoping applied', async () => {
      repository.findMany.mockResolvedValue({ items: [], nextCursor: null });

      await service.list({ limit: 50 }, caller({ roles: ['MANAGER'] }), AUTH_HEADER);

      const call = repository.findMany.mock.calls[0][0];
      expect(call.sakhiId).toBeUndefined();
      expect(call.sakhiIds).toBeUndefined();
      expect(listSakhiIdsForSupervisorMock).not.toHaveBeenCalled();
    });

    it('MANAGER caller may still narrow by sakhiId, with no roster to validate against', async () => {
      repository.findMany.mockResolvedValue({ items: [], nextCursor: null });

      await service.list(
        { sakhiId: 'any-sakhi', limit: 50 },
        caller({ roles: ['MANAGER'] }),
        AUTH_HEADER,
      );

      const call = repository.findMany.mock.calls[0][0];
      expect(call.sakhiId).toBe('any-sakhi');
      expect(listSakhiIdsForSupervisorMock).not.toHaveBeenCalled();
    });

    it('ADMIN caller sees all beneficiaries — no sakhi scoping applied', async () => {
      repository.findMany.mockResolvedValue({ items: [], nextCursor: null });

      await service.list({ limit: 50 }, caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      const call = repository.findMany.mock.calls[0][0];
      expect(call.sakhiId).toBeUndefined();
      expect(call.sakhiIds).toBeUndefined();
    });

    it("propagates an auth-service failure while resolving a Supervisor's Sakhis", async () => {
      listSakhiIdsForSupervisorMock.mockRejectedValue(
        Object.assign(new Error('bad gateway'), { status: 502 }),
      );

      await expect(
        service.list({ limit: 50 }, caller({ roles: ['SUPERVISOR'] }), AUTH_HEADER),
      ).rejects.toMatchObject({ status: 502 });
      expect(repository.findMany).not.toHaveBeenCalled();
    });

    it('passes through risk condition summaries and status history from the repository', async () => {
      const found = {
        id: 'x',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        riskConditionSummaries: [{ riskConditionId: 'risk-1', everAtRiskFlag: true }],
        statusHistory: [{ toStatus: 'ACTIVE', changedAt: new Date('2026-01-01') }],
      };
      repository.findById.mockResolvedValue(found as never);

      const result = await service.getById('x', AUTH_HEADER);

      expect(result.riskConditionSummaries).toEqual(found.riskConditionSummaries);
      expect(result.statusHistory).toEqual(found.statusHistory);
    });

    it('returns a found case with the name decrypted for display', async () => {
      const found = { id: 'x', pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') } };
      repository.findById.mockResolvedValue(found as never);

      const result = await service.getById('x', AUTH_HEADER);

      expect(result).toEqual(
        expect.objectContaining({
          id: 'x',
          pii: expect.objectContaining({ fullName: 'Jane Doe' }),
        }),
      );
    });

    it('throws 404 when the case is not found', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.getById('missing', AUTH_HEADER)).rejects.toMatchObject({ status: 404 });
    });

    it('passes through socioDemographics from the repository', async () => {
      const found = {
        id: 'x',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        socioDemographics: { familyMembersCount: 4, childrenUnder5Count: 1 },
      };
      repository.findById.mockResolvedValue(found as never);

      const result = await service.getById('x', AUTH_HEADER);

      expect(result.socioDemographics).toMatchObject({
        familyMembersCount: 4,
        childrenUnder5Count: 1,
      });
    });

    it('resolves each *LookupId field to a sibling {categoryCode, valueCode, label}', async () => {
      const found = {
        id: 'x',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        socioDemographics: {
          religionLookupId: 'religion-uuid-1',
          educationLevelLookupId: null,
        },
      };
      repository.findById.mockResolvedValue(found as never);
      resolveLookupValuesMock.mockResolvedValue({
        religionLookupId: { categoryCode: 'RELIGION', valueCode: 'HINDU', label: 'Hindu' },
        educationLevelLookupId: null,
        phoneOwnerLookupId: null,
        mobileNetworkAvailabilityLookupId: null,
        partnerEducationLevelLookupId: null,
        partnerOccupationLookupId: null,
        migrationPatternLookupId: null,
        monthlyIncomeLookupId: null,
        socialCategoryLookupId: null,
      });

      const result = await service.getById('x', AUTH_HEADER);

      expect(resolveLookupValuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          religionLookupId: { categoryCode: 'RELIGION', lookupValueId: 'religion-uuid-1' },
          educationLevelLookupId: { categoryCode: 'EDUCATION_LEVEL', lookupValueId: null },
        }),
        AUTH_HEADER,
      );
      expect((result.socioDemographics as Record<string, unknown>).religion).toEqual({
        categoryCode: 'RELIGION',
        valueCode: 'HINDU',
        label: 'Hindu',
      });
      expect((result.socioDemographics as Record<string, unknown>).educationLevel).toBeNull();
    });

    it('does not call the lookup resolver when socioDemographics is null', async () => {
      const found = {
        id: 'x',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        socioDemographics: null,
      };
      repository.findById.mockResolvedValue(found as never);

      const result = await service.getById('x', AUTH_HEADER);

      expect(resolveLookupValuesMock).not.toHaveBeenCalled();
      expect(result.socioDemographics).toBeNull();
    });

    it('returns null socioDemographics for a case with no row yet', async () => {
      const found = {
        id: 'x',
        pii: { id: 'pii-1', fullNameEnc: encryptPii('Jane Doe') },
        socioDemographics: null,
      };
      repository.findById.mockResolvedValue(found as never);

      const result = await service.getById('x', AUTH_HEADER);

      expect(result.socioDemographics).toBeNull();
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

    it('attributes the case to the authenticated caller when case.sakhiId is omitted', async () => {
      const dto: CreateBeneficiaryInput = {
        ...baseMotherInput,
        case: { ...baseMotherInput.case, sakhiId: undefined },
      };
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );

      await service.create(dto, CALLER_ID, AUTH_HEADER);

      const call = repository.createEnrollment.mock.calls[0][0];
      expect(call.case.sakhiId).toBe(CALLER_ID);
    });

    it('ignores a client-supplied case.sakhiId and always uses the authenticated caller’s id', async () => {
      // baseMotherInput.case.sakhiId ('33333333-...') deliberately differs
      // from CALLER_ID ('99999999-...') to prove the client value is never trusted.
      expect(baseMotherInput.case.sakhiId).not.toBe(CALLER_ID);
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );

      await service.create(baseMotherInput, CALLER_ID, AUTH_HEADER);

      const call = repository.createEnrollment.mock.calls[0][0];
      expect(call.case.sakhiId).toBe(CALLER_ID);
      expect(call.case.sakhiId).not.toBe(baseMotherInput.case.sakhiId);
    });

    it('attributes each case to its own caller when two different Sakhis enroll with the same body shape', async () => {
      const CALLER_A = CALLER_ID;
      const CALLER_B = '88888888-8888-8888-8888-888888888888';
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );

      const dtoA: CreateBeneficiaryInput = {
        ...baseMotherInput,
        case: { ...baseMotherInput.case, localCaseUuid: 'local-case-uuid-caller-a' },
      };
      const dtoB: CreateBeneficiaryInput = {
        ...baseMotherInput,
        case: { ...baseMotherInput.case, localCaseUuid: 'local-case-uuid-caller-b' },
      };

      await service.create(dtoA, CALLER_A, AUTH_HEADER);
      await service.create(dtoB, CALLER_B, AUTH_HEADER);

      const [callA, callB] = repository.createEnrollment.mock.calls;
      expect(callA[0].case.sakhiId).toBe(CALLER_A);
      expect(callB[0].case.sakhiId).toBe(CALLER_B);
    });

    it('attributes a child enrollment to the authenticated caller, ignoring case.sakhiId', async () => {
      expect(baseChildInput.case.sakhiId).not.toBe(CALLER_ID);
      repository.findDuplicateCandidate.mockResolvedValue(null);
      repository.createEnrollment.mockImplementation((input) =>
        Promise.resolve({ ...input } as never),
      );

      await service.create(baseChildInput, CALLER_ID, AUTH_HEADER);

      const call = repository.createEnrollment.mock.calls[0][0];
      expect(call.case.sakhiId).toBe(CALLER_ID);
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
