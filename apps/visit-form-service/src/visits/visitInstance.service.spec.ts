import { VisitInstanceService } from './visitInstance.service';
import type { VisitInstanceRepository } from './visitInstance.repository';
import type { CreateVisitInstanceInput } from './dto/create-visitInstance.dto';

describe('VisitInstanceService', () => {
  const repository = {
    findMany: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<VisitInstanceRepository>;
  let service: VisitInstanceService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new VisitInstanceService(repository);
  });

  it('lists via repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
    expect(repository.findMany).toHaveBeenCalledTimes(1);
  });

  const sampleRow = {
    id: '1',
    scheduleId: '11111111-1111-1111-1111-111111111111',
    beneficiaryId: '22222222-2222-2222-2222-222222222222',
    sakhiId: '33333333-3333-3333-3333-333333333333',
    localVisitUuid: 'local-visit-1',
    actualVisitDate: null,
    // A row written after the enum→lookup migration: statusLookupValueId is
    // set directly, statusCode is null (it only carries legacy enum values on
    // rows migrated from the old column).
    statusCode: null,
    statusLookupValueId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    meetBeneficiaryFlag: null,
    notMetReason: null,
    completedAt: null,
    syncedAt: null,
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
    const dto: CreateVisitInstanceInput = {
      scheduleId: '11111111-1111-1111-1111-111111111111',
      beneficiaryId: '22222222-2222-2222-2222-222222222222',
      sakhiId: '33333333-3333-3333-3333-333333333333',
      localVisitUuid: 'local-visit-1',
      statusLookupValueId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
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
        scheduleId: '11111111-1111-1111-1111-111111111111',
        beneficiaryId: '22222222-2222-2222-2222-222222222222',
        sakhiId: '33333333-3333-3333-3333-333333333333',
        localVisitUuid: 'local-visit-1',
        statusLookupValueId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      }),
    ).rejects.toThrow('db down');
  });
});
