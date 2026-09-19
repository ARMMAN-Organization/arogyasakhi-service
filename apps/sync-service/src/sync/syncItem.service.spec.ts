import type { AuthenticatedUser } from '@armman/service-commons';
import { SyncItemService } from './syncItem.service';
import type { SyncItemRepository, CreatedSyncItem } from './syncItem.repository';
import { SakhiClient } from './sakhi.client';

const AUTH_HEADER = 'Bearer test-token';

function caller(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    roles: ['SAKHI'],
    projectId: null,
    geographyUnitId: null,
    ...overrides,
  };
}

describe('SyncItemService', () => {
  const repository = {
    create: jest.fn(),
    findBatchOwner: jest.fn(),
  } as unknown as jest.Mocked<SyncItemRepository>;
  const sakhiClient = {
    findById: jest.fn(),
  } as unknown as jest.Mocked<SakhiClient>;
  let service: SyncItemService;

  const callerId = '33333333-3333-3333-3333-333333333333';
  const otherUserId = '44444444-4444-4444-4444-444444444444';
  const batchId = '55555555-5555-5555-5555-555555555555';

  const item = {
    syncBatchId: batchId,
    localEntityUuid: 'local-uuid-1',
    entityType: 'BENEFICIARY',
    operation: 'CREATE' as const,
    status: 'SUCCESS' as const,
  };

  const createdItem: CreatedSyncItem = {
    id: 'item-1',
    localEntityUuid: 'local-uuid-1',
    entityType: 'BENEFICIARY',
    status: 'SUCCESS',
    retryCount: 0,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    service = new SyncItemService(repository, sakhiClient);
  });

  it('creates items for a batch the SAKHI caller owns', async () => {
    repository.findBatchOwner.mockResolvedValue(callerId);
    repository.create.mockResolvedValue(createdItem);

    const result = await service.create({ items: [item] }, caller({ id: callerId }), AUTH_HEADER);

    expect(repository.create).toHaveBeenCalledWith(item);
    expect(result).toEqual([createdItem]);
  });

  it('404s when the syncBatchId does not exist', async () => {
    repository.findBatchOwner.mockResolvedValue(null);

    await expect(
      service.create({ items: [item] }, caller({ id: callerId }), AUTH_HEADER),
    ).rejects.toMatchObject({ status: 404 });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("403s a SAKHI caller reporting items against a batch they don't own", async () => {
    repository.findBatchOwner.mockResolvedValue(otherUserId);

    await expect(
      service.create({ items: [item] }, caller({ id: callerId }), AUTH_HEADER),
    ).rejects.toThrow('You do not have access to this sync batch.');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('allows a SUPERVISOR to report items for a batch owned by a Sakhi on their own roster', async () => {
    repository.findBatchOwner.mockResolvedValue(otherUserId);
    sakhiClient.findById.mockResolvedValue({ sakhiId: otherUserId, supervisorId: callerId });
    repository.create.mockResolvedValue(createdItem);

    await service.create(
      { items: [item] },
      caller({ id: callerId, roles: ['SUPERVISOR'] }),
      AUTH_HEADER,
    );

    expect(repository.create).toHaveBeenCalledWith(item);
  });

  it('403s a SUPERVISOR reporting items for a batch owned by a Sakhi outside their roster', async () => {
    repository.findBatchOwner.mockResolvedValue(otherUserId);
    sakhiClient.findById.mockResolvedValue({ sakhiId: otherUserId, supervisorId: 'someone-else' });

    await expect(
      service.create(
        { items: [item] },
        caller({ id: callerId, roles: ['SUPERVISOR'] }),
        AUTH_HEADER,
      ),
    ).rejects.toThrow('You do not have access to this sync batch.');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('leaves a MANAGER/ADMIN caller unscoped — no ownership lookup made', async () => {
    repository.findBatchOwner.mockResolvedValue(otherUserId);
    repository.create.mockResolvedValue(createdItem);

    await service.create({ items: [item] }, caller({ roles: ['MANAGER'] }), AUTH_HEADER);

    expect(sakhiClient.findById).not.toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledWith(item);
  });

  it('checks batch ownership once per distinct syncBatchId, even with multiple items in the same batch', async () => {
    repository.findBatchOwner.mockResolvedValue(callerId);
    repository.create.mockResolvedValue(createdItem);

    await service.create(
      { items: [item, { ...item, localEntityUuid: 'local-uuid-2' }] },
      caller({ id: callerId }),
      AUTH_HEADER,
    );

    expect(repository.findBatchOwner).toHaveBeenCalledTimes(1);
    expect(repository.create).toHaveBeenCalledTimes(2);
  });
});
