import type { PrismaService } from '../prisma/prisma.service';
import type { CreateLookupValueInput } from './dto/create-lookup-value.dto';
import type { UpdateLookupValueInput } from './dto/update-lookup-value.dto';
import type { BulkUpsertLookupValuesInput } from './dto/bulk-upsert-lookup-values.dto';

/** Data access for lookup categories/values master data. */
export class LookupRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllCategoriesWithValues() {
    return this.prisma.lookupCategory.findMany({
      where: { isActive: true },
      orderBy: { categoryName: 'asc' },
      include: { values: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  findCategoryByCode(categoryCode: string) {
    return this.prisma.lookupCategory.findFirst({
      where: { categoryCode, isActive: true },
      include: { values: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  findValueById(id: string) {
    return this.prisma.lookupValue.findUnique({ where: { id } });
  }

  createValue(lookupCategoryId: string, data: CreateLookupValueInput) {
    return this.prisma.lookupValue.create({
      data: {
        lookupCategoryId,
        valueCode: data.valueCode,
        valueLabel: data.valueLabel,
        sortOrder: data.sortOrder ?? 0,
        parentLookupValueId: data.parentLookupValueId ?? null,
      },
    });
  }

  async updateValue(id: string, data: UpdateLookupValueInput) {
    const existing = await this.prisma.lookupValue.findUnique({ where: { id } });
    if (!existing) return null;

    return this.prisma.lookupValue.update({ where: { id }, data });
  }

  findValuesByCategoryId(lookupCategoryId: string) {
    return this.prisma.lookupValue.findMany({ where: { lookupCategoryId } });
  }

  /**
   * Creates/updates a category's values in one transaction — all-or-nothing,
   * so a failure partway through never leaves a half-reconciled category.
   * `toCreate`/`toUpdate` are pre-split by the caller (bulkUpsertValues in
   * lookup.service.ts) since deciding new-vs-existing needs a case-
   * insensitive-by-valueCode lookup the repository shouldn't own.
   */
  bulkUpsertValues(
    lookupCategoryId: string,
    toCreate: BulkUpsertLookupValuesInput['values'],
    toUpdate: { id: string; data: BulkUpsertLookupValuesInput['values'][number] }[],
  ) {
    return this.prisma.$transaction([
      ...toCreate.map((data) =>
        this.prisma.lookupValue.create({
          data: {
            lookupCategoryId,
            valueCode: data.valueCode,
            valueLabel: data.valueLabel,
            sortOrder: data.sortOrder ?? 0,
            parentLookupValueId: data.parentLookupValueId ?? null,
          },
        }),
      ),
      ...toUpdate.map(({ id, data }) =>
        this.prisma.lookupValue.update({
          where: { id },
          data: {
            valueLabel: data.valueLabel,
            ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
            ...(data.parentLookupValueId !== undefined && {
              parentLookupValueId: data.parentLookupValueId,
            }),
          },
        }),
      ),
    ]);
  }
}
