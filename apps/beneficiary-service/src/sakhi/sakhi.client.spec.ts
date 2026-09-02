import {
  getSakhiName,
  listSakhiIdsForSupervisor,
  listSakhiNamesForSupervisor,
} from './sakhi.client';

function sakhisResponse(
  data: { sakhiId: string; displayName?: string; supervisorId: string | null }[],
) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true, data }),
  };
}

function sakhiResponse(data: { sakhiId: string; displayName: string } | undefined) {
  return {
    ok: data !== undefined,
    status: data !== undefined ? 200 : 404,
    json: () => Promise.resolve({ success: true, data }),
  };
}

describe('listSakhiIdsForSupervisor', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns only the sakhiIds matching the given supervisorId', async () => {
    fetchMock.mockResolvedValue(
      sakhisResponse([
        { sakhiId: 'sakhi-a', supervisorId: 'sup-1' },
        { sakhiId: 'sakhi-b', supervisorId: 'sup-2' },
        { sakhiId: 'sakhi-c', supervisorId: 'sup-1' },
      ]),
    );

    const result = await listSakhiIdsForSupervisor('project-1', 'sup-1', 'Bearer test-token');

    expect(result).toEqual(['sakhi-a', 'sakhi-c']);
  });

  it('returns an empty array when the supervisor has no Sakhis', async () => {
    fetchMock.mockResolvedValue(sakhisResponse([{ sakhiId: 'sakhi-a', supervisorId: 'sup-2' }]));

    const result = await listSakhiIdsForSupervisor('project-1', 'sup-1', 'Bearer test-token');

    expect(result).toEqual([]);
  });

  it('throws 502 when the auth-service call rejects (network error/timeout)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      listSakhiIdsForSupervisor('project-1', 'sup-1', 'Bearer test-token'),
    ).rejects.toMatchObject({ status: 502 });
  });

  it('throws 502 when the auth-service call fails with a non-2xx response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(
      listSakhiIdsForSupervisor('project-1', 'sup-1', 'Bearer test-token'),
    ).rejects.toMatchObject({ status: 502 });
  });

  it('throws 401 (not 502) when the auth-service call fails with a 401', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });

    await expect(
      listSakhiIdsForSupervisor('project-1', 'sup-1', 'Bearer stale-token'),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('throws 403 (not 502) when the auth-service call fails with a 403', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 });

    await expect(
      listSakhiIdsForSupervisor('project-1', 'sup-1', 'Bearer test-token'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("forwards the caller's own bearer token unchanged", async () => {
    fetchMock.mockResolvedValue(sakhisResponse([]));

    await listSakhiIdsForSupervisor('project-1', 'sup-1', 'Bearer test-token');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/projects/project-1/sakhis'),
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
  });
});

describe('listSakhiNamesForSupervisor', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns a sakhiId -> displayName map for only the Sakhis matching supervisorId', async () => {
    fetchMock.mockResolvedValue(
      sakhisResponse([
        { sakhiId: 'sakhi-a', displayName: 'Priya Sharma', supervisorId: 'sup-1' },
        { sakhiId: 'sakhi-b', displayName: 'Other Sakhi', supervisorId: 'sup-2' },
      ]),
    );

    const result = await listSakhiNamesForSupervisor('project-1', 'sup-1', 'Bearer test-token');

    expect(result).toEqual(new Map([['sakhi-a', 'Priya Sharma']]));
  });

  it('throws 502 when the auth-service call rejects (network error/timeout)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      listSakhiNamesForSupervisor('project-1', 'sup-1', 'Bearer test-token'),
    ).rejects.toMatchObject({ status: 502 });
  });

  it('throws 502 when the auth-service call fails with a non-2xx response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(
      listSakhiNamesForSupervisor('project-1', 'sup-1', 'Bearer test-token'),
    ).rejects.toMatchObject({ status: 502 });
  });

  it('throws 401 (not 502) when the auth-service call fails with a 401', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });

    await expect(
      listSakhiNamesForSupervisor('project-1', 'sup-1', 'Bearer stale-token'),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('throws 403 (not 502) when the auth-service call fails with a 403', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 });

    await expect(
      listSakhiNamesForSupervisor('project-1', 'sup-1', 'Bearer test-token'),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('getSakhiName', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('resolves a known sakhiId to its displayName', async () => {
    fetchMock.mockResolvedValue(sakhiResponse({ sakhiId: 'sakhi-a', displayName: 'Priya Sharma' }));

    const result = await getSakhiName('sakhi-a', 'Bearer test-token');

    expect(result).toBe('Priya Sharma');
  });

  it('returns null (not an error) for an unknown/deleted sakhiId (404)', async () => {
    fetchMock.mockResolvedValue(sakhiResponse(undefined));

    const result = await getSakhiName('missing-sakhi', 'Bearer test-token');

    expect(result).toBeNull();
  });

  it('throws 502 when the auth-service call rejects (network error/timeout)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(getSakhiName('sakhi-a', 'Bearer test-token')).rejects.toMatchObject({
      status: 502,
    });
  });

  it('throws 502 (not null) when the auth-service call fails with a 5xx', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(getSakhiName('sakhi-a', 'Bearer test-token')).rejects.toMatchObject({
      status: 502,
    });
  });

  it('throws 401 (not null, not 502) when the auth-service call fails with a 401', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });

    await expect(getSakhiName('sakhi-a', 'Bearer stale-token')).rejects.toMatchObject({
      status: 401,
    });
  });

  it('throws 403 (not null, not 502) when the auth-service call fails with a 403', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 });

    await expect(getSakhiName('sakhi-a', 'Bearer test-token')).rejects.toMatchObject({
      status: 403,
    });
  });

  it("forwards the caller's own bearer token unchanged", async () => {
    fetchMock.mockResolvedValue(sakhiResponse({ sakhiId: 'sakhi-a', displayName: 'Priya Sharma' }));

    await getSakhiName('sakhi-a', 'Bearer test-token');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/sakhis/sakhi-a'),
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
  });
});
