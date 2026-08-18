import { VisitInstanceService } from './visitInstance.service';
import type { VisitInstanceRepository } from './visitInstance.repository';
import type { CreateVisitInstanceInput } from './dto/create-visitInstance.dto';
import { findSakhiById, listSakhiIdsForSupervisor } from '../sakhis/sakhi.client';
import { resolveVisitStatusCode, resolveVisitStatusCodes } from '../lookups/lookup.client';

jest.mock('../sakhis/sakhi.client');
jest.mock('../lookups/lookup.client');

describe('VisitInstanceService', () => {
  const repository = {
    findMany: jest.fn(),
    findManyByBeneficiaryId: jest.fn(),
    findById: jest.fn(),
    findByLocalVisitUuid: jest.fn(),
    findScheduleById: jest.fn(),
    create: jest.fn(),
    updateStatus: jest.fn(),
    countByStatus: jest.fn(),
    countEndingSoon: jest.fn(),
    countDueTodayByBeneficiary: jest.fn(),
    findByPada: jest.fn(),
    countByBeneficiary: jest.fn(),
  } as unknown as jest.Mocked<VisitInstanceRepository>;
  let service: VisitInstanceService;

  const AUTH_HEADER = 'Bearer test-token';
  const findSakhiByIdMock = jest.mocked(findSakhiById);
  const listSakhiIdsForSupervisorMock = jest.mocked(listSakhiIdsForSupervisor);
  const resolveVisitStatusCodeMock = jest.mocked(resolveVisitStatusCode);
  const resolveVisitStatusCodesMock = jest.mocked(resolveVisitStatusCodes);

  // Distinct from sampleRow.statusLookupValueId ('aaaaaaaa-...') below, so
  // "transitioning to COMPLETED" tests aren't accidentally a no-op re-completion.
  const COMPLETED_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const MISSED_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

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

  describe('listByBeneficiaryId', () => {
    it('returns the repository result for a beneficiary with visit history', async () => {
      const rows = [sampleRow];
      repository.findManyByBeneficiaryId.mockResolvedValue(rows);

      await expect(service.listByBeneficiaryId(sampleRow.beneficiaryId)).resolves.toBe(rows);
      expect(repository.findManyByBeneficiaryId).toHaveBeenCalledWith(sampleRow.beneficiaryId);
    });

    it('returns an empty array for a beneficiary with no visits', async () => {
      repository.findManyByBeneficiaryId.mockResolvedValue([]);

      await expect(
        service.listByBeneficiaryId('99999999-9999-9999-9999-999999999999'),
      ).resolves.toEqual([]);
    });
  });

  const dto: CreateVisitInstanceInput = {
    scheduleId: '11111111-1111-1111-1111-111111111111',
    beneficiaryId: '22222222-2222-2222-2222-222222222222',
    sakhiId: '33333333-3333-3333-3333-333333333333',
    localVisitUuid: 'local-visit-1',
    statusLookupValueId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  };

  it('creates via repository when the schedule resolves and no row exists for this localVisitUuid', async () => {
    repository.findByLocalVisitUuid.mockResolvedValue(null);
    repository.findScheduleById.mockResolvedValue({ id: dto.scheduleId } as never);
    const created = sampleRow;
    repository.create.mockResolvedValue(created);

    await expect(service.create(dto)).resolves.toBe(created);
    expect(repository.create).toHaveBeenCalledWith(dto);
  });

  it('returns the existing row unchanged on a replayed localVisitUuid, without calling create', async () => {
    repository.findByLocalVisitUuid.mockResolvedValue(sampleRow);

    await expect(service.create(dto)).resolves.toBe(sampleRow);
    expect(repository.findScheduleById).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects with a typed 422 when scheduleId does not resolve, without calling create', async () => {
    repository.findByLocalVisitUuid.mockResolvedValue(null);
    repository.findScheduleById.mockResolvedValue(null);

    await expect(service.create(dto)).rejects.toMatchObject({ status: 422 });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('propagates repository errors on create', async () => {
    repository.findByLocalVisitUuid.mockResolvedValue(null);
    repository.findScheduleById.mockResolvedValue({ id: dto.scheduleId } as never);
    repository.create.mockRejectedValue(new Error('db down'));

    await expect(service.create(dto)).rejects.toThrow('db down');
  });

  describe('updateStatus', () => {
    const SAKHI_ID = sampleRow.sakhiId;

    it('404s when the visit does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.updateStatus(
          'unknown-id',
          { statusLookupValueId: COMPLETED_ID },
          { id: SAKHI_ID, roles: ['SAKHI'] },
          AUTH_HEADER,
        ),
      ).rejects.toThrow('Visit instance not found.');
    });

    it('403s when a SAKHI targets a visit that is not their own', async () => {
      repository.findById.mockResolvedValue(sampleRow);

      await expect(
        service.updateStatus(
          sampleRow.id,
          { statusLookupValueId: COMPLETED_ID },
          { id: 'someone-else', roles: ['SAKHI'] },
          AUTH_HEADER,
        ),
      ).rejects.toThrow('You do not have access to this visit.');
    });

    it('403s when a SUPERVISOR targets a visit whose Sakhi is not assigned to them', async () => {
      repository.findById.mockResolvedValue(sampleRow);
      findSakhiByIdMock.mockResolvedValue({
        sakhiId: SAKHI_ID,
        supervisorId: 'someone-else',
        primaryProjectId: 'p1',
      });

      await expect(
        service.updateStatus(
          sampleRow.id,
          { statusLookupValueId: COMPLETED_ID },
          { id: 'supervisor-1', roles: ['SUPERVISOR'] },
          AUTH_HEADER,
        ),
      ).rejects.toThrow('You do not have access to this visit.');
    });

    it('allows a SUPERVISOR to update a visit whose Sakhi is assigned to them', async () => {
      repository.findById.mockResolvedValue(sampleRow);
      findSakhiByIdMock.mockResolvedValue({
        sakhiId: SAKHI_ID,
        supervisorId: 'supervisor-1',
        primaryProjectId: 'p1',
      });
      // sampleRow's existing status (a different id) resolves to a code
      // distinct from COMPLETED so this isn't misread as a re-completion.
      resolveVisitStatusCodeMock.mockImplementation((id) =>
        Promise.resolve(id === COMPLETED_ID ? 'COMPLETED' : 'PENDING'),
      );
      repository.updateStatus.mockResolvedValue(true);

      await service.updateStatus(
        sampleRow.id,
        { statusLookupValueId: COMPLETED_ID },
        { id: 'supervisor-1', roles: ['SUPERVISOR'] },
        AUTH_HEADER,
      );

      expect(repository.updateStatus).toHaveBeenCalled();
    });

    it('sets completedAt when the new status resolves to COMPLETED', async () => {
      repository.findById.mockResolvedValueOnce(sampleRow).mockResolvedValueOnce(sampleRow);
      resolveVisitStatusCodeMock.mockImplementation((id) =>
        Promise.resolve(id === COMPLETED_ID ? 'COMPLETED' : 'PENDING'),
      );
      repository.updateStatus.mockResolvedValue(true);

      await service.updateStatus(
        sampleRow.id,
        { statusLookupValueId: COMPLETED_ID },
        { id: SAKHI_ID, roles: ['SAKHI'] },
        AUTH_HEADER,
      );

      expect(repository.updateStatus).toHaveBeenCalledWith(
        sampleRow.id,
        sampleRow.statusLookupValueId,
        expect.objectContaining({ completedAt: expect.any(Date) }),
        SAKHI_ID,
      );
    });

    it('leaves completedAt null when the new status resolves to MISSED', async () => {
      repository.findById.mockResolvedValue(sampleRow);
      resolveVisitStatusCodeMock.mockResolvedValue('MISSED');
      repository.updateStatus.mockResolvedValue(true);

      await service.updateStatus(
        sampleRow.id,
        { statusLookupValueId: MISSED_ID },
        { id: SAKHI_ID, roles: ['SAKHI'] },
        AUTH_HEADER,
      );

      expect(repository.updateStatus).toHaveBeenCalledWith(
        sampleRow.id,
        sampleRow.statusLookupValueId,
        expect.objectContaining({ completedAt: null }),
        SAKHI_ID,
      );
    });

    it('409s when re-completing an already-COMPLETED visit', async () => {
      const completedRow = { ...sampleRow, statusLookupValueId: COMPLETED_ID };
      repository.findById.mockResolvedValue(completedRow);
      resolveVisitStatusCodeMock.mockResolvedValue('COMPLETED');

      await expect(
        service.updateStatus(
          sampleRow.id,
          { statusLookupValueId: COMPLETED_ID },
          { id: SAKHI_ID, roles: ['SAKHI'] },
          AUTH_HEADER,
        ),
      ).rejects.toThrow('This visit is already COMPLETED.');
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('409s when the conditional update races with a concurrent status change', async () => {
      repository.findById.mockResolvedValue(sampleRow);
      resolveVisitStatusCodeMock.mockImplementation((id) =>
        Promise.resolve(id === COMPLETED_ID ? 'COMPLETED' : 'PENDING'),
      );
      repository.updateStatus.mockResolvedValue(false);

      await expect(
        service.updateStatus(
          sampleRow.id,
          { statusLookupValueId: COMPLETED_ID },
          { id: SAKHI_ID, roles: ['SAKHI'] },
          AUTH_HEADER,
        ),
      ).rejects.toThrow('This visit was already updated by another request.');
    });

    it('MANAGER/ADMIN callers bypass the ownership check entirely', async () => {
      repository.findById.mockResolvedValue(sampleRow);
      resolveVisitStatusCodeMock.mockImplementation((id) =>
        Promise.resolve(id === COMPLETED_ID ? 'COMPLETED' : 'PENDING'),
      );
      repository.updateStatus.mockResolvedValue(true);

      await service.updateStatus(
        sampleRow.id,
        { statusLookupValueId: COMPLETED_ID },
        { id: 'manager-1', roles: ['MANAGER'] },
        AUTH_HEADER,
      );

      expect(findSakhiByIdMock).not.toHaveBeenCalled();
      expect(repository.updateStatus).toHaveBeenCalled();
    });
  });

  describe('getVisitSummary', () => {
    const SAKHI_ID = 'sakhi-1';

    it('scopes a SAKHI caller to their own visits', async () => {
      repository.countByStatus.mockResolvedValue([
        { statusLookupValueId: COMPLETED_ID, _count: { _all: 3 } },
      ]);
      resolveVisitStatusCodesMock.mockResolvedValue(new Map([[COMPLETED_ID, 'COMPLETED']]));
      repository.countEndingSoon.mockResolvedValue(0);

      const result = await service.getVisitSummary(
        {},
        { id: SAKHI_ID, roles: ['SAKHI'] },
        AUTH_HEADER,
      );

      expect(repository.countByStatus).toHaveBeenCalledWith(
        expect.objectContaining({ sakhiId: SAKHI_ID }),
      );
      expect(repository.countEndingSoon).toHaveBeenCalledWith(
        expect.objectContaining({ sakhiId: SAKHI_ID }),
      );
      expect(result).toEqual({ total: 3, byStatus: { COMPLETED: 3 }, endingSoonVisitsCount: 0 });
    });

    it('scopes a SUPERVISOR caller to their roster', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a', 'sakhi-b']);
      repository.countByStatus.mockResolvedValue([]);
      resolveVisitStatusCodesMock.mockResolvedValue(new Map());
      repository.countEndingSoon.mockResolvedValue(0);

      await service.getVisitSummary(
        {},
        { id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: 'p1' },
        AUTH_HEADER,
      );

      expect(repository.countByStatus).toHaveBeenCalledWith(
        expect.objectContaining({ sakhiIds: ['sakhi-a', 'sakhi-b'] }),
      );
      expect(repository.countEndingSoon).toHaveBeenCalledWith(
        expect.objectContaining({ sakhiIds: ['sakhi-a', 'sakhi-b'] }),
      );
    });

    it('rejects a SUPERVISOR caller with no project scope', async () => {
      await expect(
        service.getVisitSummary(
          {},
          { id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: null },
          AUTH_HEADER,
        ),
      ).rejects.toThrow('Supervisor caller has no project scope.');
    });

    it('leaves a MANAGER caller unscoped', async () => {
      repository.countByStatus.mockResolvedValue([]);
      resolveVisitStatusCodesMock.mockResolvedValue(new Map());
      repository.countEndingSoon.mockResolvedValue(0);

      await service.getVisitSummary({}, { id: 'manager-1', roles: ['MANAGER'] }, AUTH_HEADER);

      expect(repository.countByStatus).toHaveBeenCalledWith(
        expect.not.objectContaining({ sakhiId: expect.anything() }),
      );
    });

    it('rejects fromDate after toDate', async () => {
      await expect(
        service.getVisitSummary(
          { fromDate: '2026-02-01', toDate: '2026-01-01' },
          { id: SAKHI_ID, roles: ['SAKHI'] },
          AUTH_HEADER,
        ),
      ).rejects.toThrow('fromDate must be on or before toDate.');
    });

    it('returns all-zero counts when no visits are in scope', async () => {
      repository.countByStatus.mockResolvedValue([]);
      resolveVisitStatusCodesMock.mockResolvedValue(new Map());
      repository.countEndingSoon.mockResolvedValue(0);

      const result = await service.getVisitSummary(
        {},
        { id: SAKHI_ID, roles: ['SAKHI'] },
        AUTH_HEADER,
      );

      expect(result).toEqual({ total: 0, byStatus: {}, endingSoonVisitsCount: 0 });
    });

    it('resolves endingSoonVisitsCount from the repository, restricted to PENDING/MISSED lookup ids', async () => {
      const PENDING_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
      repository.countByStatus.mockResolvedValue([
        { statusLookupValueId: PENDING_ID, _count: { _all: 2 } },
      ]);
      resolveVisitStatusCodesMock.mockResolvedValue(
        new Map([
          [PENDING_ID, 'PENDING'],
          [MISSED_ID, 'MISSED'],
          [COMPLETED_ID, 'COMPLETED'],
        ]),
      );
      repository.countEndingSoon.mockResolvedValue(1);

      const result = await service.getVisitSummary(
        {},
        { id: SAKHI_ID, roles: ['SAKHI'] },
        AUTH_HEADER,
      );

      expect(repository.countEndingSoon).toHaveBeenCalledWith(
        expect.objectContaining({
          dueOrOverdueStatusLookupValueIds: expect.arrayContaining([PENDING_ID, MISSED_ID]),
        }),
      );
      const [call] = repository.countEndingSoon.mock.calls;
      expect(call[0].dueOrOverdueStatusLookupValueIds).not.toContain(COMPLETED_ID);
      expect(result.endingSoonVisitsCount).toBe(1);
    });
  });

  describe('getCountByBeneficiary', () => {
    const PENDING_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const SAKHI_CALLER = { id: 'sakhi-1', roles: ['SAKHI'] };

    it('groups due (PENDING) and overdue (MISSED) counts per beneficiaryId, dueTodayCount 0 by default', async () => {
      repository.countByBeneficiary.mockResolvedValue([
        { beneficiaryId: 'ben-1', statusLookupValueId: PENDING_ID, _count: { _all: 2 } },
        { beneficiaryId: 'ben-1', statusLookupValueId: MISSED_ID, _count: { _all: 1 } },
        { beneficiaryId: 'ben-2', statusLookupValueId: MISSED_ID, _count: { _all: 3 } },
      ]);
      resolveVisitStatusCodesMock.mockResolvedValue(
        new Map([
          [PENDING_ID, 'PENDING'],
          [MISSED_ID, 'MISSED'],
        ]),
      );
      repository.countDueTodayByBeneficiary.mockResolvedValue(new Map());

      const result = await service.getCountByBeneficiary(
        ['ben-1', 'ben-2'],
        SAKHI_CALLER,
        AUTH_HEADER,
      );

      expect(repository.countByBeneficiary).toHaveBeenCalledWith(
        ['ben-1', 'ben-2'],
        expect.objectContaining({ sakhiId: SAKHI_CALLER.id }),
      );
      expect(repository.countDueTodayByBeneficiary).toHaveBeenCalledWith(
        ['ben-1', 'ben-2'],
        expect.arrayContaining([PENDING_ID, MISSED_ID]),
        expect.any(Date),
        expect.objectContaining({ sakhiId: SAKHI_CALLER.id }),
      );
      expect(result).toEqual({
        'ben-1': { dueVisitsCount: 2, overdueVisitsCount: 1, dueTodayCount: 0 },
        'ben-2': { dueVisitsCount: 0, overdueVisitsCount: 3, dueTodayCount: 0 },
      });
    });

    it('merges dueTodayCount into the same per-beneficiary entry as due/overdue', async () => {
      repository.countByBeneficiary.mockResolvedValue([
        { beneficiaryId: 'ben-1', statusLookupValueId: PENDING_ID, _count: { _all: 2 } },
      ]);
      resolveVisitStatusCodesMock.mockResolvedValue(new Map([[PENDING_ID, 'PENDING']]));
      repository.countDueTodayByBeneficiary.mockResolvedValue(new Map([['ben-1', 2]]));

      const result = await service.getCountByBeneficiary(['ben-1'], SAKHI_CALLER, AUTH_HEADER);

      expect(result).toEqual({
        'ben-1': { dueVisitsCount: 2, overdueVisitsCount: 0, dueTodayCount: 2 },
      });
    });

    it('creates a fresh entry for a beneficiary who only has a due-today count (no other due/overdue rows)', async () => {
      repository.countByBeneficiary.mockResolvedValue([]);
      resolveVisitStatusCodesMock.mockResolvedValue(new Map());
      repository.countDueTodayByBeneficiary.mockResolvedValue(new Map([['ben-2', 1]]));

      const result = await service.getCountByBeneficiary(['ben-2'], SAKHI_CALLER, AUTH_HEADER);

      expect(result).toEqual({
        'ben-2': { dueVisitsCount: 0, overdueVisitsCount: 0, dueTodayCount: 1 },
      });
    });

    it('ignores statuses other than PENDING/MISSED (e.g. STARTED, COMPLETED)', async () => {
      const STARTED_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
      repository.countByBeneficiary.mockResolvedValue([
        { beneficiaryId: 'ben-1', statusLookupValueId: STARTED_ID, _count: { _all: 5 } },
        { beneficiaryId: 'ben-1', statusLookupValueId: COMPLETED_ID, _count: { _all: 2 } },
      ]);
      resolveVisitStatusCodesMock.mockResolvedValue(
        new Map([
          [STARTED_ID, 'STARTED'],
          [COMPLETED_ID, 'COMPLETED'],
        ]),
      );
      repository.countDueTodayByBeneficiary.mockResolvedValue(new Map());

      const result = await service.getCountByBeneficiary(['ben-1'], SAKHI_CALLER, AUTH_HEADER);

      expect(result).toEqual({});
    });

    it('returns an empty object for an empty beneficiaryIds list, without erroring', async () => {
      repository.countByBeneficiary.mockResolvedValue([]);
      resolveVisitStatusCodesMock.mockResolvedValue(new Map());
      repository.countDueTodayByBeneficiary.mockResolvedValue(new Map());

      const result = await service.getCountByBeneficiary([], SAKHI_CALLER, AUTH_HEADER);

      expect(repository.countByBeneficiary).toHaveBeenCalledWith(
        [],
        expect.objectContaining({ sakhiId: SAKHI_CALLER.id }),
      );
      expect(result).toEqual({});
    });

    it('a beneficiary with no visits at all is simply absent from the result', async () => {
      repository.countByBeneficiary.mockResolvedValue([]);
      resolveVisitStatusCodesMock.mockResolvedValue(new Map());
      repository.countDueTodayByBeneficiary.mockResolvedValue(new Map());

      const result = await service.getCountByBeneficiary(
        ['ben-with-no-visits'],
        SAKHI_CALLER,
        AUTH_HEADER,
      );

      expect(result).toEqual({});
      expect(result['ben-with-no-visits']).toBeUndefined();
    });

    it('scopes a SAKHI caller to their own id — an out-of-scope beneficiaryId is silently excluded by the repository filter', async () => {
      repository.countByBeneficiary.mockResolvedValue([]);
      resolveVisitStatusCodesMock.mockResolvedValue(new Map());
      repository.countDueTodayByBeneficiary.mockResolvedValue(new Map());

      await service.getCountByBeneficiary(['some-other-sakhis-ben'], SAKHI_CALLER, AUTH_HEADER);

      expect(repository.countByBeneficiary).toHaveBeenCalledWith(['some-other-sakhis-ben'], {
        sakhiId: SAKHI_CALLER.id,
      });
    });

    it('scopes a SUPERVISOR caller to their roster', async () => {
      const SUPERVISOR_CALLER = { id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: 'proj-1' };
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a', 'sakhi-b']);
      repository.countByBeneficiary.mockResolvedValue([]);
      resolveVisitStatusCodesMock.mockResolvedValue(new Map());
      repository.countDueTodayByBeneficiary.mockResolvedValue(new Map());

      await service.getCountByBeneficiary(['ben-1'], SUPERVISOR_CALLER, AUTH_HEADER);

      expect(repository.countByBeneficiary).toHaveBeenCalledWith(['ben-1'], {
        sakhiIds: ['sakhi-a', 'sakhi-b'],
      });
    });

    it('leaves a MANAGER/ADMIN caller unscoped', async () => {
      const MANAGER_CALLER = { id: 'manager-1', roles: ['MANAGER'] };
      repository.countByBeneficiary.mockResolvedValue([]);
      resolveVisitStatusCodesMock.mockResolvedValue(new Map());
      repository.countDueTodayByBeneficiary.mockResolvedValue(new Map());

      await service.getCountByBeneficiary(['ben-1'], MANAGER_CALLER, AUTH_HEADER);

      expect(repository.countByBeneficiary).toHaveBeenCalledWith(['ben-1'], {});
    });
  });

  describe('getByPada', () => {
    const PENDING_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const SAKHI_CALLER = { id: 'sakhi-1', roles: ['SAKHI'] };

    it('maps repository rows to visit cards, formatting visitCode with a space before trailing digits', async () => {
      resolveVisitStatusCodesMock.mockResolvedValue(new Map([[PENDING_ID, 'PENDING']]));
      repository.findByPada.mockResolvedValue([
        {
          id: 'visit-1',
          beneficiaryId: 'ben-1',
          schedule: { visitCode: 'ANC3', scheduledDate: new Date('2026-08-20T00:00:00.000Z') },
        },
      ]);

      const result = await service.getByPada(['ben-1'], '2026-08-20', SAKHI_CALLER, AUTH_HEADER);

      expect(repository.findByPada).toHaveBeenCalledWith(
        ['ben-1'],
        [PENDING_ID],
        new Date('2026-08-20T00:00:00.000Z'),
        expect.objectContaining({ sakhiId: SAKHI_CALLER.id }),
      );
      expect(result).toEqual([
        {
          visitId: 'visit-1',
          beneficiaryId: 'ben-1',
          visitType: 'ANC 3',
          dueDate: '2026-08-20',
        },
      ]);
    });

    it('leaves a visitCode with no trailing digits unchanged', async () => {
      resolveVisitStatusCodesMock.mockResolvedValue(new Map([[PENDING_ID, 'PENDING']]));
      repository.findByPada.mockResolvedValue([
        {
          id: 'visit-1',
          beneficiaryId: 'ben-1',
          schedule: { visitCode: 'DELIVERY', scheduledDate: new Date('2026-08-20T00:00:00.000Z') },
        },
      ]);

      const result = await service.getByPada(['ben-1'], '2026-08-20', SAKHI_CALLER, AUTH_HEADER);

      expect(result[0].visitType).toBe('DELIVERY');
    });

    it('returns 2 separate cards for a beneficiary with 2 due visits that date (not deduped)', async () => {
      resolveVisitStatusCodesMock.mockResolvedValue(new Map([[PENDING_ID, 'PENDING']]));
      repository.findByPada.mockResolvedValue([
        {
          id: 'visit-1',
          beneficiaryId: 'ben-1',
          schedule: { visitCode: 'ANC3', scheduledDate: new Date('2026-08-20T00:00:00.000Z') },
        },
        {
          id: 'visit-2',
          beneficiaryId: 'ben-1',
          schedule: { visitCode: 'ANC4', scheduledDate: new Date('2026-08-20T00:00:00.000Z') },
        },
      ]);

      const result = await service.getByPada(['ben-1'], '2026-08-20', SAKHI_CALLER, AUTH_HEADER);

      expect(result).toHaveLength(2);
    });

    it('returns an empty list for an empty beneficiaryIds list, without erroring', async () => {
      resolveVisitStatusCodesMock.mockResolvedValue(new Map());
      repository.findByPada.mockResolvedValue([]);

      const result = await service.getByPada([], '2026-08-20', SAKHI_CALLER, AUTH_HEADER);

      expect(result).toEqual([]);
    });

    it('scopes a SAKHI caller to their own id — an out-of-scope beneficiaryId is silently excluded by the repository filter', async () => {
      resolveVisitStatusCodesMock.mockResolvedValue(new Map([[PENDING_ID, 'PENDING']]));
      repository.findByPada.mockResolvedValue([]);

      await service.getByPada(['some-other-sakhis-ben'], '2026-08-20', SAKHI_CALLER, AUTH_HEADER);

      expect(repository.findByPada).toHaveBeenCalledWith(
        ['some-other-sakhis-ben'],
        [PENDING_ID],
        new Date('2026-08-20T00:00:00.000Z'),
        { sakhiId: SAKHI_CALLER.id },
      );
    });

    it('scopes a SUPERVISOR caller to their roster', async () => {
      const SUPERVISOR_CALLER = { id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: 'proj-1' };
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a', 'sakhi-b']);
      resolveVisitStatusCodesMock.mockResolvedValue(new Map([[PENDING_ID, 'PENDING']]));
      repository.findByPada.mockResolvedValue([]);

      await service.getByPada(['ben-1'], '2026-08-20', SUPERVISOR_CALLER, AUTH_HEADER);

      expect(repository.findByPada).toHaveBeenCalledWith(
        ['ben-1'],
        [PENDING_ID],
        new Date('2026-08-20T00:00:00.000Z'),
        { sakhiIds: ['sakhi-a', 'sakhi-b'] },
      );
    });

    it('leaves a MANAGER/ADMIN caller unscoped', async () => {
      const MANAGER_CALLER = { id: 'manager-1', roles: ['MANAGER'] };
      resolveVisitStatusCodesMock.mockResolvedValue(new Map([[PENDING_ID, 'PENDING']]));
      repository.findByPada.mockResolvedValue([]);

      await service.getByPada(['ben-1'], '2026-08-20', MANAGER_CALLER, AUTH_HEADER);

      expect(repository.findByPada).toHaveBeenCalledWith(
        ['ben-1'],
        [PENDING_ID],
        new Date('2026-08-20T00:00:00.000Z'),
        {},
      );
    });
  });
});
