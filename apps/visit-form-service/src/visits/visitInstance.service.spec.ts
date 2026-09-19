import { VisitInstanceService } from './visitInstance.service';
import type { VisitInstanceRepository } from './visitInstance.repository';
import type { CreateVisitInstanceInput } from './dto/create-visitInstance.dto';
import { findSakhiById, listSakhiIdsForSupervisor } from '../sakhis/sakhi.client';
import {
  resolveVisitStatusCode,
  resolveVisitStatusCodes,
  resolveVisitStatusIdByCode,
} from '../lookups/lookup.client';
import { getActiveTransferWindow } from '../escalations/escalation.client';
import { findBeneficiaryOwnership, findBeneficiaryById } from '../beneficiaries/beneficiary.client';

jest.mock('../sakhis/sakhi.client');
jest.mock('../lookups/lookup.client');
jest.mock('../escalations/escalation.client');
jest.mock('../beneficiaries/beneficiary.client');

describe('VisitInstanceService', () => {
  const repository = {
    findMany: jest.fn(),
    findManyPaginated: jest.fn(),
    findManyByBeneficiaryId: jest.fn(),
    findById: jest.fn(),
    findByLocalVisitUuid: jest.fn(),
    findByScheduleId: jest.fn(),
    findScheduleById: jest.fn(),
    create: jest.fn(),
    updateStatus: jest.fn(),
    countByStatus: jest.fn(),
    countByCaseType: jest.fn(),
    countByStatusAndCaseType: jest.fn(),
    countCompletedByTypeInWindow: jest.fn(),
    countEndingSoon: jest.fn(),
    countDueTodayByBeneficiary: jest.fn(),
    findByPada: jest.fn(),
    countByBeneficiary: jest.fn(),
    findRecentCompletedVisits: jest.fn(),
    restoreForSakhi: jest.fn(),
    findDeliveryVisit: jest.fn(),
    countCompletedAncVisits: jest.fn(),
    findDuplicateScheduleIds: jest.fn(),
    findNonDeletedByScheduleId: jest.fn(),
    softDeleteMany: jest.fn(),
  } as unknown as jest.Mocked<VisitInstanceRepository>;
  let service: VisitInstanceService;

  const AUTH_HEADER = 'Bearer test-token';
  const findSakhiByIdMock = jest.mocked(findSakhiById);
  const listSakhiIdsForSupervisorMock = jest.mocked(listSakhiIdsForSupervisor);
  const resolveVisitStatusCodeMock = jest.mocked(resolveVisitStatusCode);
  const resolveVisitStatusIdByCodeMock = jest.mocked(resolveVisitStatusIdByCode);
  const resolveVisitStatusCodesMock = jest.mocked(resolveVisitStatusCodes);
  const getActiveTransferWindowMock = jest.mocked(getActiveTransferWindow);
  const findBeneficiaryOwnershipMock = jest.mocked(findBeneficiaryOwnership);
  const findBeneficiaryByIdMock = jest.mocked(findBeneficiaryById);

  // Distinct from sampleRow.statusLookupValueId ('aaaaaaaa-...') below, so
  // "transitioning to COMPLETED" tests aren't accidentally a no-op re-completion.
  const COMPLETED_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const MISSED_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  beforeEach(() => {
    jest.resetAllMocks();
    service = new VisitInstanceService(repository);
  });

  describe('list', () => {
    const SAKHI_ID = 'sakhi-1';
    const EMPTY_PAGE = { items: [], nextCursor: null };

    it('forces a SAKHI caller to her own sakhiId regardless of the query param', async () => {
      repository.findManyPaginated.mockResolvedValue(EMPTY_PAGE);

      await service.list(
        { sakhiId: 'someone-elses-id', limit: 50 },
        { id: SAKHI_ID, roles: ['SAKHI'] },
        AUTH_HEADER,
      );

      expect(repository.findManyPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ sakhiId: SAKHI_ID }),
      );
    });

    it('scopes a SUPERVISOR caller with no query sakhiId to their whole roster', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a', 'sakhi-b']);
      repository.findManyPaginated.mockResolvedValue(EMPTY_PAGE);

      await service.list(
        { limit: 50 },
        { id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: 'p1' },
        AUTH_HEADER,
      );

      expect(repository.findManyPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ sakhiIds: ['sakhi-a', 'sakhi-b'] }),
      );
    });

    it('scopes a SUPERVISOR caller with a query sakhiId on their roster to just that sakhi', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a', 'sakhi-b']);
      repository.findManyPaginated.mockResolvedValue(EMPTY_PAGE);

      await service.list(
        { sakhiId: 'sakhi-a', limit: 50 },
        { id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: 'p1' },
        AUTH_HEADER,
      );

      expect(repository.findManyPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ sakhiId: 'sakhi-a' }),
      );
    });

    it("rejects a SUPERVISOR caller's query sakhiId that is outside their roster", async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a', 'sakhi-b']);

      await expect(
        service.list(
          { sakhiId: 'sakhi-outsider', limit: 50 },
          { id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: 'p1' },
          AUTH_HEADER,
        ),
      ).rejects.toThrow("sakhiId is not in this Supervisor's roster.");
    });

    it('rejects a SUPERVISOR caller with no project scope', async () => {
      await expect(
        service.list(
          { limit: 50 },
          { id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: null },
          AUTH_HEADER,
        ),
      ).rejects.toThrow('Supervisor caller has no project scope.');
    });

    it('scopes a MANAGER/ADMIN caller with a query sakhiId to just that sakhi', async () => {
      repository.findManyPaginated.mockResolvedValue(EMPTY_PAGE);

      await service.list(
        { sakhiId: 'sakhi-a', limit: 50 },
        { id: 'manager-1', roles: ['MANAGER'] },
        AUTH_HEADER,
      );

      expect(repository.findManyPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ sakhiId: 'sakhi-a' }),
      );
    });

    it('leaves a MANAGER/ADMIN caller with no query sakhiId fully unscoped', async () => {
      repository.findManyPaginated.mockResolvedValue(EMPTY_PAGE);

      await service.list({ limit: 50 }, { id: 'manager-1', roles: ['MANAGER'] }, AUTH_HEADER);

      expect(repository.findManyPaginated).toHaveBeenCalledWith(
        expect.not.objectContaining({ sakhiId: expect.anything() }),
      );
      expect(repository.findManyPaginated).toHaveBeenCalledWith(
        expect.not.objectContaining({ sakhiIds: expect.anything() }),
      );
    });

    it('passes cursor and limit through to the repository unchanged', async () => {
      repository.findManyPaginated.mockResolvedValue(EMPTY_PAGE);

      await service.list(
        { cursor: 'opaque-cursor', limit: 25 },
        { id: 'manager-1', roles: ['MANAGER'] },
        AUTH_HEADER,
      );

      expect(repository.findManyPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: 'opaque-cursor', limit: 25 }),
      );
    });

    it('returns the repository page unchanged', async () => {
      const page = { items: [{ id: 'visit-1' }], nextCursor: 'next-cursor' };
      repository.findManyPaginated.mockResolvedValue(page as never);

      const result = await service.list(
        { limit: 50 },
        { id: 'manager-1', roles: ['MANAGER'] },
        AUTH_HEADER,
      );

      expect(result).toBe(page);
    });
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

  describe('getBeneficiaryMisSummary', () => {
    const COMPLETED_STATUS_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    beforeEach(() => {
      resolveVisitStatusIdByCodeMock.mockResolvedValue(COMPLETED_STATUS_ID);
    });

    it('returns completed4PlusAnc: true when the beneficiary has 4 or more COMPLETED ANC-family visits', async () => {
      repository.countCompletedAncVisits.mockResolvedValue(4);

      const result = await service.getBeneficiaryMisSummary(sampleRow.beneficiaryId, AUTH_HEADER);

      expect(resolveVisitStatusIdByCodeMock).toHaveBeenCalledWith('COMPLETED', AUTH_HEADER);
      expect(repository.countCompletedAncVisits).toHaveBeenCalledWith(
        sampleRow.beneficiaryId,
        COMPLETED_STATUS_ID,
      );
      expect(result).toEqual({ completed4PlusAnc: true });
    });

    it('returns completed4PlusAnc: false when the beneficiary has fewer than 4', async () => {
      repository.countCompletedAncVisits.mockResolvedValue(3);

      const result = await service.getBeneficiaryMisSummary(sampleRow.beneficiaryId, AUTH_HEADER);

      expect(result).toEqual({ completed4PlusAnc: false });
    });
  });

  describe('getById', () => {
    it('returns the visit via repository', async () => {
      repository.findById.mockResolvedValue(sampleRow);

      await expect(service.getById(sampleRow.id)).resolves.toBe(sampleRow);
      expect(repository.findById).toHaveBeenCalledWith(sampleRow.id);
    });

    it('404s on an unknown id', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.getById('unknown-id')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('getMisSummary', () => {
    const CHILD_VISIT = { ...sampleRow, actualVisitDate: new Date('2026-06-01') };

    beforeEach(() => {
      repository.findDeliveryVisit.mockResolvedValue(null);
    });

    it('returns ageInDays/ageInMonths derived from actualVisitDate and the beneficiary childDateOfBirth', async () => {
      repository.findById.mockResolvedValue(CHILD_VISIT);
      findBeneficiaryByIdMock.mockResolvedValue({
        id: CHILD_VISIT.beneficiaryId,
        childDateOfBirth: '2026-01-01',
      } as never);

      const result = await service.getMisSummary(CHILD_VISIT.id, AUTH_HEADER);

      // 2026-01-01 -> 2026-06-01 = 151 days = 5 months (floored)
      expect(result).toEqual({ ageInDays: 151, ageInMonths: 5, daysPostDelivery: null });
    });

    it('floors partial months rather than rounding', async () => {
      repository.findById.mockResolvedValue({
        ...sampleRow,
        actualVisitDate: new Date('2026-02-15'),
      });
      findBeneficiaryByIdMock.mockResolvedValue({
        id: sampleRow.beneficiaryId,
        childDateOfBirth: '2026-01-01',
      } as never);

      // 45 days = 1 month 15 days -> floors to 1, not 1.5.
      const result = await service.getMisSummary(sampleRow.id, AUTH_HEADER);

      expect(result.ageInMonths).toBe(1);
    });

    it('returns null for age fields and daysPostDelivery when actualVisitDate is null (visit not yet completed)', async () => {
      repository.findById.mockResolvedValue({ ...sampleRow, actualVisitDate: null });
      findBeneficiaryByIdMock.mockResolvedValue({
        id: sampleRow.beneficiaryId,
        childDateOfBirth: '2026-01-01',
      } as never);

      await expect(service.getMisSummary(sampleRow.id, AUTH_HEADER)).resolves.toEqual({
        ageInDays: null,
        ageInMonths: null,
        daysPostDelivery: null,
      });
      expect(findBeneficiaryByIdMock).not.toHaveBeenCalled();
      expect(repository.findDeliveryVisit).not.toHaveBeenCalled();
    });

    it('returns null age fields for a MOTHER-case visit (no childDateOfBirth)', async () => {
      repository.findById.mockResolvedValue(CHILD_VISIT);
      findBeneficiaryByIdMock.mockResolvedValue({
        id: CHILD_VISIT.beneficiaryId,
        childDateOfBirth: null,
      } as never);

      await expect(service.getMisSummary(CHILD_VISIT.id, AUTH_HEADER)).resolves.toEqual({
        ageInDays: null,
        ageInMonths: null,
        daysPostDelivery: null,
      });
    });

    it('returns null age fields when the beneficiary cannot be resolved, rather than throwing', async () => {
      repository.findById.mockResolvedValue(CHILD_VISIT);
      findBeneficiaryByIdMock.mockResolvedValue(null);

      await expect(service.getMisSummary(CHILD_VISIT.id, AUTH_HEADER)).resolves.toEqual({
        ageInDays: null,
        ageInMonths: null,
        daysPostDelivery: null,
      });
    });

    it('returns null age fields (not negative) when childDateOfBirth is after actualVisitDate', async () => {
      repository.findById.mockResolvedValue({
        ...sampleRow,
        actualVisitDate: new Date('2026-01-01'),
      });
      findBeneficiaryByIdMock.mockResolvedValue({
        id: sampleRow.beneficiaryId,
        childDateOfBirth: '2026-06-01',
      } as never);

      await expect(service.getMisSummary(sampleRow.id, AUTH_HEADER)).resolves.toEqual({
        ageInDays: null,
        ageInMonths: null,
        daysPostDelivery: null,
      });
    });

    it('returns null daysPostDelivery (not negative) when the delivery visit is later than this visit', async () => {
      repository.findById.mockResolvedValue(CHILD_VISIT);
      findBeneficiaryByIdMock.mockResolvedValue({
        id: CHILD_VISIT.beneficiaryId,
        childDateOfBirth: null,
      } as never);
      repository.findDeliveryVisit.mockResolvedValue({
        actualVisitDate: new Date('2026-12-01'),
      } as never);

      const result = await service.getMisSummary(CHILD_VISIT.id, AUTH_HEADER);

      expect(result.daysPostDelivery).toBeNull();
    });

    it('404s on an unknown visit id before calling beneficiary-service at all', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.getMisSummary('unknown-id', AUTH_HEADER)).rejects.toMatchObject({
        status: 404,
      });
      expect(findBeneficiaryByIdMock).not.toHaveBeenCalled();
    });

    it('propagates a beneficiary-service failure (e.g. 502) rather than swallowing it', async () => {
      repository.findById.mockResolvedValue(CHILD_VISIT);
      findBeneficiaryByIdMock.mockRejectedValue(
        Object.assign(new Error('unreachable'), { status: 502 }),
      );

      await expect(service.getMisSummary(CHILD_VISIT.id, AUTH_HEADER)).rejects.toMatchObject({
        status: 502,
      });
    });

    it('returns daysPostDelivery derived from this visit and the beneficiary completed DELIVERY visit', async () => {
      repository.findById.mockResolvedValue(CHILD_VISIT);
      findBeneficiaryByIdMock.mockResolvedValue({
        id: CHILD_VISIT.beneficiaryId,
        childDateOfBirth: null,
      } as never);
      repository.findDeliveryVisit.mockResolvedValue({
        actualVisitDate: new Date('2026-05-01'),
      } as never);

      const result = await service.getMisSummary(CHILD_VISIT.id, AUTH_HEADER);

      // 2026-05-01 -> 2026-06-01 = 31 days.
      expect(result.daysPostDelivery).toBe(31);
      expect(repository.findDeliveryVisit).toHaveBeenCalledWith(CHILD_VISIT.beneficiaryId);
    });

    it('returns null daysPostDelivery when the beneficiary has no completed DELIVERY visit yet', async () => {
      repository.findById.mockResolvedValue(CHILD_VISIT);
      findBeneficiaryByIdMock.mockResolvedValue({
        id: CHILD_VISIT.beneficiaryId,
        childDateOfBirth: null,
      } as never);
      repository.findDeliveryVisit.mockResolvedValue(null);

      const result = await service.getMisSummary(CHILD_VISIT.id, AUTH_HEADER);

      expect(result.daysPostDelivery).toBeNull();
    });
  });

  const dto: CreateVisitInstanceInput = {
    scheduleId: '11111111-1111-1111-1111-111111111111',
    beneficiaryId: '22222222-2222-2222-2222-222222222222',
    sakhiId: '33333333-3333-3333-3333-333333333333',
    localVisitUuid: 'local-visit-1',
    statusLookupValueId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  };

  it('creates via repository when the schedule resolves and no row exists for this localVisitUuid or scheduleId', async () => {
    repository.findByLocalVisitUuid.mockResolvedValue(null);
    repository.findByScheduleId.mockResolvedValue(null);
    repository.findScheduleById.mockResolvedValue({ id: dto.scheduleId } as never);
    const created = sampleRow;
    repository.create.mockResolvedValue(created);

    await expect(service.create(dto)).resolves.toBe(created);
    expect(repository.create).toHaveBeenCalledWith(dto);
  });

  it('returns the existing row unchanged on a replayed localVisitUuid, without calling create', async () => {
    repository.findByLocalVisitUuid.mockResolvedValue(sampleRow);

    await expect(service.create(dto)).resolves.toBe(sampleRow);
    expect(repository.findByScheduleId).not.toHaveBeenCalled();
    expect(repository.findScheduleById).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('returns the existing row for the scheduleId on a retry with a fresh localVisitUuid, without calling create', async () => {
    repository.findByLocalVisitUuid.mockResolvedValue(null);
    repository.findByScheduleId.mockResolvedValue(sampleRow);

    await expect(service.create(dto)).resolves.toBe(sampleRow);
    expect(repository.findByScheduleId).toHaveBeenCalledWith(dto.scheduleId);
    expect(repository.findScheduleById).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects with a typed 422 when scheduleId does not resolve, without calling create', async () => {
    repository.findByLocalVisitUuid.mockResolvedValue(null);
    repository.findByScheduleId.mockResolvedValue(null);
    repository.findScheduleById.mockResolvedValue(null);

    await expect(service.create(dto)).rejects.toMatchObject({ status: 422 });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('propagates repository errors on create', async () => {
    repository.findByLocalVisitUuid.mockResolvedValue(null);
    repository.findByScheduleId.mockResolvedValue(null);
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

    it('sets isDeleted/deletedAt when the new status resolves to DISCARDED', async () => {
      const DISCARDED_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
      repository.findById.mockResolvedValue(sampleRow);
      resolveVisitStatusCodeMock.mockImplementation((id) =>
        Promise.resolve(id === DISCARDED_ID ? 'DISCARDED' : 'PENDING'),
      );
      repository.updateStatus.mockResolvedValue(true);

      await service.updateStatus(
        sampleRow.id,
        { statusLookupValueId: DISCARDED_ID },
        { id: SAKHI_ID, roles: ['SAKHI'] },
        AUTH_HEADER,
      );

      expect(repository.updateStatus).toHaveBeenCalledWith(
        sampleRow.id,
        sampleRow.statusLookupValueId,
        expect.objectContaining({ isDeleted: true, deletedAt: expect.any(Date) }),
        SAKHI_ID,
      );
    });

    it('does not set isDeleted/deletedAt for a non-DISCARDED transition (regression guard)', async () => {
      repository.findById.mockResolvedValue(sampleRow);
      resolveVisitStatusCodeMock.mockResolvedValue('MISSED');
      repository.updateStatus.mockResolvedValue(true);

      await service.updateStatus(
        sampleRow.id,
        { statusLookupValueId: MISSED_ID },
        { id: SAKHI_ID, roles: ['SAKHI'] },
        AUTH_HEADER,
      );

      const [call] = repository.updateStatus.mock.calls;
      expect(call[2]).not.toHaveProperty('isDeleted');
      expect(call[2]).not.toHaveProperty('deletedAt');
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

    describe('Missed Visit Escalation TRANSFER review window (FR-SV-4.3)', () => {
      let consoleErrorSpy: jest.SpyInstance;

      beforeEach(() => {
        resolveVisitStatusCodeMock.mockImplementation((id) =>
          Promise.resolve(id === MISSED_ID ? 'MISSED' : 'PENDING'),
        );
        repository.updateStatus.mockResolvedValue(true);
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      });

      afterEach(() => {
        consoleErrorSpy.mockRestore();
      });

      it('403s a SAKHI setting notMetReason on a MISSED visit during an active transfer window', async () => {
        repository.findById.mockResolvedValue(sampleRow);
        getActiveTransferWindowMock.mockResolvedValue({
          active: true,
          reviewDeadlineAt: '2027-01-01T00:00:00.000Z',
        });

        await expect(
          service.updateStatus(
            sampleRow.id,
            { statusLookupValueId: MISSED_ID, notMetReason: 'Beneficiary not home' },
            { id: SAKHI_ID, roles: ['SAKHI'] },
            AUTH_HEADER,
          ),
        ).rejects.toThrow(
          'Only a Supervisor may record a missed-visit reason while this beneficiary is under Manager review.',
        );
        expect(getActiveTransferWindowMock).toHaveBeenCalledWith(
          sampleRow.beneficiaryId,
          AUTH_HEADER,
        );
        expect(repository.updateStatus).not.toHaveBeenCalled();
      });

      it('allows a SAKHI to set notMetReason when there is no active transfer window', async () => {
        repository.findById.mockResolvedValue(sampleRow);
        getActiveTransferWindowMock.mockResolvedValue({ active: false, reviewDeadlineAt: null });

        await service.updateStatus(
          sampleRow.id,
          { statusLookupValueId: MISSED_ID, notMetReason: 'Beneficiary not home' },
          { id: SAKHI_ID, roles: ['SAKHI'] },
          AUTH_HEADER,
        );

        expect(repository.updateStatus).toHaveBeenCalled();
      });

      it('allows a SUPERVISOR to set notMetReason during an active transfer window, without even checking', async () => {
        repository.findById.mockResolvedValue(sampleRow);
        findSakhiByIdMock.mockResolvedValue({
          sakhiId: SAKHI_ID,
          supervisorId: 'supervisor-1',
          primaryProjectId: 'p1',
        });

        await service.updateStatus(
          sampleRow.id,
          { statusLookupValueId: MISSED_ID, notMetReason: 'Beneficiary not home' },
          { id: 'supervisor-1', roles: ['SUPERVISOR'] },
          AUTH_HEADER,
        );

        expect(getActiveTransferWindowMock).not.toHaveBeenCalled();
        expect(repository.updateStatus).toHaveBeenCalled();
      });

      it('does not check the transfer window when notMetReason is not being set', async () => {
        repository.findById.mockResolvedValue(sampleRow);

        await service.updateStatus(
          sampleRow.id,
          { statusLookupValueId: MISSED_ID },
          { id: SAKHI_ID, roles: ['SAKHI'] },
          AUTH_HEADER,
        );

        expect(getActiveTransferWindowMock).not.toHaveBeenCalled();
        expect(repository.updateStatus).toHaveBeenCalled();
      });

      it('fails open (allows the write) when the transfer-window check itself fails', async () => {
        repository.findById.mockResolvedValue(sampleRow);
        getActiveTransferWindowMock.mockRejectedValue(
          new Error('notification-escalation-service down'),
        );

        await service.updateStatus(
          sampleRow.id,
          { statusLookupValueId: MISSED_ID, notMetReason: 'Beneficiary not home' },
          { id: SAKHI_ID, roles: ['SAKHI'] },
          AUTH_HEADER,
        );

        expect(repository.updateStatus).toHaveBeenCalled();
        expect(consoleErrorSpy).toHaveBeenCalled();
      });
    });
  });

  describe('getVisitSummary', () => {
    const SAKHI_ID = 'sakhi-1';

    it('scopes a SAKHI caller to their own visits', async () => {
      repository.countByStatus.mockResolvedValue([
        { statusLookupValueId: COMPLETED_ID, _count: { _all: 3 } },
      ]);
      resolveVisitStatusCodesMock.mockResolvedValue(new Map([[COMPLETED_ID, 'COMPLETED']]));
      repository.countByCaseType.mockResolvedValue([]);
      repository.countByStatusAndCaseType.mockResolvedValue([]);
      repository.countEndingSoon.mockResolvedValue(0);

      const result = await service.getVisitSummary(
        {},
        { id: SAKHI_ID, roles: ['SAKHI'] },
        AUTH_HEADER,
      );

      expect(repository.countByStatus).toHaveBeenCalledWith(
        expect.objectContaining({ sakhiId: SAKHI_ID }),
      );
      expect(repository.countByCaseType).toHaveBeenCalledWith(
        expect.objectContaining({ sakhiId: SAKHI_ID }),
      );
      expect(repository.countByStatusAndCaseType).toHaveBeenCalledWith(
        expect.objectContaining({ sakhiId: SAKHI_ID }),
      );
      expect(repository.countEndingSoon).toHaveBeenCalledWith(
        expect.objectContaining({ sakhiId: SAKHI_ID }),
      );
      expect(result).toEqual({
        total: 3,
        byStatus: { COMPLETED: 3 },
        endingSoonVisitsCount: 0,
        byCaseType: { MOTHER: 0, CHILD: 0 },
        byStatusAndCaseType: {},
      });
    });

    it('scopes a SUPERVISOR caller to their roster', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a', 'sakhi-b']);
      repository.countByStatus.mockResolvedValue([]);
      resolveVisitStatusCodesMock.mockResolvedValue(new Map());
      repository.countByCaseType.mockResolvedValue([]);
      repository.countByStatusAndCaseType.mockResolvedValue([]);
      repository.countEndingSoon.mockResolvedValue(0);

      await service.getVisitSummary(
        {},
        { id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: 'p1' },
        AUTH_HEADER,
      );

      expect(repository.countByStatus).toHaveBeenCalledWith(
        expect.objectContaining({ sakhiIds: ['sakhi-a', 'sakhi-b'] }),
      );
      expect(repository.countByCaseType).toHaveBeenCalledWith(
        expect.objectContaining({ sakhiIds: ['sakhi-a', 'sakhi-b'] }),
      );
      expect(repository.countByStatusAndCaseType).toHaveBeenCalledWith(
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
      repository.countByCaseType.mockResolvedValue([]);
      repository.countByStatusAndCaseType.mockResolvedValue([]);
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
      repository.countByCaseType.mockResolvedValue([]);
      repository.countByStatusAndCaseType.mockResolvedValue([]);
      repository.countEndingSoon.mockResolvedValue(0);

      const result = await service.getVisitSummary(
        {},
        { id: SAKHI_ID, roles: ['SAKHI'] },
        AUTH_HEADER,
      );

      expect(result).toEqual({
        total: 0,
        byStatus: {},
        endingSoonVisitsCount: 0,
        byCaseType: { MOTHER: 0, CHILD: 0 },
        byStatusAndCaseType: {},
      });
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
      repository.countByCaseType.mockResolvedValue([]);
      repository.countByStatusAndCaseType.mockResolvedValue([]);
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

    it('buckets visit types into byCaseType via the MOTHER/CHILD lookup', async () => {
      repository.countByStatus.mockResolvedValue([]);
      resolveVisitStatusCodesMock.mockResolvedValue(new Map());
      repository.countByCaseType.mockResolvedValue(['ANC', 'ANC', 'PP', 'NN', 'CCV', 'CCV']);
      repository.countByStatusAndCaseType.mockResolvedValue([]);
      repository.countEndingSoon.mockResolvedValue(0);

      const result = await service.getVisitSummary(
        {},
        { id: SAKHI_ID, roles: ['SAKHI'] },
        AUTH_HEADER,
      );

      expect(result.byCaseType).toEqual({ MOTHER: 3, CHILD: 3 });
    });

    it('excludes an unrecognized visitType from byCaseType without affecting total/byStatus', async () => {
      repository.countByStatus.mockResolvedValue([
        { statusLookupValueId: COMPLETED_ID, _count: { _all: 1 } },
      ]);
      resolveVisitStatusCodesMock.mockResolvedValue(new Map([[COMPLETED_ID, 'COMPLETED']]));
      repository.countByCaseType.mockResolvedValue([
        'ANC',
        'SOME_UNKNOWN_TYPE',
      ] as unknown as Awaited<ReturnType<typeof repository.countByCaseType>>);
      repository.countByStatusAndCaseType.mockResolvedValue([]);
      repository.countEndingSoon.mockResolvedValue(0);

      const result = await service.getVisitSummary(
        {},
        { id: SAKHI_ID, roles: ['SAKHI'] },
        AUTH_HEADER,
      );

      expect(result.byCaseType).toEqual({ MOTHER: 1, CHILD: 0 });
      expect(result.total).toBe(1);
      expect(result.byStatus).toEqual({ COMPLETED: 1 });
    });

    it('cross-tabulates status x case type into byStatusAndCaseType', async () => {
      const PENDING_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
      repository.countByStatus.mockResolvedValue([]);
      resolveVisitStatusCodesMock.mockResolvedValue(
        new Map([
          [PENDING_ID, 'PENDING'],
          [MISSED_ID, 'MISSED'],
          [COMPLETED_ID, 'COMPLETED'],
        ]),
      );
      repository.countByCaseType.mockResolvedValue([]);
      repository.countByStatusAndCaseType.mockResolvedValue([
        { statusLookupValueId: PENDING_ID, schedule: { visitType: 'ANC' } },
        { statusLookupValueId: PENDING_ID, schedule: { visitType: 'NN' } },
        { statusLookupValueId: MISSED_ID, schedule: { visitType: 'PP' } },
        { statusLookupValueId: COMPLETED_ID, schedule: { visitType: 'ANC' } },
        { statusLookupValueId: COMPLETED_ID, schedule: { visitType: 'ANC' } },
        { statusLookupValueId: COMPLETED_ID, schedule: { visitType: 'ANC' } },
        { statusLookupValueId: COMPLETED_ID, schedule: { visitType: 'ANC' } },
        { statusLookupValueId: COMPLETED_ID, schedule: { visitType: 'ANC' } },
        { statusLookupValueId: COMPLETED_ID, schedule: { visitType: 'ANC' } },
        { statusLookupValueId: COMPLETED_ID, schedule: { visitType: 'ANC' } },
        { statusLookupValueId: COMPLETED_ID, schedule: { visitType: 'NN' } },
        { statusLookupValueId: COMPLETED_ID, schedule: { visitType: 'NN' } },
        { statusLookupValueId: COMPLETED_ID, schedule: { visitType: 'NN' } },
        { statusLookupValueId: COMPLETED_ID, schedule: { visitType: 'NN' } },
        { statusLookupValueId: COMPLETED_ID, schedule: { visitType: 'NN' } },
        { statusLookupValueId: COMPLETED_ID, schedule: { visitType: 'NN' } },
      ]);
      repository.countEndingSoon.mockResolvedValue(0);

      const result = await service.getVisitSummary(
        {},
        { id: SAKHI_ID, roles: ['SAKHI'] },
        AUTH_HEADER,
      );

      expect(result.byStatusAndCaseType).toEqual({
        PENDING: { MOTHER: 1, CHILD: 1 },
        MISSED: { MOTHER: 1, CHILD: 0 },
        COMPLETED: { MOTHER: 7, CHILD: 6 },
      });
    });

    it('zero-fills the case type with no visits under a given status', async () => {
      repository.countByStatus.mockResolvedValue([]);
      resolveVisitStatusCodesMock.mockResolvedValue(new Map([[MISSED_ID, 'MISSED']]));
      repository.countByCaseType.mockResolvedValue([]);
      repository.countByStatusAndCaseType.mockResolvedValue([
        { statusLookupValueId: MISSED_ID, schedule: { visitType: 'ANC' } },
      ]);
      repository.countEndingSoon.mockResolvedValue(0);

      const result = await service.getVisitSummary(
        {},
        { id: SAKHI_ID, roles: ['SAKHI'] },
        AUTH_HEADER,
      );

      expect(result.byStatusAndCaseType).toEqual({ MISSED: { MOTHER: 1, CHILD: 0 } });
    });

    it('excludes an unrecognized visitType from byStatusAndCaseType without throwing', async () => {
      repository.countByStatus.mockResolvedValue([]);
      resolveVisitStatusCodesMock.mockResolvedValue(new Map([[COMPLETED_ID, 'COMPLETED']]));
      repository.countByCaseType.mockResolvedValue([]);
      repository.countByStatusAndCaseType.mockResolvedValue([
        { statusLookupValueId: COMPLETED_ID, schedule: { visitType: 'ANC' } },
        {
          statusLookupValueId: COMPLETED_ID,
          schedule: { visitType: 'SOME_UNKNOWN_TYPE' },
        },
      ] as unknown as Awaited<ReturnType<typeof repository.countByStatusAndCaseType>>);
      repository.countEndingSoon.mockResolvedValue(0);

      const result = await service.getVisitSummary(
        {},
        { id: SAKHI_ID, roles: ['SAKHI'] },
        AUTH_HEADER,
      );

      expect(result.byStatusAndCaseType).toEqual({ COMPLETED: { MOTHER: 1, CHILD: 0 } });
    });

    it('returns an empty byStatusAndCaseType when no visits are in scope', async () => {
      repository.countByStatus.mockResolvedValue([]);
      resolveVisitStatusCodesMock.mockResolvedValue(new Map());
      repository.countByCaseType.mockResolvedValue([]);
      repository.countByStatusAndCaseType.mockResolvedValue([]);
      repository.countEndingSoon.mockResolvedValue(0);

      const result = await service.getVisitSummary(
        {},
        { id: SAKHI_ID, roles: ['SAKHI'] },
        AUTH_HEADER,
      );

      expect(result.byStatusAndCaseType).toEqual({});
    });
  });

  describe('getVisitSummaryByType', () => {
    const SAKHI_ID = 'sakhi-1';
    const ALL_ZERO_VISIT_TYPE_COUNTS = {
      ANC: 0,
      ANC_HR: 0,
      ANC_POST_EDD: 0,
      DELIVERY: 0,
      PP: 0,
      PP_HR: 0,
      NN: 0,
      NN_HR: 0,
      INC: 0,
      INC_HR: 0,
      CCV: 0,
      CCV_HR: 0,
    };

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-19T14:30:00.000Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns thisWeek/thisMonth with every VisitCodeType key zero-filled by default', async () => {
      resolveVisitStatusIdByCodeMock.mockResolvedValue(COMPLETED_ID);
      repository.countCompletedByTypeInWindow.mockResolvedValue([]);

      const result = await service.getVisitSummaryByType(
        {},
        { id: SAKHI_ID, roles: ['SAKHI'] },
        AUTH_HEADER,
      );

      expect(result).toEqual({
        thisWeek: ALL_ZERO_VISIT_TYPE_COUNTS,
        thisMonth: ALL_ZERO_VISIT_TYPE_COUNTS,
      });
    });

    it('tallies mixed visit types into the right buckets for each window independently', async () => {
      resolveVisitStatusIdByCodeMock.mockResolvedValue(COMPLETED_ID);
      repository.countCompletedByTypeInWindow
        .mockResolvedValueOnce(['ANC', 'ANC', 'PP'])
        .mockResolvedValueOnce(['ANC', 'NN', 'NN', 'CCV']);

      const result = await service.getVisitSummaryByType(
        {},
        { id: SAKHI_ID, roles: ['SAKHI'] },
        AUTH_HEADER,
      );

      expect(result.thisWeek).toEqual({ ...ALL_ZERO_VISIT_TYPE_COUNTS, ANC: 2, PP: 1 });
      expect(result.thisMonth).toEqual({ ...ALL_ZERO_VISIT_TYPE_COUNTS, ANC: 1, NN: 2, CCV: 1 });
    });

    it('resolves the COMPLETED status lookup id and passes it to both window calls', async () => {
      resolveVisitStatusIdByCodeMock.mockResolvedValue(COMPLETED_ID);
      repository.countCompletedByTypeInWindow.mockResolvedValue([]);

      await service.getVisitSummaryByType({}, { id: SAKHI_ID, roles: ['SAKHI'] }, AUTH_HEADER);

      expect(resolveVisitStatusIdByCodeMock).toHaveBeenCalledWith('COMPLETED', AUTH_HEADER);
      expect(repository.countCompletedByTypeInWindow).toHaveBeenCalledTimes(2);
      for (const call of repository.countCompletedByTypeInWindow.mock.calls) {
        expect(call[0].completedStatusLookupValueId).toBe(COMPLETED_ID);
      }
    });

    it('propagates the error when the COMPLETED status code cannot be resolved', async () => {
      resolveVisitStatusIdByCodeMock.mockRejectedValue(
        new Error('Unable to resolve VISIT_STATUS code "COMPLETED" to a lookup_value_id.'),
      );

      await expect(
        service.getVisitSummaryByType({}, { id: SAKHI_ID, roles: ['SAKHI'] }, AUTH_HEADER),
      ).rejects.toThrow('Unable to resolve VISIT_STATUS code "COMPLETED"');
      expect(repository.countCompletedByTypeInWindow).not.toHaveBeenCalled();
    });

    it('scopes a SAKHI caller to their own visits', async () => {
      resolveVisitStatusIdByCodeMock.mockResolvedValue(COMPLETED_ID);
      repository.countCompletedByTypeInWindow.mockResolvedValue([]);

      await service.getVisitSummaryByType({}, { id: SAKHI_ID, roles: ['SAKHI'] }, AUTH_HEADER);

      for (const call of repository.countCompletedByTypeInWindow.mock.calls) {
        expect(call[0]).toMatchObject({ sakhiId: SAKHI_ID });
      }
    });

    it('scopes a SUPERVISOR caller to their roster', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a', 'sakhi-b']);
      resolveVisitStatusIdByCodeMock.mockResolvedValue(COMPLETED_ID);
      repository.countCompletedByTypeInWindow.mockResolvedValue([]);

      await service.getVisitSummaryByType(
        {},
        { id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: 'p1' },
        AUTH_HEADER,
      );

      for (const call of repository.countCompletedByTypeInWindow.mock.calls) {
        expect(call[0]).toMatchObject({ sakhiIds: ['sakhi-a', 'sakhi-b'] });
      }
    });

    it('rejects a SUPERVISOR caller with no project scope', async () => {
      await expect(
        service.getVisitSummaryByType(
          {},
          { id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: null },
          AUTH_HEADER,
        ),
      ).rejects.toThrow('Supervisor caller has no project scope.');
    });

    it('leaves a MANAGER caller unscoped', async () => {
      resolveVisitStatusIdByCodeMock.mockResolvedValue(COMPLETED_ID);
      repository.countCompletedByTypeInWindow.mockResolvedValue([]);

      await service.getVisitSummaryByType({}, { id: 'manager-1', roles: ['MANAGER'] }, AUTH_HEADER);

      for (const call of repository.countCompletedByTypeInWindow.mock.calls) {
        expect(call[0]).not.toMatchObject({ sakhiId: expect.anything() });
      }
    });

    it('computes a Monday-start UTC week window and a calendar-month UTC window from "now"', async () => {
      resolveVisitStatusIdByCodeMock.mockResolvedValue(COMPLETED_ID);
      repository.countCompletedByTypeInWindow.mockResolvedValue([]);

      await service.getVisitSummaryByType({}, { id: SAKHI_ID, roles: ['SAKHI'] }, AUTH_HEADER);

      const [weekCall, monthCall] = repository.countCompletedByTypeInWindow.mock.calls;
      expect(weekCall[0].from.toISOString()).toBe('2026-08-17T00:00:00.000Z');
      expect(weekCall[0].to.toISOString()).toBe('2026-08-24T00:00:00.000Z');
      expect(monthCall[0].from.toISOString()).toBe('2026-08-01T00:00:00.000Z');
      expect(monthCall[0].to.toISOString()).toBe('2026-09-01T00:00:00.000Z');
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

    it(
      'leaves a caller holding both MANAGER and SAKHI unscoped — regression: the SAKHI ' +
        'branch must not run ahead of the privileged-role check',
      async () => {
        const DUAL_ROLE_CALLER = { id: 'sakhi-1', roles: ['MANAGER', 'SAKHI'] };
        repository.countByBeneficiary.mockResolvedValue([]);
        resolveVisitStatusCodesMock.mockResolvedValue(new Map());
        repository.countDueTodayByBeneficiary.mockResolvedValue(new Map());

        await service.getCountByBeneficiary(['ben-1'], DUAL_ROLE_CALLER, AUTH_HEADER);

        expect(repository.countByBeneficiary).toHaveBeenCalledWith(['ben-1'], {});
      },
    );
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
        [],
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
        [],
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
        [],
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
        [],
        new Date('2026-08-20T00:00:00.000Z'),
        {},
      );
    });

    it(
      'passes PENDING and MISSED status ids to the repository separately — regression: MISSED ' +
        'visits must use an overdue (<=date) window, not an exact-date match like PENDING',
      async () => {
        const MISSED_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
        resolveVisitStatusCodesMock.mockResolvedValue(
          new Map([
            [PENDING_ID, 'PENDING'],
            [MISSED_ID, 'MISSED'],
          ]),
        );
        repository.findByPada.mockResolvedValue([]);

        await service.getByPada(['ben-1'], '2026-08-20', SAKHI_CALLER, AUTH_HEADER);

        expect(repository.findByPada).toHaveBeenCalledWith(
          ['ben-1'],
          [PENDING_ID],
          [MISSED_ID],
          new Date('2026-08-20T00:00:00.000Z'),
          expect.objectContaining({ sakhiId: SAKHI_CALLER.id }),
        );
      },
    );
  });

  describe('getVisitHistory', () => {
    const SAKHI_CALLER = { id: 'sakhi-1', roles: ['SAKHI'] };

    const completedVisit = (overrides: Partial<Record<string, unknown>> = {}) => ({
      id: 'visit-1',
      completedAt: new Date('2026-08-04T10:12:00.000Z'),
      schedule: { visitCode: 'ANC2' },
      formSubmissions: [
        {
          formDataJson: { blood_pressure_bp_systolic: 120, blood_pressure_bp_diastolic: 80 },
          formVersion: { formDefinition: { formCode: 'ANC_VISIT' } },
        },
      ],
      ...overrides,
    });

    beforeEach(() => {
      findBeneficiaryOwnershipMock.mockResolvedValue({
        id: 'ben-1',
        sakhiId: 'sakhi-1',
        caseType: 'MOTHER',
      } as never);
    });

    it('returns an empty visits array when the beneficiary has no completed visits yet', async () => {
      repository.findRecentCompletedVisits.mockResolvedValue([]);

      const result = await service.getVisitHistory(
        'ben-1',
        { limit: 2 },
        SAKHI_CALLER,
        AUTH_HEADER,
      );

      expect(result).toEqual({ visits: [] });
    });

    it('returns one shaped row for a beneficiary with exactly 1 completed visit', async () => {
      repository.findRecentCompletedVisits.mockResolvedValue([completedVisit()] as never);

      const result = await service.getVisitHistory(
        'ben-1',
        { limit: 2 },
        SAKHI_CALLER,
        AUTH_HEADER,
      );

      expect(result.visits).toHaveLength(1);
      expect(result.visits[0]).toEqual({
        visitId: 'visit-1',
        visitCode: 'ANC2',
        completedAt: new Date('2026-08-04T10:12:00.000Z'),
        vitals: {
          hemoglobin: { value: null, unit: 'g/dl' },
          bloodPressure: { systolic: 120, diastolic: 80, unit: 'mmHg' },
          weight: { value: null, unit: 'kg' },
          bloodSugar: { value: null, unit: 'mg/dl' },
          temperature: { value: null, unit: '°F' },
        },
      });
    });

    it('passes the default limit (2) through to the repository so only the last 2 of 3+ completed visits come back', async () => {
      repository.findRecentCompletedVisits.mockResolvedValue([
        completedVisit({ id: 'visit-3', completedAt: new Date('2026-08-10T00:00:00.000Z') }),
        completedVisit({ id: 'visit-2', completedAt: new Date('2026-08-05T00:00:00.000Z') }),
      ] as never);

      const result = await service.getVisitHistory(
        'ben-1',
        { limit: 2 },
        SAKHI_CALLER,
        AUTH_HEADER,
      );

      expect(repository.findRecentCompletedVisits).toHaveBeenCalledWith('ben-1', undefined, 2);
      expect(result.visits).toHaveLength(2);
      expect(result.visits[0].visitId).toBe('visit-3');
      expect(result.visits[1].visitId).toBe('visit-2');
    });

    it('passes an explicit limit through to the repository', async () => {
      repository.findRecentCompletedVisits.mockResolvedValue([completedVisit()] as never);

      await service.getVisitHistory('ben-1', { limit: 1 }, SAKHI_CALLER, AUTH_HEADER);

      expect(repository.findRecentCompletedVisits).toHaveBeenCalledWith('ben-1', undefined, 1);
    });

    it('nulls a vital not captured by the visit form, never omitting it from the response', async () => {
      repository.findRecentCompletedVisits.mockResolvedValue([
        completedVisit({
          formSubmissions: [
            {
              formDataJson: { current_weight_kg: 55 },
              formVersion: { formDefinition: { formCode: 'POSTPARTUM_VISIT' } },
            },
          ],
        }),
      ] as never);

      const result = await service.getVisitHistory(
        'ben-1',
        { limit: 2 },
        SAKHI_CALLER,
        AUTH_HEADER,
      );

      expect(result.visits[0].vitals.bloodPressure).toEqual({
        systolic: null,
        diastolic: null,
        unit: 'mmHg',
      });
      expect(result.visits[0].vitals.bloodSugar).toEqual({ value: null, unit: 'mg/dl' });
      expect(result.visits[0].vitals.weight).toEqual({ value: '55', unit: 'kg' });
    });

    it('resolves a formCode filter directly through to the repository', async () => {
      repository.findRecentCompletedVisits.mockResolvedValue([]);

      await service.getVisitHistory(
        'ben-1',
        { formCode: 'ANC_VISIT', limit: 2 },
        SAKHI_CALLER,
        AUTH_HEADER,
      );

      expect(repository.findRecentCompletedVisits).toHaveBeenCalledWith('ben-1', ['ANC_VISIT'], 2);
    });

    it('resolves a repeatable visitType filter to its formCodes via visit-code-form-map', async () => {
      repository.findRecentCompletedVisits.mockResolvedValue([]);

      await service.getVisitHistory(
        'ben-1',
        { visitType: ['ANC', 'PP'], limit: 2 },
        SAKHI_CALLER,
        AUTH_HEADER,
      );

      expect(repository.findRecentCompletedVisits).toHaveBeenCalledWith(
        'ben-1',
        ['ANC_VISIT', 'POSTPARTUM_VISIT'],
        2,
      );
    });

    it("rejects when the beneficiary is outside the calling SAKHI's own roster", async () => {
      findBeneficiaryOwnershipMock.mockResolvedValue({
        id: 'ben-1',
        sakhiId: 'someone-else',
        caseType: 'MOTHER',
      } as never);

      await expect(
        service.getVisitHistory('ben-1', { limit: 2 }, SAKHI_CALLER, AUTH_HEADER),
      ).rejects.toThrow(/outside your own roster/);
      expect(repository.findRecentCompletedVisits).not.toHaveBeenCalled();
    });

    it('allows a SUPERVISOR calling for a beneficiary inside her roster', async () => {
      const SUPERVISOR_CALLER = { id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: 'proj-1' };
      findBeneficiaryOwnershipMock.mockResolvedValue({
        id: 'ben-1',
        sakhiId: 'sakhi-1',
        caseType: 'MOTHER',
      } as never);
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-1']);
      repository.findRecentCompletedVisits.mockResolvedValue([]);

      await expect(
        service.getVisitHistory('ben-1', { limit: 2 }, SUPERVISOR_CALLER, AUTH_HEADER),
      ).resolves.toEqual({ visits: [] });
    });

    it('rejects a SUPERVISOR calling for a beneficiary outside her roster', async () => {
      const SUPERVISOR_CALLER = { id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: 'proj-1' };
      listSakhiIdsForSupervisorMock.mockResolvedValue(['someone-else']);

      await expect(
        service.getVisitHistory('ben-1', { limit: 2 }, SUPERVISOR_CALLER, AUTH_HEADER),
      ).rejects.toThrow(/outside this Supervisor's roster/);
      expect(repository.findRecentCompletedVisits).not.toHaveBeenCalled();
    });

    it('rejects a SUPERVISOR caller with no project scope', async () => {
      const SUPERVISOR_CALLER = { id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: null };

      await expect(
        service.getVisitHistory('ben-1', { limit: 2 }, SUPERVISOR_CALLER, AUTH_HEADER),
      ).rejects.toThrow(/no project scope/);
    });

    it('allows a MANAGER caller regardless of roster', async () => {
      const MANAGER_CALLER = { id: 'manager-1', roles: ['MANAGER'] };
      findBeneficiaryOwnershipMock.mockResolvedValue({
        id: 'ben-1',
        sakhiId: 'someone-else',
        caseType: 'MOTHER',
      } as never);
      repository.findRecentCompletedVisits.mockResolvedValue([]);

      await expect(
        service.getVisitHistory('ben-1', { limit: 2 }, MANAGER_CALLER, AUTH_HEADER),
      ).resolves.toEqual({ visits: [] });
    });

    it('throws not-found when the beneficiary case does not exist', async () => {
      findBeneficiaryOwnershipMock.mockResolvedValue(null);

      await expect(
        service.getVisitHistory('ben-1', { limit: 2 }, SAKHI_CALLER, AUTH_HEADER),
      ).rejects.toThrow(/not found/i);
      expect(repository.findRecentCompletedVisits).not.toHaveBeenCalled();
    });
  });

  describe('restoreForSakhi', () => {
    const targetSakhiId = '77777777-7777-7777-7777-777777777777';
    const ADMIN_CALLER = { id: 'admin-1', roles: ['ADMIN'] };
    const SYSTEM_CALLER = { id: 'system-1', roles: ['SYSTEM'] };

    it('delegates to the repository and returns its result for a privileged (ADMIN) caller', async () => {
      repository.restoreForSakhi.mockResolvedValue({ restoredVisitCount: 3 });

      const result = await service.restoreForSakhi(targetSakhiId, ADMIN_CALLER, AUTH_HEADER);

      expect(repository.restoreForSakhi).toHaveBeenCalledWith(targetSakhiId);
      expect(listSakhiIdsForSupervisorMock).not.toHaveBeenCalled();
      expect(result).toEqual({ restoredVisitCount: 3 });
    });

    it('delegates to the repository for a SYSTEM caller (unscoped)', async () => {
      repository.restoreForSakhi.mockResolvedValue({ restoredVisitCount: 0 });

      await service.restoreForSakhi(targetSakhiId, SYSTEM_CALLER, AUTH_HEADER);

      expect(repository.restoreForSakhi).toHaveBeenCalledWith(targetSakhiId);
      expect(listSakhiIdsForSupervisorMock).not.toHaveBeenCalled();
    });

    it('403s when a SUPERVISOR targets a Sakhi outside their own roster', async () => {
      const SUPERVISOR_CALLER = { id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: 'proj-1' };
      listSakhiIdsForSupervisorMock.mockResolvedValue(['some-other-sakhi']);

      await expect(
        service.restoreForSakhi(targetSakhiId, SUPERVISOR_CALLER, AUTH_HEADER),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.restoreForSakhi).not.toHaveBeenCalled();
    });

    it('allows a SUPERVISOR to restore a Sakhi in their own roster', async () => {
      const SUPERVISOR_CALLER = { id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: 'proj-1' };
      repository.restoreForSakhi.mockResolvedValue({ restoredVisitCount: 2 });
      listSakhiIdsForSupervisorMock.mockResolvedValue([targetSakhiId]);

      const result = await service.restoreForSakhi(targetSakhiId, SUPERVISOR_CALLER, AUTH_HEADER);

      expect(repository.restoreForSakhi).toHaveBeenCalledWith(targetSakhiId);
      expect(result).toEqual({ restoredVisitCount: 2 });
    });

    it('403s when a SUPERVISOR caller has no project scope', async () => {
      const SUPERVISOR_CALLER = { id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: null };

      await expect(
        service.restoreForSakhi(targetSakhiId, SUPERVISOR_CALLER, AUTH_HEADER),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.restoreForSakhi).not.toHaveBeenCalled();
      expect(listSakhiIdsForSupervisorMock).not.toHaveBeenCalled();
    });

    it('propagates a repository error', async () => {
      repository.restoreForSakhi.mockRejectedValue(new Error('db down'));

      await expect(
        service.restoreForSakhi(targetSakhiId, ADMIN_CALLER, AUTH_HEADER),
      ).rejects.toThrow('db down');
    });
  });

  describe('cleanupDuplicateSchedules', () => {
    it('returns a zeroed summary and writes nothing when there are no duplicate scheduleIds', async () => {
      repository.findDuplicateScheduleIds.mockResolvedValue([]);

      const result = await service.cleanupDuplicateSchedules(false);

      expect(repository.findNonDeletedByScheduleId).not.toHaveBeenCalled();
      expect(repository.softDeleteMany).not.toHaveBeenCalled();
      expect(result).toEqual({ duplicateScheduleCount: 0, softDeletedCount: 0, details: [] });
    });

    it('keeps the earliest row per scheduleId and soft-deletes the rest when dryRun is false', async () => {
      repository.findDuplicateScheduleIds.mockResolvedValue(['schedule-1']);
      repository.findNonDeletedByScheduleId.mockResolvedValue([
        { id: 'visit-1', createdAt: new Date('2026-09-19T06:30:01.020Z'), localVisitUuid: 'a' },
        { id: 'visit-2', createdAt: new Date('2026-09-19T06:30:01.024Z'), localVisitUuid: 'b' },
      ] as never);

      const result = await service.cleanupDuplicateSchedules(false);

      expect(repository.softDeleteMany).toHaveBeenCalledWith(['visit-2']);
      expect(result).toEqual({
        duplicateScheduleCount: 1,
        softDeletedCount: 1,
        details: [{ scheduleId: 'schedule-1', keptId: 'visit-1', softDeletedIds: ['visit-2'] }],
      });
    });

    it('does not write anything when dryRun is true, but still reports what would happen', async () => {
      repository.findDuplicateScheduleIds.mockResolvedValue(['schedule-1']);
      repository.findNonDeletedByScheduleId.mockResolvedValue([
        { id: 'visit-1', createdAt: new Date('2026-09-19T06:30:01.020Z'), localVisitUuid: 'a' },
        { id: 'visit-2', createdAt: new Date('2026-09-19T06:30:01.024Z'), localVisitUuid: 'b' },
      ] as never);

      const result = await service.cleanupDuplicateSchedules(true);

      expect(repository.softDeleteMany).not.toHaveBeenCalled();
      expect(result).toEqual({
        duplicateScheduleCount: 1,
        softDeletedCount: 1,
        details: [{ scheduleId: 'schedule-1', keptId: 'visit-1', softDeletedIds: ['visit-2'] }],
      });
    });

    it('resolves multiple duplicate scheduleId groups independently', async () => {
      repository.findDuplicateScheduleIds.mockResolvedValue(['schedule-1', 'schedule-2']);
      repository.findNonDeletedByScheduleId
        .mockResolvedValueOnce([
          { id: 'visit-1', createdAt: new Date('2026-09-01T00:00:00.000Z') },
          { id: 'visit-2', createdAt: new Date('2026-09-02T00:00:00.000Z') },
        ] as never)
        .mockResolvedValueOnce([
          { id: 'visit-3', createdAt: new Date('2026-09-03T00:00:00.000Z') },
          { id: 'visit-4', createdAt: new Date('2026-09-04T00:00:00.000Z') },
          { id: 'visit-5', createdAt: new Date('2026-09-05T00:00:00.000Z') },
        ] as never);

      const result = await service.cleanupDuplicateSchedules(false);

      expect(repository.softDeleteMany).toHaveBeenCalledWith(['visit-2']);
      expect(repository.softDeleteMany).toHaveBeenCalledWith(['visit-4', 'visit-5']);
      expect(result.duplicateScheduleCount).toBe(2);
      expect(result.softDeletedCount).toBe(3);
    });

    it('does not call softDeleteMany for a group with no discard rows', async () => {
      // Not expected in practice (findDuplicateScheduleIds only returns
      // scheduleIds with >1 row), but guards the "0 rows to discard" edge
      // case defensively rather than relying on that invariant holding.
      repository.findDuplicateScheduleIds.mockResolvedValue(['schedule-1']);
      repository.findNonDeletedByScheduleId.mockResolvedValue([
        { id: 'visit-1', createdAt: new Date('2026-09-01T00:00:00.000Z') },
      ] as never);

      await service.cleanupDuplicateSchedules(false);

      expect(repository.softDeleteMany).not.toHaveBeenCalled();
    });
  });
});
