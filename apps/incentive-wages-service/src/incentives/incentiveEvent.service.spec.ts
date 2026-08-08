import { Prisma } from '../../../../node_modules/.prisma/client-incentive-wages-service';
import { IncentiveEventService } from './incentiveEvent.service';
import type { IncentiveEventRepository } from './incentiveEvent.repository';
import type { IncentiveRateRepository } from '../rates/incentiveRate.repository';
import type { CreateIncentiveEventInput } from './dto/create-incentiveEvent.dto';

describe('IncentiveEventService', () => {
  const repository = {
    findMany: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<IncentiveEventRepository>;
  const rateRepository = {
    findById: jest.fn(),
  } as unknown as jest.Mocked<IncentiveRateRepository>;
  let service: IncentiveEventService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new IncentiveEventService(repository, rateRepository);
  });

  it('lists via repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
    expect(repository.findMany).toHaveBeenCalledTimes(1);
  });

  const baseDto: CreateIncentiveEventInput = {
    sakhiId: '11111111-1111-1111-1111-111111111111',
    sourceEntityType: 'VISIT',
    sourceEntityId: '22222222-2222-2222-2222-222222222222',
    eventMonth: new Date('2026-07-01'),
    rateId: '33333333-3333-3333-3333-333333333333',
    quantity: 1,
    eligibilityStatus: 'ELIGIBLE',
    calculatedAt: new Date('2026-07-14T10:00:00Z'),
  };

  const rateRow = {
    id: baseDto.rateId,
    rateType: 'VISIT',
    amountInr: new Prisma.Decimal(150),
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
  };

  const createdRow = {
    id: '44444444-4444-4444-4444-444444444444',
    sakhiId: baseDto.sakhiId,
    sourceEntityType: baseDto.sourceEntityType,
    sourceEntityId: baseDto.sourceEntityId ?? null,
    eventMonth: baseDto.eventMonth,
    rateId: baseDto.rateId,
    quantity: new Prisma.Decimal(baseDto.quantity ?? 1),
    amountInr: new Prisma.Decimal(150),
    eligibilityStatus: baseDto.eligibilityStatus,
    calculatedAt: baseDto.calculatedAt,
    createdAt: new Date(),
    createdByUserId: null,
    updatedAt: new Date(),
    updatedByUserId: null,
    isDeleted: false,
    deletedAt: null,
  };

  it('returns the repository list unchanged', async () => {
    const rows = [createdRow];
    repository.findMany.mockResolvedValue(rows);
    await expect(service.list()).resolves.toBe(rows);
  });

  it('re-derives amountInr from the referenced rate, never trusting a client value', async () => {
    rateRepository.findById.mockResolvedValue(rateRow as never);
    repository.create.mockResolvedValue(createdRow);

    await expect(service.create(baseDto)).resolves.toBe(createdRow);

    expect(rateRepository.findById).toHaveBeenCalledWith(baseDto.rateId);
    expect(repository.create).toHaveBeenCalledWith({ ...baseDto, amountInr: 150 });
  });

  it('404s when rateId does not reference an existing rate', async () => {
    rateRepository.findById.mockResolvedValue(null);
    await expect(service.create(baseDto)).rejects.toMatchObject({ status: 404 });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("422s when the rate's rateType does not match the event's sourceEntityType", async () => {
    rateRepository.findById.mockResolvedValue({ ...rateRow, rateType: 'REFERRAL' } as never);

    await expect(service.create(baseDto)).rejects.toMatchObject({ status: 422 });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('422s when the rate is not yet effective as of calculatedAt', async () => {
    rateRepository.findById.mockResolvedValue({
      ...rateRow,
      effectiveFrom: new Date('2026-08-01'),
    } as never);

    await expect(service.create(baseDto)).rejects.toMatchObject({ status: 422 });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('422s when the rate has already expired as of calculatedAt', async () => {
    rateRepository.findById.mockResolvedValue({
      ...rateRow,
      effectiveTo: new Date('2026-06-01'),
    } as never);

    await expect(service.create(baseDto)).rejects.toMatchObject({ status: 422 });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('succeeds when calculatedAt falls exactly on effectiveFrom or effectiveTo (inclusive bounds)', async () => {
    rateRepository.findById.mockResolvedValue({
      ...rateRow,
      effectiveFrom: baseDto.calculatedAt,
      effectiveTo: baseDto.calculatedAt,
    } as never);
    repository.create.mockResolvedValue(createdRow);

    await expect(service.create(baseDto)).resolves.toBe(createdRow);
  });

  it('propagates repository errors on create', async () => {
    rateRepository.findById.mockResolvedValue(rateRow as never);
    repository.create.mockRejectedValue(new Error('db down'));
    await expect(service.create(baseDto)).rejects.toThrow('db down');
  });
});
