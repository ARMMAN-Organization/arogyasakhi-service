import { updateBeneficiaryPhase } from './update-phase.client';

describe('updateBeneficiaryPhase', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  let warnSpy: jest.SpyInstance;

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

  it('PATCHes the phase to beneficiary-service via the gateway', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await updateBeneficiaryPhase('mother-1', 'PP', 'Bearer test-token');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/beneficiaries/mother-1/phase'),
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
        body: JSON.stringify({ phase: 'PP' }),
      }),
    );
  });

  it('swallows a non-ok response so the Delivery submission is never failed by it', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409 });

    await expect(
      updateBeneficiaryPhase('mother-1', 'PP', 'Bearer test-token'),
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('swallows a network failure so the Delivery submission is never failed by it', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(
      updateBeneficiaryPhase('mother-1', 'PP', 'Bearer test-token'),
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });
});
