import { beneficiaryExists } from './beneficiary.client';

describe('beneficiaryExists', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns true when beneficiary-service returns 200', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const result = await beneficiaryExists('ben-1', 'Bearer test-token');

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/beneficiaries/ben-1'),
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
  });

  it('returns false on 404', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    await expect(beneficiaryExists('missing', 'Bearer test-token')).resolves.toBe(false);
  });

  it('throws when beneficiary-service fails for a reason other than not-found', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(beneficiaryExists('ben-1', 'Bearer test-token')).rejects.toMatchObject({
      status: 404,
    });
  });
});
