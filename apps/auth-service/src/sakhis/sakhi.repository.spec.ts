import { SakhiRepository } from './sakhi.repository';

describe('SakhiRepository', () => {
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const findManyLocationAssignments = jest.fn();
  const findUniqueLocationAssignment = jest.fn();
  const createLocationAssignment = jest.fn();
  const updateLocationAssignment = jest.fn();
  const prisma = {
    sakhiProfile: { findMany, findFirst },
    sakhiLocationAssignment: {
      findMany: findManyLocationAssignments,
      findUnique: findUniqueLocationAssignment,
      create: createLocationAssignment,
      update: updateLocationAssignment,
    },
  } as never;
  let repository: SakhiRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new SakhiRepository(prisma);
  });

  describe('findByProject', () => {
    it('queries Sakhis for the given project, excluding soft-deleted, ordered by display name', async () => {
      findMany.mockResolvedValue([
        { id: 'sakhi-1', primaryProjectId: 'project-1', user: { displayName: 'Priya' } },
      ]);

      const result = await repository.findByProject('project-1');

      expect(findMany).toHaveBeenCalledWith({
        where: { primaryProjectId: 'project-1', isDeleted: false },
        include: { user: true },
        orderBy: { user: { displayName: 'asc' } },
      });
      expect(result).toEqual([
        { id: 'sakhi-1', primaryProjectId: 'project-1', user: { displayName: 'Priya' } },
      ]);
    });

    it('returns an empty array when the project has no Sakhis', async () => {
      findMany.mockResolvedValue([]);
      const result = await repository.findByProject('project-with-no-sakhis');
      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('queries a single Sakhi by user id, excluding soft-deleted', async () => {
      findFirst.mockResolvedValue({ id: 'sakhi-1', user: { id: 'user-1', displayName: 'Priya' } });

      const result = await repository.findById('user-1');

      expect(findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDeleted: false },
        include: { user: true },
      });
      expect(result).toEqual({ id: 'sakhi-1', user: { id: 'user-1', displayName: 'Priya' } });
    });

    it('returns null when the Sakhi does not exist', async () => {
      findFirst.mockResolvedValue(null);
      const result = await repository.findById('missing');
      expect(result).toBeNull();
    });
  });

  describe('findManyByIds', () => {
    it('queries Sakhis matching any of the given user ids, excluding soft-deleted', async () => {
      findMany.mockResolvedValue([{ id: 'sakhi-1', user: { id: 'user-1', displayName: 'Priya' } }]);

      const result = await repository.findManyByIds(['user-1', 'user-2']);

      expect(findMany).toHaveBeenCalledWith({
        where: { userId: { in: ['user-1', 'user-2'] }, isDeleted: false },
        include: { user: true },
      });
      expect(result).toEqual([{ id: 'sakhi-1', user: { id: 'user-1', displayName: 'Priya' } }]);
    });

    it('returns an empty array when none of the ids match', async () => {
      findMany.mockResolvedValue([]);
      const result = await repository.findManyByIds(['missing']);
      expect(result).toEqual([]);
    });
  });

  describe('findActiveLocationAssignments', () => {
    const ASOF = new Date('2026-09-17');

    it(
      'queries by sakhiId, effectiveFrom <= asOf, (effectiveTo null or >= asOf), and ' +
        'statusLookupId null — PR #238 review: statusLookupId must be excluded defensively ' +
        'even though nothing writes a non-null value today, so a future revoked-assignment ' +
        "write path can't silently leak into the union without this filter already in place",
      async () => {
        findManyLocationAssignments.mockResolvedValue([
          { villageId: 'village-1', padaId: 'pada-1', effectiveFrom: ASOF, effectiveTo: null },
        ]);

        const result = await repository.findActiveLocationAssignments('sakhi-1', ASOF);

        expect(findManyLocationAssignments).toHaveBeenCalledWith({
          where: {
            sakhiId: 'sakhi-1',
            statusLookupId: null,
            effectiveFrom: { lte: ASOF },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: ASOF } }],
          },
        });
        expect(result).toEqual([
          { villageId: 'village-1', padaId: 'pada-1', effectiveFrom: ASOF, effectiveTo: null },
        ]);
      },
    );

    it('returns an empty array when the Sakhi has no active assignments', async () => {
      findManyLocationAssignments.mockResolvedValue([]);
      const result = await repository.findActiveLocationAssignments('sakhi-1', ASOF);
      expect(result).toEqual([]);
    });
  });

  describe('findLocationAssignmentById', () => {
    it('queries a single assignment by its own id', async () => {
      findUniqueLocationAssignment.mockResolvedValue({ id: 'assignment-1', sakhiId: 'sakhi-1' });

      const result = await repository.findLocationAssignmentById('assignment-1');

      expect(findUniqueLocationAssignment).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
      });
      expect(result).toEqual({ id: 'assignment-1', sakhiId: 'sakhi-1' });
    });

    it('returns null when the assignment does not exist', async () => {
      findUniqueLocationAssignment.mockResolvedValue(null);
      const result = await repository.findLocationAssignmentById('missing');
      expect(result).toBeNull();
    });
  });

  describe('createLocationAssignment', () => {
    it('creates a row with the given fields', async () => {
      const data = {
        sakhiId: 'sakhi-1',
        projectId: 'project-1',
        villageId: 'village-1',
        padaId: 'pada-1',
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: null,
      };
      createLocationAssignment.mockResolvedValue({ id: 'assignment-1', ...data });

      const result = await repository.createLocationAssignment(data);

      expect(createLocationAssignment).toHaveBeenCalledWith({ data });
      expect(result).toEqual({ id: 'assignment-1', ...data });
    });
  });

  describe('updateLocationAssignment', () => {
    it('updates the given assignment id with the given partial fields', async () => {
      const data = { effectiveTo: new Date('2026-06-01') };
      updateLocationAssignment.mockResolvedValue({ id: 'assignment-1', ...data });

      const result = await repository.updateLocationAssignment('assignment-1', data);

      expect(updateLocationAssignment).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data,
      });
      expect(result).toEqual({ id: 'assignment-1', ...data });
    });
  });

  describe('endLocationAssignment', () => {
    it('sets effectiveTo on the given assignment id', async () => {
      const effectiveTo = new Date('2026-06-01');
      updateLocationAssignment.mockResolvedValue({ id: 'assignment-1', effectiveTo });

      const result = await repository.endLocationAssignment('assignment-1', effectiveTo);

      expect(updateLocationAssignment).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: { effectiveTo },
      });
      expect(result).toEqual({ id: 'assignment-1', effectiveTo });
    });
  });
});
