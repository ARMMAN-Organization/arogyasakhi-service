import { RuleSetService } from './ruleSet.service';
import type { RuleSetRepository } from './ruleSet.repository';
import type { CreateRuleSetInput } from './dto/create-ruleSet.dto';

describe('RuleSetService', () => {
  const repository = {
    findMany: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<RuleSetRepository>;
  let service: RuleSetService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new RuleSetService(repository);
  });

  it('lists via repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
    expect(repository.findMany).toHaveBeenCalledTimes(1);
  });

  it('returns the repository list unchanged', async () => {
    const rows = [
      {
        id: '1',
        ruleCategory: 'RISK' as const,
        ruleSetName: 'a',
        status: 'DRAFT' as const,
        createdAt: new Date(),
        createdByUserId: null,
        updatedAt: new Date(),
        updatedByUserId: null,
        isDeleted: false,
        deletedAt: null,
      },
    ];
    repository.findMany.mockResolvedValue(rows);
    await expect(service.list()).resolves.toBe(rows);
  });

  it('creates via repository with the given data', async () => {
    const dto: CreateRuleSetInput = {
      ruleCategory: 'RISK',
      ruleSetName: 'ruleset-1',
      status: 'DRAFT',
    };
    const created = {
      id: '1',
      ruleCategory: 'RISK' as const,
      ruleSetName: 'ruleset-1',
      status: 'DRAFT' as const,
      createdAt: new Date(),
      createdByUserId: null,
      updatedAt: new Date(),
      updatedByUserId: null,
      isDeleted: false,
      deletedAt: null,
    };
    repository.create.mockResolvedValue(created);
    await expect(service.create(dto)).resolves.toBe(created);
    expect(repository.create).toHaveBeenCalledWith(dto);
  });

  it('propagates repository errors on create', async () => {
    repository.create.mockRejectedValue(new Error('db down'));
    await expect(
      service.create({ ruleCategory: 'RISK', ruleSetName: 'x', status: 'DRAFT' }),
    ).rejects.toThrow('db down');
  });
});
