import { runPostEddVisitGenerationJob } from './postEddVisitGeneration.job';
import { acquireJobLock } from '@armman/service-commons';
import { VisitScheduleRepository } from '../visit-schedules/visitSchedule.repository';
import { VisitScheduleService } from '../visit-schedules/visitSchedule.service';
import { findPostEddPendingBeneficiaries } from '../beneficiaries/beneficiary.client';

jest.mock('@armman/service-commons', () => ({
  acquireJobLock: jest.fn(),
  ServiceTokenClient: jest.fn(),
}));
jest.mock('../visit-schedules/visitSchedule.repository');
// Explicit factory (not bare auto-mock) — the real visitSchedule.service.ts
// transitively imports app-config.ts, which eagerly parses process.env at
// module-load time; auto-mocking still requires the real module first to
// infer its shape, which fails outside a fully-configured environment. A
// factory sidesteps that entirely, same reasoning as missedVisit.job.spec.ts
// never importing this module in the first place.
jest.mock('../visit-schedules/visitSchedule.service', () => ({
  VisitScheduleService: jest.fn(),
}));
jest.mock('../beneficiaries/beneficiary.client');

describe('runPostEddVisitGenerationJob', () => {
  const findByBeneficiaryAndVisitCodes = jest.fn();
  const generateSchedule = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (VisitScheduleRepository as jest.Mock).mockImplementation(() => ({
      findByBeneficiaryAndVisitCodes,
    }));
    (VisitScheduleService as jest.Mock).mockImplementation(() => ({
      generateSchedule,
    }));
    (acquireJobLock as jest.Mock).mockResolvedValue(true);
    (findPostEddPendingBeneficiaries as jest.Mock).mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    findByBeneficiaryAndVisitCodes.mockResolvedValue([]);
    generateSchedule.mockResolvedValue(undefined);
  });

  const baseDeps = () => ({
    prisma: {} as never,
    getSystemToken: jest.fn().mockResolvedValue('system-token'),
  });

  it('does nothing when the lock is already held by another run', async () => {
    (acquireJobLock as jest.Mock).mockResolvedValue(false);

    await runPostEddVisitGenerationJob(baseDeps());

    expect(findPostEddPendingBeneficiaries).not.toHaveBeenCalled();
  });

  it('logs and exits the tick when a service token cannot be minted', async () => {
    const deps = {
      prisma: {} as never,
      getSystemToken: jest.fn().mockRejectedValue(new Error('no credentials configured')),
    };
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await runPostEddVisitGenerationJob(deps);

    expect(findPostEddPendingBeneficiaries).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('generates the ANC_POST_EDD schedule for a candidate with none yet', async () => {
    (findPostEddPendingBeneficiaries as jest.Mock).mockResolvedValue({
      items: [
        {
          beneficiaryId: 'ben-1',
          registrationDate: '2026-01-01T00:00:00.000Z',
          eddDate: '2026-08-10T00:00:00.000Z',
        },
      ],
      nextCursor: null,
    });

    await runPostEddVisitGenerationJob(baseDeps());

    expect(findByBeneficiaryAndVisitCodes).toHaveBeenCalledWith('ben-1', ['ANC_POST_EDD1']);
    expect(generateSchedule).toHaveBeenCalledWith(
      {
        beneficiaryId: 'ben-1',
        scheduleKind: 'ANC',
        registrationDate: '2026-01-01',
        edd: '2026-08-10',
        deliveryFormFiledDate: null,
      },
      { id: 'post-edd-visit-generation-job', roles: ['SYSTEM'] },
      'Bearer system-token',
    );
  });

  it('skips a candidate that already has an ANC_POST_EDD schedule', async () => {
    (findPostEddPendingBeneficiaries as jest.Mock).mockResolvedValue({
      items: [{ beneficiaryId: 'ben-1', registrationDate: '2026-01-01', eddDate: '2026-08-10' }],
      nextCursor: null,
    });
    findByBeneficiaryAndVisitCodes.mockResolvedValue([{ id: 'schedule-1' }]);

    await runPostEddVisitGenerationJob(baseDeps());

    expect(generateSchedule).not.toHaveBeenCalled();
  });

  it('continues processing the rest of the batch when one beneficiary fails', async () => {
    (findPostEddPendingBeneficiaries as jest.Mock).mockResolvedValue({
      items: [
        { beneficiaryId: 'ben-1', registrationDate: '2026-01-01', eddDate: '2026-08-10' },
        { beneficiaryId: 'ben-2', registrationDate: '2026-01-02', eddDate: '2026-08-11' },
      ],
      nextCursor: null,
    });
    generateSchedule
      .mockRejectedValueOnce(new Error('rules-service unavailable'))
      .mockResolvedValueOnce(undefined);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await runPostEddVisitGenerationJob(baseDeps());

    expect(generateSchedule).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  it('paginates through multiple pages until nextCursor is null', async () => {
    (findPostEddPendingBeneficiaries as jest.Mock)
      .mockResolvedValueOnce({
        items: [{ beneficiaryId: 'ben-1', registrationDate: '2026-01-01', eddDate: '2026-08-10' }],
        nextCursor: 'cursor-1',
      })
      .mockResolvedValueOnce({
        items: [{ beneficiaryId: 'ben-2', registrationDate: '2026-01-02', eddDate: '2026-08-11' }],
        nextCursor: null,
      });

    await runPostEddVisitGenerationJob(baseDeps());

    expect(findPostEddPendingBeneficiaries).toHaveBeenCalledTimes(2);
    expect(findPostEddPendingBeneficiaries).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      200,
      'cursor-1',
      'Bearer system-token',
    );
    expect(generateSchedule).toHaveBeenCalledTimes(2);
  });

  it('is a no-op when there are no candidates', async () => {
    await runPostEddVisitGenerationJob(baseDeps());

    expect(generateSchedule).not.toHaveBeenCalled();
  });
});
