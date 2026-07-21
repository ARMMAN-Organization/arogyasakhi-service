import { ClosureService } from './closure.service';
import type { ClosureRepository } from './closure.repository';
import type { CreateClosureInput } from './dto/create-closure.dto';
import type { ClosureType } from '../../../../node_modules/.prisma/client-closure-reopen-service';

describe('ClosureService', () => {
  const repository = {
    findMany: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<ClosureRepository>;
  let service: ClosureService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ClosureService(repository);
  });

  it('lists via repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
    expect(repository.findMany).toHaveBeenCalledTimes(1);
  });

  it('returns the repository list unchanged', async () => {
    const rows = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        beneficiaryId: '22222222-2222-2222-2222-222222222222',
        closureType: 'MEDICAL' as ClosureType,
        closureReasonLookupValueId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        eventDate: new Date('2026-06-01'),
        closureDate: new Date('2026-06-05'),
        submittedByUserId: '33333333-3333-3333-3333-333333333333',
        supervisorStatus: null,
        supervisorId: null,
        supervisorNotes: null,
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
    const dto: CreateClosureInput = {
      beneficiaryId: '22222222-2222-2222-2222-222222222222',
      closureType: 'MEDICAL',
      closureReasonLookupValueId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      eventDate: new Date('2026-06-01'),
      closureDate: new Date('2026-06-05'),
      submittedByUserId: '33333333-3333-3333-3333-333333333333',
    };
    const created = {
      id: '11111111-1111-1111-1111-111111111111',
      beneficiaryId: dto.beneficiaryId,
      closureType: dto.closureType as ClosureType,
      closureReasonLookupValueId: dto.closureReasonLookupValueId,
      eventDate: dto.eventDate ?? null,
      closureDate: dto.closureDate,
      submittedByUserId: dto.submittedByUserId,
      supervisorStatus: null,
      supervisorId: null,
      supervisorNotes: null,
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
    const dto: CreateClosureInput = {
      beneficiaryId: '22222222-2222-2222-2222-222222222222',
      closureType: 'MEDICAL',
      closureReasonLookupValueId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      closureDate: new Date('2026-06-05'),
      submittedByUserId: '33333333-3333-3333-3333-333333333333',
    };
    repository.create.mockRejectedValue(new Error('db down'));
    await expect(service.create(dto)).rejects.toThrow('db down');
  });
});
