import { AggregatedMetricRepository } from './aggregatedMetric.repository';

describe('AggregatedMetricRepository', () => {
  const upsert = jest.fn();
  const prisma = { aggregatedMetric: { upsert } } as never;
  let repository: AggregatedMetricRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new AggregatedMetricRepository(prisma);
  });

  it('upserts keyed on (featureArea, metricName, periodStart, periodEnd)', async () => {
    upsert.mockResolvedValue({});
    const periodStart = new Date('2026-09-07T00:00:00.000Z');
    const periodEnd = new Date('2026-09-08T00:00:00.000Z');

    await repository.upsert({
      featureArea: 'ENROLLMENT',
      metricName: 'DROP_OFF_RATE',
      periodStart,
      periodEnd,
      value: 0.25,
    });

    expect(upsert).toHaveBeenCalledWith({
      where: {
        featureArea_metricName_periodStart_periodEnd: {
          featureArea: 'ENROLLMENT',
          metricName: 'DROP_OFF_RATE',
          periodStart,
          periodEnd,
        },
      },
      create: {
        featureArea: 'ENROLLMENT',
        metricName: 'DROP_OFF_RATE',
        periodStart,
        periodEnd,
        value: 0.25,
        breakdownJson: undefined,
      },
      update: {
        featureArea: 'ENROLLMENT',
        metricName: 'DROP_OFF_RATE',
        periodStart,
        periodEnd,
        value: 0.25,
        breakdownJson: undefined,
      },
    });
  });

  it('stores a null value when the metric could not be computed (e.g. zero forms started)', async () => {
    upsert.mockResolvedValue({});

    await repository.upsert({
      featureArea: 'ENROLLMENT',
      metricName: 'DROP_OFF_RATE',
      periodStart: new Date('2026-09-07T00:00:00.000Z'),
      periodEnd: new Date('2026-09-08T00:00:00.000Z'),
      value: null,
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ value: null }) }),
    );
  });

  it('stores breakdownJson for a non-scalar metric', async () => {
    upsert.mockResolvedValue({});

    await repository.upsert({
      featureArea: 'ENROLLMENT',
      metricName: 'ENROLLMENTS_PER_SAKHI',
      periodStart: new Date('2026-09-07T00:00:00.000Z'),
      periodEnd: new Date('2026-09-08T00:00:00.000Z'),
      breakdownJson: { 'sakhi-1': 3 },
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ breakdownJson: { 'sakhi-1': 3 } }),
      }),
    );
  });
});
