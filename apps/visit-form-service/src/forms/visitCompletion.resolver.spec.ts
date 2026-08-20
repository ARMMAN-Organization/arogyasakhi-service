import { resolveVisitCompletion } from './visitCompletion.resolver';
import type { VisitInstanceRepository } from '../visits/visitInstance.repository';
import { resolveVisitStatusCodes } from '../lookups/lookup.client';

jest.mock('../lookups/lookup.client');

describe('resolveVisitCompletion', () => {
  const AUTH_HEADER = 'Bearer test-token';
  const COMPLETED_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const PENDING_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  const repository = {
    findById: jest.fn(),
    updateStatus: jest.fn(),
  } as unknown as jest.Mocked<VisitInstanceRepository>;

  const resolveVisitStatusCodesMock = jest.mocked(resolveVisitStatusCodes);

  beforeEach(() => {
    jest.resetAllMocks();
    resolveVisitStatusCodesMock.mockResolvedValue(new Map([[COMPLETED_ID, 'COMPLETED']]));
  });

  it('marks the visit COMPLETED when a vitals-bearing visit form is submitted', async () => {
    repository.findById.mockResolvedValue({
      id: 'visit-1',
      statusLookupValueId: PENDING_ID,
      completedAt: null,
      actualVisitDate: null,
      meetBeneficiaryFlag: null,
      notMetReason: null,
    } as never);

    await resolveVisitCompletion('ANC_VISIT', 'visit-1', 'sakhi-1', repository, AUTH_HEADER);

    expect(repository.updateStatus).toHaveBeenCalledWith(
      'visit-1',
      PENDING_ID,
      expect.objectContaining({ statusLookupValueId: COMPLETED_ID, completedAt: expect.any(Date) }),
      'sakhi-1',
    );
  });

  it.each(['POSTPARTUM_VISIT', 'NEONATAL_VISIT', 'INC_VISIT', 'CCV_VISIT'])(
    'marks the visit COMPLETED for %s submissions too',
    async (formCode) => {
      repository.findById.mockResolvedValue({
        id: 'visit-1',
        statusLookupValueId: PENDING_ID,
        completedAt: null,
        actualVisitDate: null,
        meetBeneficiaryFlag: null,
        notMetReason: null,
      } as never);

      await resolveVisitCompletion(formCode, 'visit-1', 'sakhi-1', repository, AUTH_HEADER);

      expect(repository.updateStatus).toHaveBeenCalledTimes(1);
    },
  );

  it('does nothing when the submission has no visitId (one-time form)', async () => {
    await resolveVisitCompletion(
      'MOTHER_REGISTRATION',
      undefined,
      'sakhi-1',
      repository,
      AUTH_HEADER,
    );

    expect(repository.findById).not.toHaveBeenCalled();
    expect(repository.updateStatus).not.toHaveBeenCalled();
  });

  it('does nothing for a visit-linked submission whose formCode does not complete a visit', async () => {
    await resolveVisitCompletion(
      'ANC_CLOSURE_VISIT',
      'visit-1',
      'sakhi-1',
      repository,
      AUTH_HEADER,
    );

    expect(repository.findById).not.toHaveBeenCalled();
    expect(repository.updateStatus).not.toHaveBeenCalled();
  });

  it('is a silent no-op when the visit is already COMPLETED', async () => {
    repository.findById.mockResolvedValue({
      id: 'visit-1',
      statusLookupValueId: COMPLETED_ID,
      completedAt: new Date('2026-08-01T00:00:00.000Z'),
      actualVisitDate: new Date('2026-08-01T00:00:00.000Z'),
      meetBeneficiaryFlag: true,
      notMetReason: null,
    } as never);

    await expect(
      resolveVisitCompletion('ANC_VISIT', 'visit-1', 'sakhi-1', repository, AUTH_HEADER),
    ).resolves.toBeUndefined();

    expect(repository.updateStatus).not.toHaveBeenCalled();
  });

  it('never throws when the completion write fails — the submission must still succeed', async () => {
    repository.findById.mockResolvedValue({
      id: 'visit-1',
      statusLookupValueId: PENDING_ID,
      completedAt: null,
      actualVisitDate: null,
      meetBeneficiaryFlag: null,
      notMetReason: null,
    } as never);
    repository.updateStatus.mockRejectedValue(new Error('db unavailable'));

    await expect(
      resolveVisitCompletion('ANC_VISIT', 'visit-1', 'sakhi-1', repository, AUTH_HEADER),
    ).resolves.toBeUndefined();
  });

  it('never throws when the visit lookup itself fails', async () => {
    repository.findById.mockRejectedValue(new Error('db unavailable'));

    await expect(
      resolveVisitCompletion('ANC_VISIT', 'visit-1', 'sakhi-1', repository, AUTH_HEADER),
    ).resolves.toBeUndefined();
  });

  it('is a no-op when the visit no longer exists', async () => {
    repository.findById.mockResolvedValue(null);

    await resolveVisitCompletion('ANC_VISIT', 'visit-1', 'sakhi-1', repository, AUTH_HEADER);

    expect(repository.updateStatus).not.toHaveBeenCalled();
  });

  it('warns and skips when the VISIT_STATUS lookup category has no COMPLETED value', async () => {
    resolveVisitStatusCodesMock.mockResolvedValue(new Map([[PENDING_ID, 'PENDING']]));
    repository.findById.mockResolvedValue({
      id: 'visit-1',
      statusLookupValueId: PENDING_ID,
      completedAt: null,
      actualVisitDate: null,
      meetBeneficiaryFlag: null,
      notMetReason: null,
    } as never);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await resolveVisitCompletion('ANC_VISIT', 'visit-1', 'sakhi-1', repository, AUTH_HEADER);

    expect(repository.updateStatus).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no COMPLETED value'));
    warnSpy.mockRestore();
  });
});
