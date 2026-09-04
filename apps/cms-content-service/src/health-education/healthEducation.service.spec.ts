import { HealthEducationService } from './healthEducation.service';
import type { HealthEducationRepository } from './healthEducation.repository';

describe('HealthEducationService', () => {
  const repository = {
    findMany: jest.fn(),
  } as unknown as jest.Mocked<HealthEducationRepository>;
  let service: HealthEducationService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new HealthEducationService(repository);
  });

  it('passes riskConditionId through to the repository', async () => {
    repository.findMany.mockResolvedValue([]);

    await service.listMessages({ riskConditionId: 'condition-1' });

    expect(repository.findMany).toHaveBeenCalledWith({
      riskConditionId: 'condition-1',
      stage: undefined,
      conditionLabel: undefined,
    });
  });

  it('passes stage through to the repository', async () => {
    repository.findMany.mockResolvedValue([]);

    await service.listMessages({ stage: 'postpartum (PP1 or PP2 whichever is attended)' });

    expect(repository.findMany).toHaveBeenCalledWith({
      riskConditionId: undefined,
      stage: 'postpartum (PP1 or PP2 whichever is attended)',
      conditionLabel: undefined,
    });
  });

  it('passes conditionLabel through to the repository', async () => {
    repository.findMany.mockResolvedValue([]);

    await service.listMessages({ conditionLabel: 'Anemia' });

    expect(repository.findMany).toHaveBeenCalledWith({
      riskConditionId: undefined,
      stage: undefined,
      conditionLabel: 'Anemia',
    });
  });

  it('passes conditionLabel and stage together, narrowing to one message', async () => {
    repository.findMany.mockResolvedValue([]);

    await service.listMessages({
      conditionLabel: 'Anemia',
      stage: 'as soon as detected during ANC visit',
    });

    expect(repository.findMany).toHaveBeenCalledWith({
      riskConditionId: undefined,
      stage: 'as soon as detected during ANC visit',
      conditionLabel: 'Anemia',
    });
  });

  it('passes no filters when none are given, returning everything', async () => {
    repository.findMany.mockResolvedValue([]);

    await service.listMessages({});

    expect(repository.findMany).toHaveBeenCalledWith({
      riskConditionId: undefined,
      stage: undefined,
      conditionLabel: undefined,
    });
  });
});
