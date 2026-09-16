import { runAnalyticsAggregationJob } from './analyticsAggregation.job';
import { acquireJobLock } from '@armman/service-commons';
import { AnalyticsEventClient } from '../analytics-client/analyticsEvent.client';
import { AggregatedMetricRepository } from '../metrics/aggregatedMetric.repository';

jest.mock('@armman/service-commons', () => ({
  acquireJobLock: jest.fn(),
  ServiceTokenClient: jest.fn(),
}));
jest.mock('../analytics-client/analyticsEvent.client');
jest.mock('../metrics/aggregatedMetric.repository');

describe('runAnalyticsAggregationJob', () => {
  const listAll = jest.fn();
  const upsert = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (AnalyticsEventClient as jest.Mock).mockImplementation(() => ({ listAll }));
    (AggregatedMetricRepository as jest.Mock).mockImplementation(() => ({ upsert }));
    (acquireJobLock as jest.Mock).mockResolvedValue(true);
    upsert.mockResolvedValue({});
  });

  const baseDeps = () => ({
    prisma: {} as never,
    getSystemToken: jest.fn().mockResolvedValue('system-token'),
  });

  it('does nothing when the lock is already held by another run', async () => {
    (acquireJobLock as jest.Mock).mockResolvedValue(false);

    await runAnalyticsAggregationJob(baseDeps());

    expect(listAll).not.toHaveBeenCalled();
  });

  it('skips the tick without throwing when a service token cannot be minted', async () => {
    const deps = {
      prisma: {} as never,
      getSystemToken: jest.fn().mockRejectedValue(new Error('auth-service unreachable')),
    };

    await expect(runAnalyticsAggregationJob(deps)).resolves.not.toThrow();
    expect(listAll).not.toHaveBeenCalled();
  });

  it('fetches ENROLLMENT events for the prior calendar day and upserts all 3 metrics', async () => {
    listAll.mockResolvedValue([
      {
        id: '1',
        sakhiUserId: 'sakhi-1',
        eventName: 'FORM_OPEN',
        occurredAt: '2026-09-07T10:00:00.000Z',
        payloadJson: null,
      },
      {
        id: '2',
        sakhiUserId: 'sakhi-1',
        eventName: 'FORM_SUBMIT',
        occurredAt: '2026-09-07T10:01:00.000Z',
        payloadJson: null,
      },
    ]);

    await runAnalyticsAggregationJob(baseDeps());

    expect(listAll).toHaveBeenCalledWith(
      'ENROLLMENT',
      expect.any(Date),
      expect.any(Date),
      'Bearer system-token',
    );
    expect(upsert).toHaveBeenCalledTimes(3);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ metricName: 'DROP_OFF_RATE', value: 0 }),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ metricName: 'AVERAGE_FORM_COMPLETION_TIME_MS' }),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ metricName: 'ENROLLMENTS_PER_SAKHI' }),
    );
  });

  it('logs and completes cleanly (no throw) when the analytics client fails', async () => {
    listAll.mockRejectedValue(new Error('audit-service unreachable'));

    await expect(runAnalyticsAggregationJob(baseDeps())).resolves.not.toThrow();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('completes cleanly with zero-value metrics when no events exist for the period', async () => {
    listAll.mockResolvedValue([]);

    await runAnalyticsAggregationJob(baseDeps());

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ metricName: 'DROP_OFF_RATE', value: null }),
    );
  });
});
