import { PrismaService } from './prisma.service';

/**
 * Verifies the geography_units migration itself (self-referencing hierarchy,
 * composite unique constraint, FK behaviour) — there is no API layer for this
 * domain yet, so these tests exercise the Prisma client directly against the
 * real schema. Scoped to the SRS's 7-level hierarchy only (State > District >
 * Block > PHC > Sub-centre > Village > Pada) — no Taluka, no Panchayat.
 */
describe('geography schema (geography_units)', () => {
  const prisma = new PrismaService();
  const createdIds: string[] = [];

  beforeAll(async () => {
    await prisma.connect();
  });

  afterAll(async () => {
    // Single batched delete — onDelete: SetNull means order doesn't matter,
    // and one round trip avoids Jest's default per-hook timeout.
    await prisma.geographyUnit.deleteMany({ where: { geographyUnitId: { in: createdIds } } });
    await prisma.disconnect();
  }, 20000);

  function track<T extends { geographyUnitId: string }>(row: T): T {
    createdIds.push(row.geographyUnitId);
    return row;
  }

  it('creates a root unit (STATE) with no parent', async () => {
    const state = track(
      await prisma.geographyUnit.create({
        data: { geoType: 'STATE', name: `Maharashtra-${Date.now()}` },
      }),
    );

    expect(state.parentId).toBeNull();
    expect(state.status).toBe('ACTIVE');
    expect(state.isDeleted).toBe(false);
  });

  it('builds a full 7-level chain, each linked to its parent', async () => {
    const suffix = Date.now();
    const state = track(
      await prisma.geographyUnit.create({ data: { geoType: 'STATE', name: `State-${suffix}` } }),
    );
    const district = track(
      await prisma.geographyUnit.create({
        data: { geoType: 'DISTRICT', name: `District-${suffix}`, parentId: state.geographyUnitId },
      }),
    );
    const block = track(
      await prisma.geographyUnit.create({
        data: { geoType: 'BLOCK', name: `Block-${suffix}`, parentId: district.geographyUnitId },
      }),
    );
    const phc = track(
      await prisma.geographyUnit.create({
        data: { geoType: 'PHC', name: `PHC-${suffix}`, parentId: block.geographyUnitId },
      }),
    );
    const subcentre = track(
      await prisma.geographyUnit.create({
        data: { geoType: 'SUBCENTRE', name: `Subcentre-${suffix}`, parentId: phc.geographyUnitId },
      }),
    );
    const village = track(
      await prisma.geographyUnit.create({
        data: {
          geoType: 'VILLAGE',
          name: `Village-${suffix}`,
          parentId: subcentre.geographyUnitId,
        },
      }),
    );
    const pada = track(
      await prisma.geographyUnit.create({
        data: { geoType: 'PADA', name: `Pada-${suffix}`, parentId: village.geographyUnitId },
      }),
    );

    expect(pada.parentId).toBe(village.geographyUnitId);
    expect(village.parentId).toBe(subcentre.geographyUnitId);
    expect(subcentre.parentId).toBe(phc.geographyUnitId);
    expect(phc.parentId).toBe(block.geographyUnitId);
    expect(block.parentId).toBe(district.geographyUnitId);
    expect(district.parentId).toBe(state.geographyUnitId);
    // 7 sequential round trips to the remote DB — needs more than Jest's default 5s.
  }, 20000);

  it('rejects an invalid geo_type value', async () => {
    await expect(
      prisma.geographyUnit.create({
        // @ts-expect-error — intentionally invalid enum value to verify the DB constraint
        data: { geoType: 'TALUKA', name: 'Should Not Exist' },
      }),
    ).rejects.toThrow();
  });

  it('rejects a parent_id pointing at a non-existent unit', async () => {
    await expect(
      prisma.geographyUnit.create({
        data: {
          geoType: 'DISTRICT',
          name: 'Orphan District',
          parentId: '00000000-0000-0000-0000-000000000000',
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a duplicate (parent_id, geo_type, geo_code) when geo_code is set', async () => {
    const state = track(
      await prisma.geographyUnit.create({
        data: { geoType: 'STATE', name: `State-${Date.now()}` },
      }),
    );
    const code = `PLG-${Date.now()}`;
    track(
      await prisma.geographyUnit.create({
        data: {
          geoType: 'DISTRICT',
          name: 'Palghar',
          parentId: state.geographyUnitId,
          geoCode: code,
        },
      }),
    );

    await expect(
      prisma.geographyUnit.create({
        data: {
          geoType: 'DISTRICT',
          name: 'Palghar Duplicate',
          parentId: state.geographyUnitId,
          geoCode: code,
        },
      }),
    ).rejects.toThrow();
  });

  it('allows multiple units under the same parent+type with a NULL geo_code', async () => {
    const state = track(
      await prisma.geographyUnit.create({
        data: { geoType: 'STATE', name: `State-${Date.now()}` },
      }),
    );

    const first = track(
      await prisma.geographyUnit.create({
        data: { geoType: 'DISTRICT', name: 'District A', parentId: state.geographyUnitId },
      }),
    );
    const second = track(
      await prisma.geographyUnit.create({
        data: { geoType: 'DISTRICT', name: 'District B', parentId: state.geographyUnitId },
      }),
    );

    expect(first.geoCode).toBeNull();
    expect(second.geoCode).toBeNull();
  });

  it('soft-deletes a unit without hard-deleting the row', async () => {
    const unit = track(
      await prisma.geographyUnit.create({
        data: { geoType: 'STATE', name: `Soft Delete Me-${Date.now()}` },
      }),
    );

    const softDeleted = await prisma.geographyUnit.update({
      where: { geographyUnitId: unit.geographyUnitId },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    expect(softDeleted.isDeleted).toBe(true);
    expect(softDeleted.deletedAt).toBeInstanceOf(Date);

    const stillPresent = await prisma.geographyUnit.findUnique({
      where: { geographyUnitId: unit.geographyUnitId },
    });
    expect(stillPresent).not.toBeNull();
  });
});
