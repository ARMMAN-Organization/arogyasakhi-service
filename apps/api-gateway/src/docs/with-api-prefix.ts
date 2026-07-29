/**
 * Appends `/api/v1` to a base URL exactly once. `PUBLIC_BASE_URLS` is
 * configured inconsistently across this platform's deployed environments —
 * some already include the `/api/v1` suffix, some don't — so this strips any
 * trailing slash and existing `/api/v1` before appending, rather than
 * assuming one convention and risking a doubled path like
 * `.../api/v1/api/v1` in the Servers dropdown.
 *
 * Kept in its own module (no dependency on `app-config.ts`) so it can be
 * unit-tested without triggering that module's env-var validation, which
 * calls `process.exit(1)` at import time when required vars are absent
 * (e.g. in a CI job that never sources a `.env` file).
 */
export function withApiPrefix(url: string): string {
  const trimmed = url.replace(/\/+$/, '');
  return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`;
}
