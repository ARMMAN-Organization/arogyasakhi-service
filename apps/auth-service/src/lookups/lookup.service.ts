import { conflict, notFound, unprocessable } from '@armman/service-commons';
import type { LookupRepository } from './lookup.repository';
import type { CreateLookupValueInput } from './dto/create-lookup-value.dto';
import type { UpdateLookupValueInput } from './dto/update-lookup-value.dto';

/** Prisma unique-constraint violation code (valueCode within a category). */
const PRISMA_UNIQUE_CONSTRAINT_CODE = 'P2002';

/**
 * Lookup category/value responses are projected to EXACTLY the fields the API
 * documents (lookupCategorySchema/lookupValueSchema in lookup.controller.ts)
 * so internal audit columns (createdByUserId, updatedByUserId, createdAt,
 * updatedAt) — and, on values, lookupCategoryId — never leak into a response.
 */
function toApiLookupValue(v: Record<string, unknown>) {
  return {
    id: v.id,
    valueCode: v.valueCode,
    valueLabel: v.valueLabel,
    sortOrder: v.sortOrder,
    parentLookupValueId: v.parentLookupValueId,
    isActive: v.isActive,
  };
}

function toApiLookupCategory(c: Record<string, unknown>) {
  const values = (c.values as Record<string, unknown>[] | undefined) ?? [];
  return {
    id: c.id,
    categoryCode: c.categoryCode,
    categoryName: c.categoryName,
    description: c.description,
    isActive: c.isActive,
    values: values.map(toApiLookupValue),
  };
}

/** Business logic for lookup categories/values master data. */
export class LookupService {
  constructor(private readonly repository: LookupRepository) {}

  async listAll() {
    const categories = await this.repository.findAllCategoriesWithValues();
    return categories.map((c) => toApiLookupCategory(c as unknown as Record<string, unknown>));
  }

  async getByCategoryCode(categoryCode: string) {
    const category = await this.repository.findCategoryByCode(categoryCode);
    if (!category) throw notFound('Lookup category not found.');
    return toApiLookupCategory(category as unknown as Record<string, unknown>);
  }

  async createValue(categoryCode: string, input: CreateLookupValueInput) {
    const category = await this.repository.findCategoryByCode(categoryCode);
    if (!category) throw notFound('Lookup category not found.');

    if (input.parentLookupValueId) {
      const parent = await this.repository.findValueById(input.parentLookupValueId);
      if (!parent || parent.lookupCategoryId !== category.id) {
        throw unprocessable('parentLookupValueId must belong to the same lookup category.');
      }
    }

    try {
      const created = await this.repository.createValue(category.id, input);
      return toApiLookupValue(created as unknown as Record<string, unknown>);
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        throw conflict('A value with this code already exists in this category.');
      }
      throw err;
    }
  }

  async updateValue(id: string, input: UpdateLookupValueInput) {
    if (input.parentLookupValueId) {
      const [existing, parent] = await Promise.all([
        this.repository.findValueById(id),
        this.repository.findValueById(input.parentLookupValueId),
      ]);
      if (existing && (!parent || parent.lookupCategoryId !== existing.lookupCategoryId)) {
        throw unprocessable('parentLookupValueId must belong to the same lookup category.');
      }
    }

    const updated = await this.repository.updateValue(id, input);
    if (!updated) throw notFound('Lookup value not found.');
    return toApiLookupValue(updated as unknown as Record<string, unknown>);
  }
}

/** Narrows a caught Prisma error to a unique-constraint violation (P2002). */
function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === PRISMA_UNIQUE_CONSTRAINT_CODE
  );
}
