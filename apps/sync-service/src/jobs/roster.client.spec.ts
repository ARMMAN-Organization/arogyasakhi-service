import { listAllProjectIds, listActiveSakhisForProject } from './roster.client';

describe('listAllProjectIds', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns every projectId from the response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [{ projectId: 'project-1' }, { projectId: 'project-2' }],
      }),
    });

    const result = await listAllProjectIds('system-token');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/projects'),
      expect.objectContaining({ headers: { Authorization: 'Bearer system-token' } }),
    );
    expect(result).toEqual(['project-1', 'project-2']);
  });

  it('throws a badGateway error on a non-ok response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(listAllProjectIds('system-token')).rejects.toMatchObject({ status: 502 });
  });

  it('throws a badGateway error on a network failure', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(listAllProjectIds('system-token')).rejects.toMatchObject({ status: 502 });
  });
});

describe('listActiveSakhisForProject', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns only ACTIVE Sakhis, mapped to sakhiId/supervisorId', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          { sakhiId: 'sakhi-1', supervisorId: 'supervisor-1', status: 'ACTIVE' },
          { sakhiId: 'sakhi-2', supervisorId: null, status: 'INACTIVE' },
        ],
      }),
    });

    const result = await listActiveSakhisForProject('project-1', 'system-token');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/projects/project-1/sakhis'),
      expect.objectContaining({ headers: { Authorization: 'Bearer system-token' } }),
    );
    expect(result).toEqual([{ sakhiId: 'sakhi-1', supervisorId: 'supervisor-1' }]);
  });

  it('throws a badGateway error on a non-ok response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(listActiveSakhisForProject('project-1', 'system-token')).rejects.toMatchObject({
      status: 502,
    });
  });

  it('throws a badGateway error on a network failure', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(listActiveSakhisForProject('project-1', 'system-token')).rejects.toMatchObject({
      status: 502,
    });
  });
});
