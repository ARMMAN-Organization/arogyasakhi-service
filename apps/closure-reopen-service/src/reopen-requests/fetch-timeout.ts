/**
 * Ceiling for a single downstream HTTP hop from a reopen-request client.
 * Without a bound here, a saturated downstream service (e.g. beneficiary-
 * service) leaves the caller hanging until its own default timeout instead
 * of failing fast with a 502.
 */
export const DOWNSTREAM_FETCH_TIMEOUT_MS = 20_000;
