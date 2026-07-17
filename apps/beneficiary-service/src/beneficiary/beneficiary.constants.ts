/**
 * Single source of truth for the beneficiary domain's enum value sets.
 *
 * Each is an `as const` tuple so it can drive everything that needs the same
 * values without repeating the string literals: `z.enum(...)` schemas (which
 * require a readonly string tuple), the derived TypeScript union `type`s used
 * by service/repository interfaces, and any runtime membership checks. Values
 * mirror the Prisma enums in `prisma/schema.prisma` exactly.
 */

export const CASE_TYPES = ['MOTHER', 'CHILD'] as const;
export type CaseType = (typeof CASE_TYPES)[number];

export const BENEFICIARY_STATUSES = [
  'ACTIVE',
  'JOURNEY_COMPLETE',
  'CLOSED',
  'TRANSFERRED',
  'REOPEN_REQUESTED',
] as const;
export type BeneficiaryStatus = (typeof BENEFICIARY_STATUSES)[number];

export const CASE_PHASES = ['ANC', 'DELIVERY', 'PP', 'NN', 'INC', 'CCV', 'CLOSED'] as const;
export type CasePhase = (typeof CASE_PHASES)[number];

export const SUMMARY_PHASES = [
  'REGISTRATION',
  'ANC',
  'DELIVERY',
  'PP',
  'NN',
  'INFANT_FOLLOWUP',
  'CLOSURE',
] as const;
export type SummaryPhase = (typeof SUMMARY_PHASES)[number];

/** Sex value set for a mother/PII record. */
export const MOTHER_SEXES = ['FEMALE', 'MALE', 'OTHER', 'UNKNOWN'] as const;
export type MotherSex = (typeof MOTHER_SEXES)[number];

/** Sex value set for a child record — differs from MOTHER_SEXES (INTERSEX vs UNKNOWN). */
export const CHILD_SEXES = ['FEMALE', 'MALE', 'OTHER', 'INTERSEX'] as const;
export type ChildSex = (typeof CHILD_SEXES)[number];

/**
 * Consent statuses the API accepts/returns. Deliberately the GIVEN/REFUSED
 * subset of Prisma's ConsentStatus enum (which also has WITHDRAWN) — a
 * client never submits or reads WITHDRAWN through these endpoints.
 */
export const API_CONSENT_STATUSES = ['GIVEN', 'REFUSED'] as const;
export type ApiConsentStatus = (typeof API_CONSENT_STATUSES)[number];
