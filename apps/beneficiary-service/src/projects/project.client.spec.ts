import { resolveProjectNames } from './project.client';

function projectsResponse(data: { projectId: string; projectName: string }[]) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true, data }),
  };
}

describe('resolveProjectNames', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns a projectId -> projectName map', async () => {
    fetchMock.mockResolvedValue(
      projectsResponse([
        { projectId: 'project-1', projectName: 'GEP 2026-27' },
        { projectId: 'project-2', projectName: 'MVA 2026-27' },
      ]),
    );

    const result = await resolveProjectNames('Bearer test-token');

    expect(result).toEqual(
      new Map([
        ['project-1', 'GEP 2026-27'],
        ['project-2', 'MVA 2026-27'],
      ]),
    );
  });

  it('a projectId absent from the response is simply absent from the map', async () => {
    fetchMock.mockResolvedValue(projectsResponse([]));

    const result = await resolveProjectNames('Bearer test-token');

    expect(result.get('unknown-project')).toBeUndefined();
  });

  it('throws 502 when the auth-service call rejects (network error/timeout)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(resolveProjectNames('Bearer test-token')).rejects.toMatchObject({ status: 502 });
  });

  it('throws 502 when the auth-service call fails with a non-2xx response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(resolveProjectNames('Bearer test-token')).rejects.toMatchObject({ status: 502 });
  });

  it("forwards the caller's own bearer token unchanged", async () => {
    fetchMock.mockResolvedValue(projectsResponse([]));

    await resolveProjectNames('Bearer test-token');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/projects'),
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
  });
});
