/**
 * Ceiling for a single downstream HTTP hop from Quick Response's clients.
 * getCardDetail() can chain up to ~5 of these sequentially per card; without
 * a bound here, a saturated downstream service leaves the caller hanging
 * until the client's own 30s timeout instead of failing fast with a 502.
 */
export const DOWNSTREAM_FETCH_TIMEOUT_MS = 8_000;
