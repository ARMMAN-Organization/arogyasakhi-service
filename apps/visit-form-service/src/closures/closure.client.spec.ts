import { createClosure, resolveClosureReasonLookupId } from './closure.client';

describe('resolveClosureReasonLookupId', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  const CLOSURE_REASON_VALUES = [
    { id: 'id-miscarriage', valueCode: 'MISCARRIAGE' },
    { id: 'id-abortion', valueCode: 'ABORTION' },
    { id: 'id-maternal-death', valueCode: 'MATERNAL_DEATH' },
    { id: 'id-infant-death', valueCode: 'INFANT_OR_CHILD_DEATH' },
    { id: 'id-migration', valueCode: 'MIGRATION' },
    { id: 'id-withdrawal', valueCode: 'WITHDRAWAL' },
    { id: 'id-program-complete', valueCode: 'PROGRAM_CYCLE_COMPLETED' },
    { id: 'id-other', valueCode: 'OTHER' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { categoryCode: 'CLOSURE_REASON', values: CLOSURE_REASON_VALUES },
      }),
    });
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it.each([
    ['withdrawal_of_consent', 'id-withdrawal'],
    ['miscarriage', 'id-miscarriage'],
    ['abortion_spontaneous_induced_mtp', 'id-abortion'],
    ['migration', 'id-migration'],
    ['program_cycle_completed', 'id-program-complete'],
    ['maternal_death', 'id-maternal-death'],
    ['infant_child_death', 'id-infant-death'],
  ])('maps form value_code %s to lookup id %s', async (formCode, expectedId) => {
    await expect(resolveClosureReasonLookupId(formCode, 'Bearer test-token')).resolves.toBe(
      expectedId,
    );
  });

  it('returns null for an unrecognized form value_code', async () => {
    await expect(
      resolveClosureReasonLookupId('not_a_real_reason', 'Bearer test-token'),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws a badGateway error when the lookup call fails (network)', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(
      resolveClosureReasonLookupId('migration', 'Bearer test-token'),
    ).rejects.toMatchObject({ status: 502 });
  });

  it('throws a badGateway error when the lookup call returns non-ok', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(
      resolveClosureReasonLookupId('migration', 'Bearer test-token'),
    ).rejects.toMatchObject({ status: 502 });
  });
});

describe('createClosure', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  let warnSpy: jest.SpyInstance;

  const baseInput = {
    localClosureUuid: 'uuid-1-closure',
    beneficiaryId: 'b1',
    closureType: 'NON_MEDICAL' as const,
    closureReasonLookupValueId: 'reason-1',
    closureDate: '2026-08-18',
    submittedByUserId: 'sakhi-1',
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

  it('POSTs to closure-reopen-service via the gateway', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201 });

    await createClosure(baseInput, 'Bearer test-token');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/closures'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
        body: JSON.stringify(baseInput),
      }),
    );
  });

  it('swallows a non-ok response so the closure-form submission is never failed by it', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400 });
    await expect(createClosure(baseInput, 'Bearer test-token')).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('swallows a network failure so the closure-form submission is never failed by it', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(createClosure(baseInput, 'Bearer test-token')).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });
});
