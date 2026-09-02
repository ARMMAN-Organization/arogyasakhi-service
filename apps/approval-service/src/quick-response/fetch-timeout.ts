/**
 * Ceiling for a single downstream HTTP hop from Quick Response's clients.
 * getCardDetail() can chain up to ~5 of these sequentially per card; without
 * a bound here, a saturated downstream service leaves the caller hanging
 * until the client's own 30s timeout instead of failing fast with a 502.
 */
export const DOWNSTREAM_FETCH_TIMEOUT_MS = 8_000;

/**
 * Ceiling for a decide() write call specifically — closure-reopen-service's
 * decide flow fans out to further downstream calls of its own (beneficiary
 * reactivate/close, notification, audit), so it needs more headroom than a
 * single read hop. Without this, decide() could time out and return a 502
 * to the caller even though the write completes and commits successfully
 * server-side (the abort doesn't cancel the in-flight downstream request).
 */
export const DOWNSTREAM_DECIDE_TIMEOUT_MS = 20_000;
