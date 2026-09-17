import type { Options } from 'pino-http';

// Decrypted PII field names that must never reach a log line — e.g. if a
// handler ever logs a decrypted BeneficiaryPii-derived object (see
// libs/service-commons/src/crypto/pii-crypto.ts) via `req.log.info({...})`.
// pino-http's default req/res serializers (pino-std-serializers) carry no
// `body` field at all — this codebase doesn't log request/response bodies
// today (per CLAUDE.md §7) — so this is a depth-independent guard for
// whatever object shape a future log call passes, not a redaction of an
// existing body-logging path. Matched against the LAST path segment only.
const PII_FIELD_NAME_PATTERN =
  /^(full_?name|phone(_?number)?|alternate_?phone|address(_?line)?|rch_?number|date_?of_?birth|dob)$/i;

const REDACTED = '[Redacted]';

/**
 * Recursively replaces any object key matching {@link PII_FIELD_NAME_PATTERN}
 * with a redaction marker. Depth-independent — unlike fast-redact's `*`
 * wildcard (used below for `req.headers`/`req.body`), which only matches one
 * exact path segment and can't reach a field nested at an arbitrary depth
 * (e.g. `data.beneficiary.fullName`). Callers should run any object that may
 * contain decrypted PII through this before passing it to `logger.info(...)`
 * or similar.
 */
export function redactPiiFields(value: unknown, depth = 0): unknown {
  if (depth > 10 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redactPiiFields(item, depth + 1));

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    result[key] = PII_FIELD_NAME_PATTERN.test(key) ? REDACTED : redactPiiFields(val, depth + 1);
  }
  return result;
}

/**
 * pino-http options for all services. Emits structured JSON, attaches the
 * request id, and redacts sensitive fields so PII/tokens are never logged.
 */
export function buildLoggerOptions(level: string): Options {
  return {
    level,
    autoLogging: true,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
        'req.body.token',
        '*.pii',
        // Named PII fields, in case a future change starts logging request
        // bodies — fast-redact's `*` matches exactly one path segment, so
        // these only cover a field at the top of req.body, same depth as
        // the password/token paths above. Nested PII needs redactPiiFields.
        'req.body.fullName',
        'req.body.phone',
        'req.body.phoneNumber',
        'req.body.alternatePhone',
        'req.body.address',
        'req.body.addressLine',
        'req.body.rchNumber',
        'req.body.dateOfBirth',
        'req.body.dob',
      ],
      remove: true,
    },
    customProps: (req) => ({ requestId: req.headers['x-request-id'] }),
  };
}
