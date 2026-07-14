import { SessionService } from './session.service';
import type { SessionRepository } from './session.repository';
import type { CreateSessionInput } from './dto/create-session.dto';

describe('SessionService', () => {
  const repository = {
    findMany: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<SessionRepository>;
  let service: SessionService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new SessionService(repository);
  });

  it('lists via repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
    expect(repository.findMany).toHaveBeenCalledTimes(1);
  });

  const sampleRow = {
    id: '1',
    userId: '11111111-1111-1111-1111-111111111111',
    refreshTokenHash: 'hash-1',
    deviceId: null,
    issuedAt: new Date(),
    expiresAt: new Date(),
    revokedAt: null,
    ipAddress: null,
    createdAt: new Date(),
    createdByUserId: null,
    updatedAt: new Date(),
    updatedByUserId: null,
    isDeleted: false,
    deletedAt: null,
  };

  it('returns the repository list unchanged', async () => {
    const rows = [sampleRow];
    repository.findMany.mockResolvedValue(rows);
    await expect(service.list()).resolves.toBe(rows);
  });

  it('creates via repository with the given data', async () => {
    const dto: CreateSessionInput = {
      userId: '11111111-1111-1111-1111-111111111111',
      refreshTokenHash: 'hash-1',
      issuedAt: new Date(),
      expiresAt: new Date(),
    };
    const created = sampleRow;
    repository.create.mockResolvedValue(created);
    await expect(service.create(dto)).resolves.toBe(created);
    expect(repository.create).toHaveBeenCalledWith(dto);
  });

  it('propagates repository errors on create', async () => {
    repository.create.mockRejectedValue(new Error('db down'));
    await expect(
      service.create({
        userId: '11111111-1111-1111-1111-111111111111',
        refreshTokenHash: 'hash-1',
        issuedAt: new Date(),
        expiresAt: new Date(),
      }),
    ).rejects.toThrow('db down');
  });
});
