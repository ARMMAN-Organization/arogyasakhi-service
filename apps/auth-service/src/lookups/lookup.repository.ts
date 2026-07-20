import type { PrismaService } from '../prisma/prisma.service';
import type { CreateLookupValueInput } from './dto/create-lookup-value.dto';
import type { UpdateLookupValueInput } from './dto/update-lookup-value.dto';

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
}
