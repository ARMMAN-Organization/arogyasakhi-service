import { PrismaService } from './prisma.service';

/**
 * Verifies the form_definitions / form_versions migration itself (unique
 * form_code, versioning constraint, FK behaviour) — there is no API layer for
 * this domain yet, so these tests exercise the Prisma client directly against
 * the real schema.
 */
describe('form schema (form_definitions, form_versions)', () => {
  const prisma = new PrismaService();
  const definitionIds: string[] = [];
  const versionIds: string[] = [];
  const checksum = Buffer.alloc(32, 1);

  beforeAll(async () => {
    await prisma.connect();
  });

  afterAll(async () => {
    await prisma.formVersion.deleteMany({ where: { id: { in: versionIds } } });
    await prisma.formDefinition.deleteMany({ where: { id: { in: definitionIds } } });
    await prisma.disconnect();
  }, 20000);

  function trackDefinition<T extends { id: string }>(row: T): T {
    definitionIds.push(row.id);
    return row;
  }

  function trackVersion<T extends { id: string }>(row: T): T {
    versionIds.push(row.id);
    return row;
  }

  it('creates a form definition with required fields', async () => {
    const definition = trackDefinition(
      await prisma.formDefinition.create({
        data: {
          formCode: `ANC_VISIT-${Date.now()}`,
          formName: 'ANC Visit',
          entityType: 'MOTHER',
          status: 'DRAFT',
        },
      }),
    );

    expect(definition.status).toBe('DRAFT');
    expect(definition.isDeleted).toBe(false);
  });

  it('rejects a duplicate form_code', async () => {
    const formCode = `DUPLICATE_CODE-${Date.now()}`;
    trackDefinition(
      await prisma.formDefinition.create({
        data: { formCode, formName: 'First', entityType: 'CHILD', status: 'DRAFT' },
      }),
    );

    await expect(
      prisma.formDefinition.create({
        data: { formCode, formName: 'Second', entityType: 'CHILD', status: 'DRAFT' },
      }),
    ).rejects.toThrow();
  });

  it('soft-deletes a form definition without hard-deleting the row', async () => {
    const definition = trackDefinition(
      await prisma.formDefinition.create({
        data: {
          formCode: `SOFT_DELETE_ME-${Date.now()}`,
          formName: 'Soft Delete Me',
          entityType: 'SYSTEM',
          status: 'DRAFT',
        },
      }),
    );

    const softDeleted = await prisma.formDefinition.update({
      where: { id: definition.id },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    expect(softDeleted.isDeleted).toBe(true);
    expect(softDeleted.deletedAt).toBeInstanceOf(Date);

    const stillPresent = await prisma.formDefinition.findUnique({ where: { id: definition.id } });
    expect(stillPresent).not.toBeNull();
  });

  it('creates a form version under a valid form_definition_id', async () => {
    const definition = trackDefinition(
      await prisma.formDefinition.create({
        data: {
          formCode: `PARENT_FOR_VERSION-${Date.now()}`,
          formName: 'Parent',
          entityType: 'MOTHER',
          status: 'DRAFT',
        },
      }),
    );

    const version = trackVersion(
      await prisma.formVersion.create({
        data: {
          formDefinitionId: definition.id,
          versionNo: 'v1',
          schemaJson: { question_code: 'phone_owner' },
          effectiveFrom: new Date(),
          status: 'DRAFT',
          checksum,
        },
      }),
    );

    expect(version.formDefinitionId).toBe(definition.id);
  });

  it('rejects a form version with a non-existent form_definition_id', async () => {
    await expect(
      prisma.formVersion.create({
        data: {
          formDefinitionId: '00000000-0000-0000-0000-000000000000',
          versionNo: 'v1',
          schemaJson: {},
          effectiveFrom: new Date(),
          status: 'DRAFT',
          checksum,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a duplicate (form_definition_id, version_no)', async () => {
    const definition = trackDefinition(
      await prisma.formDefinition.create({
        data: {
          formCode: `DUP_VERSION_PARENT-${Date.now()}`,
          formName: 'Dup Version Parent',
          entityType: 'MOTHER',
          status: 'DRAFT',
        },
      }),
    );
    trackVersion(
      await prisma.formVersion.create({
        data: {
          formDefinitionId: definition.id,
          versionNo: 'v1',
          schemaJson: {},
          effectiveFrom: new Date(),
          status: 'DRAFT',
          checksum,
        },
      }),
    );

    await expect(
      prisma.formVersion.create({
        data: {
          formDefinitionId: definition.id,
          versionNo: 'v1',
          schemaJson: {},
          effectiveFrom: new Date(),
          status: 'DRAFT',
          checksum,
        },
      }),
    ).rejects.toThrow();
  });

  it('allows the same version_no across different form_definition_ids', async () => {
    const first = trackDefinition(
      await prisma.formDefinition.create({
        data: {
          formCode: `SHARED_VERSION_A-${Date.now()}`,
          formName: 'Shared Version A',
          entityType: 'MOTHER',
          status: 'DRAFT',
        },
      }),
    );
    const second = trackDefinition(
      await prisma.formDefinition.create({
        data: {
          formCode: `SHARED_VERSION_B-${Date.now()}`,
          formName: 'Shared Version B',
          entityType: 'CHILD',
          status: 'DRAFT',
        },
      }),
    );

    trackVersion(
      await prisma.formVersion.create({
        data: {
          formDefinitionId: first.id,
          versionNo: 'v1',
          schemaJson: {},
          effectiveFrom: new Date(),
          status: 'DRAFT',
          checksum,
        },
      }),
    );
    const secondVersion = trackVersion(
      await prisma.formVersion.create({
        data: {
          formDefinitionId: second.id,
          versionNo: 'v1',
          schemaJson: {},
          effectiveFrom: new Date(),
          status: 'DRAFT',
          checksum,
        },
      }),
    );

    expect(secondVersion.versionNo).toBe('v1');
  });

  it('rejects a form version missing a checksum', async () => {
    const definition = trackDefinition(
      await prisma.formDefinition.create({
        data: {
          formCode: `NO_CHECKSUM_PARENT-${Date.now()}`,
          formName: 'No Checksum Parent',
          entityType: 'MOTHER',
          status: 'DRAFT',
        },
      }),
    );

    await expect(
      prisma.formVersion.create({
        data: {
          formDefinitionId: definition.id,
          versionNo: 'v1',
          schemaJson: {},
          effectiveFrom: new Date(),
          status: 'DRAFT',
          // @ts-expect-error — intentionally omitted required checksum
          checksum: undefined,
        },
      }),
    ).rejects.toThrow();
  });
});
