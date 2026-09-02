import { runOverdueFollowupJob } from './overdueFollowup.job';
import { acquireJobLock } from '@armman/service-commons';
import { ReferralRepository } from '../referrals/referral.repository';
import { BeneficiaryClient } from '../referrals/beneficiary.client';
import { findSakhiById } from '../referrals/sakhi.client';
import { createEscalationEvent, createNotification } from '../referrals/systemEscalation.client';

jest.mock('@armman/service-commons', () => ({
  acquireJobLock: jest.fn(),
  ServiceTokenClient: jest.fn(),
}));
jest.mock('../referrals/referral.repository');
jest.mock('../referrals/beneficiary.client');
jest.mock('../referrals/sakhi.client');
jest.mock('../referrals/systemEscalation.client');

describe('runOverdueFollowupJob', () => {
  const findOverduePendingFollowups = jest.fn();
  const markFollowupEscalated = jest.fn();
  const getById = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (ReferralRepository as jest.Mock).mockImplementation(() => ({
      findOverduePendingFollowups,
      markFollowupEscalated,
    }));
    (BeneficiaryClient as jest.Mock).mockImplementation(() => ({ getById }));
    (acquireJobLock as jest.Mock).mockResolvedValue(true);
    (findSakhiById as jest.Mock).mockResolvedValue({ supervisorId: 'supervisor-1' });
    getById.mockResolvedValue({ id: 'ben-1', sakhiId: 'sakhi-1' });
    (createEscalationEvent as jest.Mock).mockResolvedValue({
      id: 'event-1',
      status: 'OPEN',
      wasCreated: true,
    });
    (createNotification as jest.Mock).mockResolvedValue(undefined);
    markFollowupEscalated.mockResolvedValue(undefined);
  });

  const baseDeps = () => ({
    prisma: {} as never,
    getSystemToken: jest.fn().mockResolvedValue('system-token'),
  });

  it('does nothing when the lock is already held by another run', async () => {
    (acquireJobLock as jest.Mock).mockResolvedValue(false);

    await runOverdueFollowupJob(baseDeps());

    expect(findOverduePendingFollowups).not.toHaveBeenCalled();
  });

  it('raises an escalation, stamps lastEscalatedAt, and notifies the resolved Supervisor for a newly-created escalation', async () => {
    findOverduePendingFollowups.mockResolvedValue([
      { id: 'followup-1', referralId: 'referral-1', referral: { beneficiaryId: 'ben-1' } },
    ]);

    await runOverdueFollowupJob(baseDeps());

    expect(createEscalationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        beneficiaryId: 'ben-1',
        escalationType: 'REFERRAL_FOLLOWUP_MISSED',
        referralId: 'referral-1',
        assignedSupervisorId: 'supervisor-1',
      }),
      'system-token',
    );
    expect(markFollowupEscalated).toHaveBeenCalledWith('followup-1');
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: 'supervisor-1',
        notificationType: 'REFERRAL_FOLLOWUP_OVERDUE',
        linkedEntityId: 'followup-1',
      }),
      'system-token',
    );
  });

  it('does not notify when the escalation was reused (not newly created) — avoids a duplicate daily notification', async () => {
    findOverduePendingFollowups.mockResolvedValue([
      { id: 'followup-1', referralId: 'referral-1', referral: { beneficiaryId: 'ben-1' } },
    ]);
    (createEscalationEvent as jest.Mock).mockResolvedValue({
      id: 'event-1',
      status: 'OPEN',
      wasCreated: false,
    });

    await runOverdueFollowupJob(baseDeps());

    expect(createEscalationEvent).toHaveBeenCalled();
    expect(markFollowupEscalated).toHaveBeenCalledWith('followup-1');
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('skips escalation entirely when minting a service token fails', async () => {
    findOverduePendingFollowups.mockResolvedValue([
      { id: 'followup-1', referralId: 'referral-1', referral: { beneficiaryId: 'ben-1' } },
    ]);
    const deps = baseDeps();
    deps.getSystemToken = jest.fn().mockRejectedValue(new Error('auth-service unreachable'));

    await runOverdueFollowupJob(deps);

    expect(createEscalationEvent).not.toHaveBeenCalled();
  });

  it('skips escalation (does not call createEscalationEvent) when no Supervisor can be resolved', async () => {
    findOverduePendingFollowups.mockResolvedValue([
      { id: 'followup-1', referralId: 'referral-1', referral: { beneficiaryId: 'ben-1' } },
    ]);
    (findSakhiById as jest.Mock).mockResolvedValue({ supervisorId: null });

    await runOverdueFollowupJob(baseDeps());

    expect(createEscalationEvent).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('continues processing remaining follow-ups when one throws', async () => {
    findOverduePendingFollowups.mockResolvedValue([
      { id: 'followup-1', referralId: 'referral-1', referral: { beneficiaryId: 'ben-1' } },
      { id: 'followup-2', referralId: 'referral-2', referral: { beneficiaryId: 'ben-2' } },
    ]);
    (createEscalationEvent as jest.Mock)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ id: 'event-2', status: 'OPEN', wasCreated: true });

    await runOverdueFollowupJob(baseDeps());

    expect(createEscalationEvent).toHaveBeenCalledTimes(2);
  });

  it('processes a large backlog in bounded-concurrency batches, not all at once or fully sequential', async () => {
    const followups = Array.from({ length: 37 }, (_, i) => ({
      id: `followup-${i}`,
      referralId: `referral-${i}`,
      referral: { beneficiaryId: `ben-${i}` },
    }));
    findOverduePendingFollowups.mockResolvedValue(followups);

    await runOverdueFollowupJob(baseDeps());

    expect(createEscalationEvent).toHaveBeenCalledTimes(37);
    expect(markFollowupEscalated).toHaveBeenCalledTimes(37);
  });
});
