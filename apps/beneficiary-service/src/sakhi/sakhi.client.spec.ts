import { listSakhiIdsForSupervisor } from './sakhi.client';

function sakhisResponse(data: { sakhiId: string; supervisorId: string | null }[]) {
  return {
    ok: true,
    status: 200,
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

  it("forwards the caller's own bearer token unchanged", async () => {
    fetchMock.mockResolvedValue(sakhisResponse([]));

    await listSakhiIdsForSupervisor('project-1', 'sup-1', 'Bearer test-token');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/projects/project-1/sakhis'),
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
  });
});
