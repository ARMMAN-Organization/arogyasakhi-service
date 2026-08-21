import type { AuthenticatedUser } from '@armman/service-commons';
import { StaleSakhisService } from './staleSakhis.service';
import type { StaleSakhisRepository } from './staleSakhis.repository';
import { listSakhiIdsForSupervisor } from './sakhi.client';

jest.mock('./sakhi.client');

const AUTH_HEADER = 'Bearer test-token';
const CALLER_ID = '99999999-9999-9999-9999-999999999999';

function caller(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: CALLER_ID,
    roles: ['SUPERVISOR'],
    projectId: 'project-1',
    geographyUnitId: null,
    ...overrides,
  };
}

describe('StaleSakhisService', () => {
  const repository = {
    findStale: jest.fn(),
  } as unknown as jest.Mocked<StaleSakhisRepository>;
  const listSakhiIdsForSupervisorMock = jest.mocked(listSakhiIdsForSupervisor);
  let service: StaleSakhisService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new StaleSakhisService(repository);
  });

  it('scopes the query to the roster resolved for the Supervisor', async () => {
    listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a', 'sakhi-b']);
    repository.findStale.mockResolvedValue([]);

    await service.listStale(3, caller(), AUTH_HEADER);

    expect(listSakhiIdsForSupervisorMock).toHaveBeenCalledWith('project-1', CALLER_ID, AUTH_HEADER);
    expect(repository.findStale).toHaveBeenCalledWith(['sakhi-a', 'sakhi-b'], 3);
  });

  it('returns the repository rows unchanged', async () => {
    listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a']);
    const rows = [
      {
        userId: 'sakhi-a',
        lastSyncAt: new Date('2026-08-01T00:00:00.000Z'),
        daysSinceSync: 20,
        pendingCount: 12,
        failedCount: 3,
      },
    ];
    repository.findStale.mockResolvedValue(rows);

    await expect(service.listStale(3, caller(), AUTH_HEADER)).resolves.toBe(rows);
  });

  it('rejects a Supervisor caller with no project scope', async () => {
    await expect(service.listStale(3, caller({ projectId: null }), AUTH_HEADER)).rejects.toThrow(
      'Supervisor caller has no project scope.',
    );
    expect(listSakhiIdsForSupervisorMock).not.toHaveBeenCalled();
    expect(repository.findStale).not.toHaveBeenCalled();
  });

  it('passes an empty roster through unchanged when the Supervisor has none', async () => {
    listSakhiIdsForSupervisorMock.mockResolvedValue([]);
    repository.findStale.mockResolvedValue([]);

    await expect(service.listStale(3, caller(), AUTH_HEADER)).resolves.toEqual([]);
    expect(repository.findStale).toHaveBeenCalledWith([], 3);
  });
});
