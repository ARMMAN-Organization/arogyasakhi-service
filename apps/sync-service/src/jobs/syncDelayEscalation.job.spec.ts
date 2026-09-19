import { runSyncDelayEscalationJob } from './syncDelayEscalation.job';
import { acquireJobLock } from '@armman/service-commons';
import { SyncBatchRepository } from '../sync/syncBatch.repository';
import { listAllProjectIds, listActiveSakhisForProject } from './roster.client';
import { createSyncDelayEscalationEvent } from '../sync/systemEscalation.client';

jest.mock('@armman/service-commons', () => ({
  acquireJobLock: jest.fn(),
  ServiceTokenClient: jest.fn(),
}));
jest.mock('../sync/syncBatch.repository');
jest.mock('./roster.client');
jest.mock('../sync/systemEscalation.client');

describe('runSyncDelayEscalationJob', () => {
  const findLastSyncedAtByUserIds = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (SyncBatchRepository as jest.Mock).mockImplementation(() => ({
      findLastSyncedAtByUserIds,
    }));
    (acquireJobLock as jest.Mock).mockResolvedValue(true);
    (listAllProjectIds as jest.Mock).mockResolvedValue(['project-1']);
    (listActiveSakhisForProject as jest.Mock).mockResolvedValue([
      { sakhiId: 'sakhi-1', supervisorId: 'supervisor-1' },
    ]);
    findLastSyncedAtByUserIds.mockResolvedValue(new Map());
    (createSyncDelayEscalationEvent as jest.Mock).mockResolvedValue({
      id: 'event-1',
      status: 'OPEN',
    });
  });

  const baseDeps = () => ({
    prisma: {} as never,
    syncDelayThresholdHours: 72,
    getSystemToken: jest.fn().mockResolvedValue('system-token'),
  });

  it('does nothing when the lock is already held by another run', async () => {
    (acquireJobLock as jest.Mock).mockResolvedValue(false);

    await runSyncDelayEscalationJob(baseDeps());

    expect(listAllProjectIds).not.toHaveBeenCalled();
  });

  it('skips the tick without throwing when no service token can be minted', async () => {
    const deps = baseDeps();
    deps.getSystemToken = jest.fn().mockRejectedValue(new Error('not configured'));

    await expect(runSyncDelayEscalationJob(deps)).resolves.toBeUndefined();
    expect(listAllProjectIds).not.toHaveBeenCalled();
  });

  it('escalates a Sakhi who has never synced', async () => {
    findLastSyncedAtByUserIds.mockResolvedValue(new Map());

    await runSyncDelayEscalationJob(baseDeps());

    expect(createSyncDelayEscalationEvent).toHaveBeenCalledWith(
      'sakhi-1',
      'supervisor-1',
      'system-token',
    );
  });

  it('escalates a Sakhi whose last sync exceeds the threshold', async () => {
    findLastSyncedAtByUserIds.mockResolvedValue(
      new Map([['sakhi-1', new Date(Date.now() - 73 * 60 * 60 * 1000)]]),
    );

    await runSyncDelayEscalationJob(baseDeps());

    expect(createSyncDelayEscalationEvent).toHaveBeenCalledWith(
      'sakhi-1',
      'supervisor-1',
      'system-token',
    );
  });

  it('does not escalate a Sakhi who has synced recently', async () => {
    findLastSyncedAtByUserIds.mockResolvedValue(
      new Map([['sakhi-1', new Date(Date.now() - 1 * 60 * 60 * 1000)]]),
    );

    await runSyncDelayEscalationJob(baseDeps());

    expect(createSyncDelayEscalationEvent).not.toHaveBeenCalled();
  });

  it('skips escalation for a delayed Sakhi with no assigned Supervisor, without throwing', async () => {
    (listActiveSakhisForProject as jest.Mock).mockResolvedValue([
      { sakhiId: 'sakhi-1', supervisorId: null },
    ]);
    findLastSyncedAtByUserIds.mockResolvedValue(new Map());

    await expect(runSyncDelayEscalationJob(baseDeps())).resolves.toBeUndefined();
    expect(createSyncDelayEscalationEvent).not.toHaveBeenCalled();
  });

  it('continues to the next project when one project fails to resolve its roster', async () => {
    (listAllProjectIds as jest.Mock).mockResolvedValue(['project-1', 'project-2']);
    (listActiveSakhisForProject as jest.Mock)
      .mockRejectedValueOnce(new Error('project-1 down'))
      .mockResolvedValueOnce([{ sakhiId: 'sakhi-2', supervisorId: 'supervisor-2' }]);
    findLastSyncedAtByUserIds.mockResolvedValue(new Map());

    await runSyncDelayEscalationJob(baseDeps());

    expect(createSyncDelayEscalationEvent).toHaveBeenCalledWith(
      'sakhi-2',
      'supervisor-2',
      'system-token',
    );
  });

  it("does not abort the sweep when one Sakhi's escalation call fails", async () => {
    (listActiveSakhisForProject as jest.Mock).mockResolvedValue([
      { sakhiId: 'sakhi-1', supervisorId: 'supervisor-1' },
      { sakhiId: 'sakhi-2', supervisorId: 'supervisor-2' },
    ]);
    findLastSyncedAtByUserIds.mockResolvedValue(new Map());
    (createSyncDelayEscalationEvent as jest.Mock)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ id: 'event-2', status: 'OPEN' });

    await runSyncDelayEscalationJob(baseDeps());

    expect(createSyncDelayEscalationEvent).toHaveBeenCalledTimes(2);
  });

  it('skips a project with zero active Sakhis without calling findLastSyncedAtByUserIds', async () => {
    (listActiveSakhisForProject as jest.Mock).mockResolvedValue([]);

    await runSyncDelayEscalationJob(baseDeps());

    expect(findLastSyncedAtByUserIds).not.toHaveBeenCalled();
  });
});
