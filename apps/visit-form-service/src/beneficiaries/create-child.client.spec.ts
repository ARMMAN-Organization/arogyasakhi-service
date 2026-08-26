import { createChildBeneficiary } from './create-child.client';
import type { BeneficiaryCase } from './beneficiary.client';

describe('createChildBeneficiary', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  let warnSpy: jest.SpyInstance;

  const motherCase: BeneficiaryCase = {
    id: 'mother-1',
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
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("POSTs a CHILD case to beneficiary-service with the mother's project/lookup context", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: { id: 'child-1' } }),
    });

    await createChildBeneficiary(
      {
        motherCase,
        localCaseUuid: 'uuid-1-child1',
        registrationDate: new Date('2026-08-01T00:00:00.000Z'),
        dateOfBirth: new Date('2026-08-01T00:00:00.000Z'),
        sex: 'MALE',
        birthWeightKg: 2.4,
        birthLengthCm: 45,
        birthOrder: 1,
      },
      'Bearer test-token',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/beneficiaries'),
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.case).toEqual(
      expect.objectContaining({
        localCaseUuid: 'uuid-1-child1',
        projectId: 'project-1',
        caseType: 'CHILD',
        motherBeneficiaryId: 'mother-1',
        beneficiaryTypeLookupId: 'type-1',
        caseTypeLookupId: 'case-type-1',
      }),
    );
    expect(body.childDetails).toEqual(
      expect.objectContaining({
        sex: 'MALE',
        birthWeightKg: 2.4,
        birthLengthCm: 45,
        birthOrder: 1,
      }),
    );
    expect(body.pii).toEqual(
      expect.objectContaining({
        villageId: 'village-1',
        padaId: 'pada-1',
        healthSubCentreId: 'sc-1',
        phcId: 'phc-1',
        stateId: 'state-1',
        districtId: 'district-1',
      }),
    );
  });

  it('returns the created case id', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: { id: 'child-42' } }),
    });

    const id = await createChildBeneficiary(
      {
        motherCase,
        localCaseUuid: 'uuid-1-child1',
        registrationDate: new Date('2026-08-01T00:00:00.000Z'),
        dateOfBirth: new Date('2026-08-01T00:00:00.000Z'),
        birthOrder: 1,
      },
      'Bearer test-token',
    );

    expect(id).toBe('child-42');
  });

  it('acknowledges beneficiary-service duplicate detection — same mother + same DOB is expected for twins/triplets, not a real duplicate', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: { id: 'child-1' } }),
    });

    await createChildBeneficiary(
      {
        motherCase,
        localCaseUuid: 'uuid-1-child2',
        registrationDate: new Date('2026-08-01T00:00:00.000Z'),
        dateOfBirth: new Date('2026-08-01T00:00:00.000Z'),
        birthOrder: 2,
      },
      'Bearer test-token',
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.acknowledgeDuplicate).toBe(true);
    expect(body.childDetails.birthOrder).toBe(2);
  });

  it('swallows a non-ok response so the Delivery submission is never failed by it, returning null', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(
      createChildBeneficiary(
        {
          motherCase,
          localCaseUuid: 'uuid-1-child1',
          registrationDate: new Date(),
          dateOfBirth: new Date(),
          birthOrder: 1,
        },
        'Bearer test-token',
      ),
    ).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('swallows a network failure so the Delivery submission is never failed by it, returning null', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(
      createChildBeneficiary(
        {
          motherCase,
          localCaseUuid: 'uuid-1-child1',
          registrationDate: new Date(),
          dateOfBirth: new Date(),
          birthOrder: 1,
        },
        'Bearer test-token',
      ),
    ).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });
});
