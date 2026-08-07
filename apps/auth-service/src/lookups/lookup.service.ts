import { conflict, notFound, unprocessable } from '@armman/service-commons';
import type { LookupRepository } from './lookup.repository';
import type { CreateLookupValueInput } from './dto/create-lookup-value.dto';
import type { UpdateLookupValueInput } from './dto/update-lookup-value.dto';
import type { BulkUpsertLookupValuesInput } from './dto/bulk-upsert-lookup-values.dto';

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

  /**
   * Reconciles a category's values against a target list in one call —
   * e.g. an environment whose lookup master data has drifted from the
   * current form schema. Additive/updating only: a valueCode absent from
   * the category is created, one present with a different valueLabel/
   * sortOrder/parentLookupValueId is updated, and a valueCode already
   * matching exactly is left as a no-op write. Existing values not
   * mentioned in the payload are never touched or removed.
   */
  async bulkUpsertValues(categoryCode: string, input: BulkUpsertLookupValuesInput) {
    const category = await this.repository.findCategoryByCode(categoryCode);
    if (!category) throw notFound('Lookup category not found.');

    const existingValues = await this.repository.findValuesByCategoryId(category.id);
    const existingByCode = new Map(
      existingValues.map((v) => [(v as { valueCode: string }).valueCode, v]),
    );

    for (const item of input.values) {
      if (item.parentLookupValueId) {
        const parent = await this.repository.findValueById(item.parentLookupValueId);
        if (!parent || parent.lookupCategoryId !== category.id) {
          throw unprocessable('parentLookupValueId must belong to the same lookup category.');
        }
      }
    }

    const toCreate: BulkUpsertLookupValuesInput['values'] = [];
    const toUpdate: { id: string; data: BulkUpsertLookupValuesInput['values'][number] }[] = [];
    const unchanged: string[] = [];

    for (const item of input.values) {
      const existing = existingByCode.get(item.valueCode) as
        | { id: string; valueLabel: string; sortOrder: number; parentLookupValueId: string | null }
        | undefined;

      if (!existing) {
        toCreate.push(item);
        continue;
      }

      const isUnchanged =
        existing.valueLabel === item.valueLabel &&
        (item.sortOrder === undefined || existing.sortOrder === item.sortOrder) &&
        (item.parentLookupValueId === undefined ||
          existing.parentLookupValueId === item.parentLookupValueId);

      if (isUnchanged) {
        unchanged.push(item.valueCode);
      } else {
        toUpdate.push({ id: existing.id, data: item });
      }
    }

    if (toCreate.length > 0 || toUpdate.length > 0) {
      await this.repository.bulkUpsertValues(category.id, toCreate, toUpdate);
    }

    return {
      created: toCreate.map((v) => v.valueCode),
      updated: toUpdate.map((v) => v.data.valueCode),
      unchanged,
    };
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
