import { PrismaService } from './prisma.service';

/**
 * Verifies the funders/projects migration itself (constraints, defaults, FK
 * behaviour) — there is no API layer for this domain yet (deferred to the
 * "Project APIs" sprint task), so these tests exercise the Prisma client
 * directly against the real schema. This requires a real, migrated database
 * (DATABASE_URL/DIRECT_URL), which CI does not currently provision — skipped
 * there rather than failing the pipeline; runs normally for any developer
 * with a local .env pointing at a migrated database.
 */
const describeIfDatabaseConfigured = process.env.DATABASE_URL ? describe : describe.skip;

describeIfDatabaseConfigured('master data schema (funders, projects)', () => {
  const prisma = new PrismaService();
  const createdFunderIds: string[] = [];
  const createdProjectIds: string[] = [];

  beforeAll(async () => {
    await prisma.connect();
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.funder.deleteMany({ where: { funderId: { in: createdFunderIds } } });
    await prisma.disconnect();
  });

  function trackFunder<T extends { funderId: string }>(row: T): T {
    createdFunderIds.push(row.funderId);
    return row;
  }

  function trackProject<T extends { projectId: string }>(row: T): T {
    createdProjectIds.push(row.projectId);
    return row;
  }

  it('creates a funder with only required fields, applying defaults', async () => {
    const funder = trackFunder(
      await prisma.funder.create({
        data: { funderCode: `FND-${Date.now()}-1`, funderName: 'Test Funder' },
      }),
    );

    expect(funder.status).toBe('ACTIVE');
    expect(funder.isDeleted).toBe(false);
    expect(funder.createdAt).toBeInstanceOf(Date);
    expect(funder.updatedAt).toBeInstanceOf(Date);
  });

  it('rejects a duplicate funder_code', async () => {
    const code = `FND-${Date.now()}-2`;
    trackFunder(await prisma.funder.create({ data: { funderCode: code, funderName: 'First' } }));

    await expect(
      prisma.funder.create({ data: { funderCode: code, funderName: 'Duplicate' } }),
    ).rejects.toThrow();
  });

  it('rejects a funder without funder_name', async () => {
    await expect(
      // @ts-expect-error — intentionally omitting a required field to verify the DB constraint
      prisma.funder.create({ data: { funderCode: `FND-${Date.now()}-3` } }),
    ).rejects.toThrow();
  });

  it('rejects a funder with an invalid status value', async () => {
    await expect(
      prisma.funder.create({
        data: {
          funderCode: `FND-${Date.now()}-4`,
          funderName: 'Bad Status',
          // @ts-expect-error — intentionally invalid enum value to verify the DB constraint
          status: 'NOT_A_REAL_STATUS',
        },
      }),
    ).rejects.toThrow();
  });

  it('creates a project without a funder_id (funder_id is nullable)', async () => {
    const project = trackProject(
      await prisma.project.create({
        data: {
          projectCode: `PRJ-${Date.now()}-1`,
          projectName: 'No Funder Project',
          financialYear: '2026-27',
          startDate: new Date('2026-04-01'),
        },
      }),
    );

    expect(project.funderId).toBeNull();
    expect(project.status).toBe('ACTIVE');
  });

  it('creates a project linked to a valid funder', async () => {
    const funder = trackFunder(
      await prisma.funder.create({
        data: { funderCode: `FND-${Date.now()}-5`, funderName: 'Linked Funder' },
      }),
    );

    const project = trackProject(
      await prisma.project.create({
        data: {
          funderId: funder.funderId,
          projectCode: `PRJ-${Date.now()}-2`,
          projectName: 'Linked Project',
          financialYear: '2026-27',
          startDate: new Date('2026-04-01'),
        },
      }),
    );

    expect(project.funderId).toBe(funder.funderId);
  });

  it('rejects a project with a non-existent funder_id', async () => {
    await expect(
      prisma.project.create({
        data: {
          funderId: '00000000-0000-0000-0000-000000000000',
          projectCode: `PRJ-${Date.now()}-3`,
          projectName: 'Orphan Project',
          financialYear: '2026-27',
          startDate: new Date('2026-04-01'),
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a duplicate project_code', async () => {
    const code = `PRJ-${Date.now()}-4`;
    trackProject(
      await prisma.project.create({
        data: {
          projectCode: code,
          projectName: 'First',
          financialYear: '2026-27',
          startDate: new Date('2026-04-01'),
        },
      }),
    );

    await expect(
      prisma.project.create({
        data: {
          projectCode: code,
          projectName: 'Duplicate',
          financialYear: '2026-27',
          startDate: new Date('2026-04-01'),
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a project with an invalid status value', async () => {
    await expect(
      prisma.project.create({
        data: {
          projectCode: `PRJ-${Date.now()}-5`,
          projectName: 'Bad Status',
          financialYear: '2026-27',
          startDate: new Date('2026-04-01'),
          // @ts-expect-error — intentionally invalid enum value to verify the DB constraint
          status: 'NOT_A_REAL_STATUS',
        },
      }),
    ).rejects.toThrow();
  });

  it('creates a project without an end_date (end_date is nullable)', async () => {
    const project = trackProject(
      await prisma.project.create({
        data: {
          projectCode: `PRJ-${Date.now()}-6`,
          projectName: 'Open Ended Project',
          financialYear: '2026-27',
          startDate: new Date('2026-04-01'),
        },
      }),
    );

    expect(project.endDate).toBeNull();
  });

  it('soft-deletes a funder without hard-deleting the row', async () => {
    const funder = trackFunder(
      await prisma.funder.create({
        data: { funderCode: `FND-${Date.now()}-6`, funderName: 'Soft Delete Me' },
      }),
    );

    const softDeleted = await prisma.funder.update({
      where: { funderId: funder.funderId },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    expect(softDeleted.isDeleted).toBe(true);
    expect(softDeleted.deletedAt).toBeInstanceOf(Date);

    const stillPresent = await prisma.funder.findUnique({ where: { funderId: funder.funderId } });
    expect(stillPresent).not.toBeNull();
  });
});
