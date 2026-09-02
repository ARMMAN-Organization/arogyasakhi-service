import { badGateway, forbidden, unauthorized } from '@armman/service-commons';
import { DOWNSTREAM_FETCH_TIMEOUT_MS } from './fetch-timeout';

// Read directly (not via appConfig) — see geography.client.ts for why.
const AUTH_SERVICE_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';

interface LookupValue {
  id: string;
  valueCode: string;
  valueLabel: string;
}

interface LookupCategory {
  categoryCode: string;
  values: LookupValue[];
}

/**
 * Maps a non-ok auth-service response to the right error class: 401/403
 * mean the caller's own token was rejected (stale/expired/invalid) — thrown
 * as such so it surfaces as an auth failure instead of masquerading as an
 * infra outage. Anything else (5xx, unexpected 4xx) is a genuine dependency
 * failure, kept as 502.
 */
function mapLookupFetchError(status: number): Error {
  if (status === 401)
    return unauthorized('Unable to resolve lookup values — the caller is not authenticated.');
  if (status === 403)
    return forbidden('Unable to resolve lookup values — the caller is not authorized.');
  return badGateway('Unable to resolve lookup values — the auth service returned an error.');
}

/**
 * Fetches one lookup category (with all its values) through the gateway,
 * per auth-service's `GET /lookups/:categoryCode`. Used to resolve a
 * socioDemographics *LookupId (a lookup_values.lookup_value_id) into its
 * human-readable valueCode/label for display on GET /beneficiaries/:id —
 * mirrors resolveHealthBlockIdFromPhc's error-mapping stance (network/5xx
 * is a 502 dependency failure, never surfaced as if the category itself
 * were missing).
 */
async function fetchLookupCategory(
  categoryCode: string,
  authorizationHeader: string,
): Promise<LookupCategory | null> {
  let res: Response;
  try {
    res = await fetch(`${AUTH_SERVICE_BASE_URL}/api/v1/lookups/${categoryCode}`, {
      headers: { Authorization: authorizationHeader },
      signal: AbortSignal.timeout(DOWNSTREAM_FETCH_TIMEOUT_MS),
    });
  } catch {
    throw badGateway('Unable to resolve lookup values — the auth service is unreachable.');
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    throw mapLookupFetchError(res.status);
  }

  const body = (await res.json()) as { data: LookupCategory };
  return body.data;
}

/** One resolved lookup value — categoryCode is always the caller-supplied one, even on a miss. */
export interface ResolvedLookupValue {
  categoryCode: string;
  valueCode: string;
  label: string;
}

/**
 * Resolves a set of {fieldKey -> {categoryCode, lookupValueId}} pairs into
 * {fieldKey -> ResolvedLookupValue | null} — null for a field whose
 * lookupValueId was never set, or whose id/category doesn't resolve to a
 * known value (stale/deleted lookup row; not treated as an error, since the
 * beneficiary record itself is still valid). Fetches each distinct
 * categoryCode at most once, regardless of how many fields reference it
 * (e.g. educationLevelLookupId and partnerEducationLevelLookupId both read
 * EDUCATION_LEVEL).
 */
export async function resolveLookupValues(
  requests: Record<string, { categoryCode: string; lookupValueId: string | null }>,
  authorizationHeader: string,
): Promise<Record<string, ResolvedLookupValue | null>> {
  const distinctCategoryCodes = [
    ...new Set(
      Object.values(requests)
        .filter((r) => r.lookupValueId !== null)
        .map((r) => r.categoryCode),
    ),
  ];

  const categories = await Promise.all(
    distinctCategoryCodes.map((code) => fetchLookupCategory(code, authorizationHeader)),
  );
  const categoryByCode = new Map(
    distinctCategoryCodes.map((code, i) => [code, categories[i]] as const),
  );

  const resolved: Record<string, ResolvedLookupValue | null> = {};
  for (const [fieldKey, { categoryCode, lookupValueId }] of Object.entries(requests)) {
    if (lookupValueId === null) {
      resolved[fieldKey] = null;
      continue;
    }
    const category = categoryByCode.get(categoryCode);
    const value = category?.values.find((v) => v.id === lookupValueId);
    resolved[fieldKey] = value
      ? { categoryCode, valueCode: value.valueCode, label: value.valueLabel }
      : null;
  }

  return resolved;
}

/**
 * The inverse of resolveLookupValues: turns a set of
 * {fieldKey -> {categoryCode, valueCode}} pairs into
 * {fieldKey -> lookup_value_id | null}. Used when a caller (visit-form-service
 * forwarding a form submission) supplies the form's own value_code strings and
 * we need the lookup_values id to persist.
 *
 * Matching is case-insensitive and ignores non-alphanumerics, because a form's
 * value_code is generated from the option label
 * (e.g. "10TH Pass" -> "10th_pass") while the seeded lookup value_code is
 * upper-snake ("TENTH_PASS")... which will NOT match by normalisation alone.
 * So a valueCode is matched against the lookup row's valueCode *or* its
 * valueLabel — the label is what both sides ultimately derive from. An
 * unmatchable code resolves to null rather than throwing: one unrecognised
 * dropdown answer must not fail the whole registration.
 */
export async function resolveLookupIdsByValueCode(
  requests: Record<string, { categoryCode: string; valueCode: string | null }>,
  authorizationHeader: string,
): Promise<Record<string, string | null>> {
  const distinctCategoryCodes = [
    ...new Set(
      Object.values(requests)
        .filter((r) => r.valueCode !== null)
        .map((r) => r.categoryCode),
    ),
  ];

  const categories = await Promise.all(
    distinctCategoryCodes.map((code) => fetchLookupCategory(code, authorizationHeader)),
  );
  const categoryByCode = new Map(
    distinctCategoryCodes.map((code, i) => [code, categories[i]] as const),
  );

  const resolved: Record<string, string | null> = {};
  for (const [fieldKey, { categoryCode, valueCode }] of Object.entries(requests)) {
    if (valueCode === null) {
      resolved[fieldKey] = null;
      continue;
    }
    const category = categoryByCode.get(categoryCode);
    const wanted = normaliseForMatch(valueCode);
    const values = category?.values ?? [];

    // Exact on either side first — the common case.
    let match = values.find(
      (v) =>
        normaliseForMatch(v.valueCode) === wanted || normaliseForMatch(v.valueLabel) === wanted,
    );

    // Fallback: the seeded label is a prefix of the form's label. Real case:
    // EDUCATION_LEVEL's seeded "No formal education" vs the form option
    // "No formal education (Never attended school / cannot read or write)".
    // Longest prefix wins so a short generic label can't outrank a more
    // specific one.
    if (!match) {
      const prefixMatches = values
        .filter((v) => {
          const label = normaliseForMatch(v.valueLabel);
          return label.length > 0 && wanted.startsWith(label);
        })
        .sort(
          (a, b) => normaliseForMatch(b.valueLabel).length - normaliseForMatch(a.valueLabel).length,
        );
      match = prefixMatches[0];
    }

    resolved[fieldKey] = match?.id ?? null;
  }

  return resolved;
}

/** Lowercases and strips everything but a-z0-9, so "10TH Pass"/"10th_pass" compare equal. */
function normaliseForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}
