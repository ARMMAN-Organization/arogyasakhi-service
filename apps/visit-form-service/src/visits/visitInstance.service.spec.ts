import { VisitInstanceService } from './visitInstance.service';
import type { VisitInstanceRepository } from './visitInstance.repository';
import type { CreateVisitInstanceInput } from './dto/create-visitInstance.dto';
import type { ListVisitInstancesQuery } from './dto/list-visit-instances.dto';
import { findSakhiById, listSakhiIdsForSupervisor } from '../sakhis/sakhi.client';
import { resolveVisitStatusCode, resolveVisitStatusCodes } from '../lookups/lookup.client';

jest.mock('../sakhis/sakhi.client');
jest.mock('../lookups/lookup.client');

describe('VisitInstanceService', () => {
  const repository = {
    findMany: jest.fn(),
    findById: jest.fn(),
    findByLocalVisitUuid: jest.fn(),
    findScheduleById: jest.fn(),
    create: jest.fn(),
    updateStatus: jest.fn(),
    countByStatus: jest.fn(),
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

  describe('list', () => {
    const baseQuery: ListVisitInstancesQuery = { limit: 50 };

    it('forces a SAKHI caller to her own sakhiId, ignoring any sakhiId param', async () => {
      repository.findMany.mockResolvedValue({ items: [], nextCursor: null });

      await service.list(
        { ...baseQuery, sakhiId: 'someone-else' },
        { id: 'sakhi-1', roles: ['SAKHI'] },
        AUTH_HEADER,
      );

      expect(repository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ sakhiId: 'sakhi-1' }),
      );
    });

    it('scopes a SUPERVISOR with no sakhiId param to her full roster', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a', 'sakhi-b']);
      repository.findMany.mockResolvedValue({ items: [], nextCursor: null });

      await service.list(
        baseQuery,
        { id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: 'p1' },
        AUTH_HEADER,
      );

      expect(repository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ sakhiIds: ['sakhi-a', 'sakhi-b'] }),
      );
    });

    it('scopes a SUPERVISOR with a valid sakhiId param to that one Sakhi', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a', 'sakhi-b']);
      repository.findMany.mockResolvedValue({ items: [], nextCursor: null });

      await service.list(
        { ...baseQuery, sakhiId: 'sakhi-a' },
        { id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: 'p1' },
        AUTH_HEADER,
      );

      expect(repository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ sakhiId: 'sakhi-a' }),
      );
    });

    it('rejects a SUPERVISOR whose sakhiId param is not in her roster', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a']);

      await expect(
        service.list(
          { ...baseQuery, sakhiId: 'sakhi-z' },
          { id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: 'p1' },
          AUTH_HEADER,
        ),
      ).rejects.toThrow("sakhiId is not in this Supervisor's roster.");
      expect(repository.findMany).not.toHaveBeenCalled();
    });

    it('rejects a SUPERVISOR caller with no project scope', async () => {
      await expect(
        service.list(
          baseQuery,
          { id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: null },
          AUTH_HEADER,
        ),
      ).rejects.toThrow('Supervisor caller has no project scope.');
      expect(repository.findMany).not.toHaveBeenCalled();
    });

    it('leaves a MANAGER caller fully unscoped when no sakhiId is given', async () => {
      repository.findMany.mockResolvedValue({ items: [], nextCursor: null });

      await service.list(baseQuery, { id: 'manager-1', roles: ['MANAGER'] }, AUTH_HEADER);

      expect(repository.findMany).toHaveBeenCalledWith(
        expect.not.objectContaining({ sakhiId: expect.anything(), sakhiIds: expect.anything() }),
      );
    });

    it('lets a MANAGER caller narrow to one sakhiId', async () => {
      repository.findMany.mockResolvedValue({ items: [], nextCursor: null });

      await service.list(
        { ...baseQuery, sakhiId: 'sakhi-x' },
        { id: 'manager-1', roles: ['MANAGER'] },
        AUTH_HEADER,
      );

      expect(repository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ sakhiId: 'sakhi-x' }),
      );
    });

    it('passes beneficiaryId/statusLookupValueId/updatedAfter/cursor/limit through to the repository', async () => {
      repository.findMany.mockResolvedValue({ items: [], nextCursor: null });

      await service.list(
        {
          beneficiaryId: 'ben-1',
          statusLookupValueId: 'status-1',
          updatedAfter: '2026-08-01T00:00:00.000Z',
          cursor: 'abc',
          limit: 20,
        },
        { id: 'manager-1', roles: ['MANAGER'] },
        AUTH_HEADER,
      );

      expect(repository.findMany).toHaveBeenCalledWith({
        beneficiaryId: 'ben-1',
        sakhiId: undefined,
        sakhiIds: undefined,
        statusLookupValueId: 'status-1',
        updatedAfter: '2026-08-01T00:00:00.000Z',
        cursor: 'abc',
        limit: 20,
      });
    });

    it('returns the repository page unchanged', async () => {
      const page = { items: [sampleRow], nextCursor: 'next-cursor' };
      repository.findMany.mockResolvedValue(page as never);

      await expect(
        service.list(baseQuery, { id: 'manager-1', roles: ['MANAGER'] }, AUTH_HEADER),
      ).resolves.toBe(page);
    });
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

      const result = await service.getVisitSummary(
        {},
        { id: SAKHI_ID, roles: ['SAKHI'] },
        AUTH_HEADER,
      );

      expect(repository.countByStatus).toHaveBeenCalledWith(
        expect.objectContaining({ sakhiId: SAKHI_ID }),
      );
      expect(result).toEqual({ total: 3, byStatus: { COMPLETED: 3 } });
    });

    it('scopes a SUPERVISOR caller to their roster', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a', 'sakhi-b']);
      repository.countByStatus.mockResolvedValue([]);
      resolveVisitStatusCodesMock.mockResolvedValue(new Map());

      await service.getVisitSummary(
        {},
        { id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: 'p1' },
        AUTH_HEADER,
      );

      expect(repository.countByStatus).toHaveBeenCalledWith(
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

      const result = await service.getVisitSummary(
        {},
        { id: SAKHI_ID, roles: ['SAKHI'] },
        AUTH_HEADER,
      );

      expect(result).toEqual({ total: 0, byStatus: {} });
    });
  });
});
