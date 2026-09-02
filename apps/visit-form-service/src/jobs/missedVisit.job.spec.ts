import { countConsecutiveMissed, runMissedVisitJob } from './missedVisit.job';
import { acquireJobLock } from '@armman/service-commons';
import { VisitScheduleRepository } from '../visit-schedules/visitSchedule.repository';
import { VisitInstanceRepository } from '../visits/visitInstance.repository';
import { resolveVisitStatusIdByCode } from '../lookups/lookup.client';
import { findBeneficiaryById, findBeneficiaryOwnership } from '../beneficiaries/beneficiary.client';
import { findSakhiById } from '../sakhis/sakhi.client';
import { evaluateEscalation } from '../rules/evaluateEscalation.client';
import { createEscalationEvent, createNotification } from '../escalations/systemEscalation.client';

jest.mock('@armman/service-commons', () => ({
  acquireJobLock: jest.fn(),
  ServiceTokenClient: jest.fn(),
}));
jest.mock('../visit-schedules/visitSchedule.repository');
jest.mock('../visits/visitInstance.repository');
jest.mock('../lookups/lookup.client');
jest.mock('../beneficiaries/beneficiary.client');
jest.mock('../sakhis/sakhi.client');
jest.mock('../rules/evaluateEscalation.client');
jest.mock('../escalations/systemEscalation.client');

describe('countConsecutiveMissed', () => {
  it('counts the unbroken trailing run of MISSED', () => {
    expect(
      countConsecutiveMissed([{ status: 'MISSED' }, { status: 'MISSED' }, { status: 'COMPLETED' }]),
    ).toBe(2);
  });

  it('returns 0 when the most recent schedule is not MISSED', () => {
    expect(countConsecutiveMissed([{ status: 'COMPLETED' }, { status: 'MISSED' }])).toBe(0);
  });

  it('returns 0 on an empty list', () => {
    expect(countConsecutiveMissed([])).toBe(0);
  });
});

describe('runMissedVisitJob', () => {
  const findOverdueOpenSchedules = jest.fn();
  const markMissed = jest.fn();
  const revertToOpen = jest.fn();
  const findRecentByBeneficiaryAndVisitType = jest.fn();
  const markMissedByScheduleId = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    revertToOpen.mockResolvedValue(true);
    (VisitScheduleRepository as jest.Mock).mockImplementation(() => ({
      findOverdueOpenSchedules,
      markMissed,
      revertToOpen,
      findRecentByBeneficiaryAndVisitType,
    }));
    (VisitInstanceRepository as jest.Mock).mockImplementation(() => ({
      markMissedByScheduleId,
    }));
    (acquireJobLock as jest.Mock).mockResolvedValue(true);
    (resolveVisitStatusIdByCode as jest.Mock).mockResolvedValue('missed-lookup-id');
    (findBeneficiaryOwnership as jest.Mock).mockResolvedValue({ sakhiId: 'sakhi-1' });
    (findBeneficiaryById as jest.Mock).mockResolvedValue({ fullName: 'Jane Doe' });
    (findSakhiById as jest.Mock).mockResolvedValue({ supervisorId: 'supervisor-1' });
    (createEscalationEvent as jest.Mock).mockResolvedValue({ id: 'event-1', status: 'OPEN' });
    (createNotification as jest.Mock).mockResolvedValue(undefined);
  });

  const baseDeps = () => ({
    prisma: {} as never,
    escalationRuleSetId: 'rule-set-1',
    getSystemToken: jest.fn().mockResolvedValue('system-token'),
  });

  it('does nothing when the lock is already held by another run', async () => {
    (acquireJobLock as jest.Mock).mockResolvedValue(false);

    await runMissedVisitJob(baseDeps());

    expect(findOverdueOpenSchedules).not.toHaveBeenCalled();
  });

  it('transitions an overdue OPEN schedule to MISSED and raises an escalation when shouldEscalate', async () => {
    findOverdueOpenSchedules.mockResolvedValue([
      { id: 'schedule-1', beneficiaryId: 'ben-1', visitType: 'ANC_HR' },
    ]);
    markMissed.mockResolvedValue(true);
    findRecentByBeneficiaryAndVisitType.mockResolvedValue([{ status: 'MISSED' }]);
    (evaluateEscalation as jest.Mock).mockResolvedValue({
      shouldEscalate: true,
      reasonCode: 'HR_VISIT_MISSED',
    });

    await runMissedVisitJob(baseDeps());

    expect(markMissed).toHaveBeenCalledWith('schedule-1');
    expect(markMissedByScheduleId).toHaveBeenCalledWith(
      'schedule-1',
      'missed-lookup-id',
      'missed-visit-escalation-job',
    );
    expect(evaluateEscalation).toHaveBeenCalledWith(
      'rule-set-1',
      { visitFamily: 'ANC', isHrVisit: true, consecutiveMissedCount: 1 },
      'Bearer system-token',
    );
    expect(createEscalationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        beneficiaryId: 'ben-1',
        escalationType: 'ANC_HR_MISSED',
        visitId: 'schedule-1',
        visitsMissedCount: 1,
        assignedSupervisorId: 'supervisor-1',
      }),
      'system-token',
    );
    expect(createNotification).toHaveBeenCalledWith(
      {
        recipientUserId: 'supervisor-1',
        notificationType: 'HR_MISSED_VISIT_ESCALATION',
        title: 'HR escalation — visit missed',
        body: 'Jane Doe has missed 1 consecutive visits — HR review required.',
        priority: 8,
        linkedEntityType: 'ESCALATION_EVENT',
        linkedEntityId: 'event-1',
      },
      'system-token',
    );
  });

  it.each([
    ['PP_HR', 'PP', 'PP_HR_MISSED'],
    ['NN_HR', 'NN', 'NN_HR_MISSED'],
    ['INC_HR', 'INC', 'INC_HR_MISSED'],
    ['CCV_HR', 'CCV', 'CCV_HR_MISSED'],
  ])(
    'raises %s as %s and the matching escalationType %s',
    async (visitType, visitFamily, escalationType) => {
      findOverdueOpenSchedules.mockResolvedValue([
        { id: 'schedule-1', beneficiaryId: 'ben-1', visitType },
      ]);
      markMissed.mockResolvedValue(true);
      findRecentByBeneficiaryAndVisitType.mockResolvedValue([{ status: 'MISSED' }]);
      (evaluateEscalation as jest.Mock).mockResolvedValue({ shouldEscalate: true });

      await runMissedVisitJob(baseDeps());

      expect(evaluateEscalation).toHaveBeenCalledWith(
        'rule-set-1',
        { visitFamily, isHrVisit: true, consecutiveMissedCount: 1 },
        'Bearer system-token',
      );
      expect(createEscalationEvent).toHaveBeenCalledWith(
        expect.objectContaining({ escalationType }),
        'system-token',
      );
      expect(createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ notificationType: 'HR_MISSED_VISIT_ESCALATION' }),
        'system-token',
      );
    },
  );

  it('falls back to generic body text when the beneficiary name lookup fails', async () => {
    findOverdueOpenSchedules.mockResolvedValue([
      { id: 'schedule-1', beneficiaryId: 'ben-1', visitType: 'ANC_HR' },
    ]);
    markMissed.mockResolvedValue(true);
    findRecentByBeneficiaryAndVisitType.mockResolvedValue([{ status: 'MISSED' }]);
    (evaluateEscalation as jest.Mock).mockResolvedValue({ shouldEscalate: true });
    (findBeneficiaryById as jest.Mock).mockRejectedValue(new Error('beneficiary-service down'));

    await runMissedVisitJob(baseDeps());

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'A beneficiary has missed 1 consecutive visits — HR review required.',
      }),
      'system-token',
    );
  });

  it('still sends the generic MISSED_VISIT_ESCALATION notification for a non-HR family', async () => {
    findOverdueOpenSchedules.mockResolvedValue([
      { id: 'schedule-1', beneficiaryId: 'ben-1', visitType: 'ANC' },
    ]);
    markMissed.mockResolvedValue(true);
    findRecentByBeneficiaryAndVisitType.mockResolvedValue([{ status: 'MISSED' }]);
    (evaluateEscalation as jest.Mock).mockResolvedValue({ shouldEscalate: true });

    await runMissedVisitJob(baseDeps());

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationType: 'MISSED_VISIT_ESCALATION',
        title: 'A Sakhi has a missed-visit escalation requiring review',
        linkedEntityType: 'VISIT_SCHEDULE',
        linkedEntityId: 'schedule-1',
      }),
      'system-token',
    );
    expect(findBeneficiaryById).not.toHaveBeenCalled();
  });

  it('creates the HR escalation with assignedSupervisorId but skips the notification when no supervisor is found', async () => {
    findOverdueOpenSchedules.mockResolvedValue([
      { id: 'schedule-1', beneficiaryId: 'ben-1', visitType: 'ANC_HR' },
    ]);
    markMissed.mockResolvedValue(true);
    findRecentByBeneficiaryAndVisitType.mockResolvedValue([{ status: 'MISSED' }]);
    (evaluateEscalation as jest.Mock).mockResolvedValue({ shouldEscalate: true });
    (findSakhiById as jest.Mock).mockResolvedValue({ supervisorId: null });

    await runMissedVisitJob(baseDeps());

    expect(createEscalationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ assignedSupervisorId: undefined }),
      'system-token',
    );
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('creates the HR escalation but skips the notification when the server returns a non-OPEN status (duplicate)', async () => {
    findOverdueOpenSchedules.mockResolvedValue([
      { id: 'schedule-1', beneficiaryId: 'ben-1', visitType: 'ANC_HR' },
    ]);
    markMissed.mockResolvedValue(true);
    findRecentByBeneficiaryAndVisitType.mockResolvedValue([{ status: 'MISSED' }]);
    (evaluateEscalation as jest.Mock).mockResolvedValue({ shouldEscalate: true });
    (createEscalationEvent as jest.Mock).mockResolvedValue({
      id: 'event-1',
      status: 'ALREADY_OPEN',
    });

    await runMissedVisitJob(baseDeps());

    expect(createNotification).not.toHaveBeenCalled();
  });

  it('logs and continues the batch when the HR notification call fails', async () => {
    findOverdueOpenSchedules.mockResolvedValue([
      { id: 'schedule-1', beneficiaryId: 'ben-1', visitType: 'ANC_HR' },
      { id: 'schedule-2', beneficiaryId: 'ben-2', visitType: 'ANC_HR' },
    ]);
    markMissed.mockResolvedValue(true);
    findRecentByBeneficiaryAndVisitType.mockResolvedValue([{ status: 'MISSED' }]);
    (evaluateEscalation as jest.Mock).mockResolvedValue({ shouldEscalate: true });
    (createNotification as jest.Mock).mockRejectedValueOnce(
      new Error('notification-escalation-service down'),
    );

    await runMissedVisitJob(baseDeps());

    expect(createEscalationEvent).toHaveBeenCalledTimes(2);
    expect(createNotification).toHaveBeenCalledTimes(2);
  });

  it('does not raise an escalation when the rule pack says not to', async () => {
    findOverdueOpenSchedules.mockResolvedValue([
      { id: 'schedule-1', beneficiaryId: 'ben-1', visitType: 'ANC' },
    ]);
    markMissed.mockResolvedValue(true);
    findRecentByBeneficiaryAndVisitType.mockResolvedValue([{ status: 'MISSED' }]);
    (evaluateEscalation as jest.Mock).mockResolvedValue({
      shouldEscalate: false,
      reasonCode: 'BELOW_THRESHOLD',
    });

    await runMissedVisitJob(baseDeps());

    expect(createEscalationEvent).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('skips a schedule that a concurrent run already transitioned (idempotent)', async () => {
    findOverdueOpenSchedules.mockResolvedValue([
      { id: 'schedule-1', beneficiaryId: 'ben-1', visitType: 'ANC' },
    ]);
    markMissed.mockResolvedValue(false);

    await runMissedVisitJob(baseDeps());

    expect(markMissedByScheduleId).not.toHaveBeenCalled();
    expect(evaluateEscalation).not.toHaveBeenCalled();
  });

  it('skips escalation/notification (but still transitions) for an unmapped visitType like DELIVERY', async () => {
    findOverdueOpenSchedules.mockResolvedValue([
      { id: 'schedule-1', beneficiaryId: 'ben-1', visitType: 'DELIVERY' },
    ]);
    markMissed.mockResolvedValue(true);

    await runMissedVisitJob(baseDeps());

    expect(markMissedByScheduleId).toHaveBeenCalled();
    expect(evaluateEscalation).not.toHaveBeenCalled();
    expect(createEscalationEvent).not.toHaveBeenCalled();
  });

  it('aborts the whole tick without transitioning anything when minting a service token fails', async () => {
    findOverdueOpenSchedules.mockResolvedValue([
      { id: 'schedule-1', beneficiaryId: 'ben-1', visitType: 'ANC' },
    ]);
    const deps = baseDeps();
    deps.getSystemToken = jest.fn().mockRejectedValue(new Error('auth-service unreachable'));

    await runMissedVisitJob(deps);

    // Aborting before markMissed means the next tick's findOverdueOpenSchedules
    // will see this same schedule again — no permanent desync from a
    // transient auth-service blip.
    expect(markMissed).not.toHaveBeenCalled();
    expect(evaluateEscalation).not.toHaveBeenCalled();
    expect(createEscalationEvent).not.toHaveBeenCalled();
  });

  it('aborts the whole tick without transitioning anything when resolving the MISSED lookup fails', async () => {
    findOverdueOpenSchedules.mockResolvedValue([
      { id: 'schedule-1', beneficiaryId: 'ben-1', visitType: 'ANC' },
    ]);
    (resolveVisitStatusIdByCode as jest.Mock).mockRejectedValue(new Error('auth-service 503'));

    await runMissedVisitJob(baseDeps());

    expect(markMissed).not.toHaveBeenCalled();
    expect(evaluateEscalation).not.toHaveBeenCalled();
  });

  it('reverts a schedule back to OPEN when markMissedByScheduleId fails after markMissed succeeded', async () => {
    findOverdueOpenSchedules.mockResolvedValue([
      { id: 'schedule-1', beneficiaryId: 'ben-1', visitType: 'ANC' },
    ]);
    markMissed.mockResolvedValue(true);
    markMissedByScheduleId.mockRejectedValue(new Error('db write failed'));

    await runMissedVisitJob(baseDeps());

    expect(revertToOpen).toHaveBeenCalledWith('schedule-1');
    expect(evaluateEscalation).not.toHaveBeenCalled();
  });

  it('reverts a schedule back to OPEN when evaluateAndEscalate throws after markMissed succeeded', async () => {
    findOverdueOpenSchedules.mockResolvedValue([
      { id: 'schedule-1', beneficiaryId: 'ben-1', visitType: 'ANC' },
    ]);
    markMissed.mockResolvedValue(true);
    findRecentByBeneficiaryAndVisitType.mockResolvedValue([{ status: 'MISSED' }]);
    (evaluateEscalation as jest.Mock).mockRejectedValue(new Error('rules-service 503'));

    await runMissedVisitJob(baseDeps());

    expect(revertToOpen).toHaveBeenCalledWith('schedule-1');
  });

  it('continues processing remaining schedules when one throws', async () => {
    findOverdueOpenSchedules.mockResolvedValue([
      { id: 'schedule-1', beneficiaryId: 'ben-1', visitType: 'ANC' },
      { id: 'schedule-2', beneficiaryId: 'ben-2', visitType: 'ANC' },
    ]);
    markMissed.mockImplementation((id: string) => {
      if (id === 'schedule-1') throw new Error('boom');
      return Promise.resolve(true);
    });
    findRecentByBeneficiaryAndVisitType.mockResolvedValue([{ status: 'MISSED' }]);
    (evaluateEscalation as jest.Mock).mockResolvedValue({
      shouldEscalate: false,
      reasonCode: 'BELOW_THRESHOLD',
    });

    await runMissedVisitJob(baseDeps());

    expect(markMissed).toHaveBeenCalledWith('schedule-2');
  });
});
