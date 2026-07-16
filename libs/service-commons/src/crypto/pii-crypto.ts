import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function loadKey(envVar: string): Buffer {
  const value = process.env[envVar];
  if (!value) {
    throw new Error(`${envVar} is not set — PII encryption/hashing cannot proceed.`);
  }
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) {
    throw new Error(`${envVar} must decode to exactly 32 bytes (AES-256); got ${key.length}.`);
  }
  return key;
}

/**
 * Encrypts PII for at-rest storage in a `_enc` column (AES-256-GCM). The
 * returned buffer is a self-contained envelope — IV, then ciphertext, then
 * auth tag — so no separate IV column is needed on the table.
 */
export function encryptPii(plaintext: string): Buffer {
  const key = loadKey('PII_ENCRYPTION_KEY');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, authTag]);
}

const MIN_ENVELOPE_LENGTH = IV_LENGTH + AUTH_TAG_LENGTH;

/** Decrypts a buffer produced by {@link encryptPii}. Throws if the key is wrong or the data was tampered with. */
export function decryptPii(envelope: Buffer): string {
  if (envelope.length < MIN_ENVELOPE_LENGTH) {
    throw new Error(
      `decryptPii: envelope is too short (${envelope.length} bytes; need at least ${MIN_ENVELOPE_LENGTH}) — data is truncated or was never encrypted with encryptPii().`,
    );
  }
  const key = loadKey('PII_ENCRYPTION_KEY');
  const iv = envelope.subarray(0, IV_LENGTH);
  const authTag = envelope.subarray(envelope.length - AUTH_TAG_LENGTH);
  const ciphertext = envelope.subarray(IV_LENGTH, envelope.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Normalizes free-text PII before hashing for duplicate-search tokens:
 * lowercase, trim, collapse internal whitespace, strip punctuation. Ensures
 * "Jane   Doe" and "jane doe" produce the same search token.
 */
export function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ');
}

/**
 * Produces a non-reversible, deterministic search token (HMAC-SHA256) for
 * duplicate detection without decrypting PII. Callers should normalize
 * free-text input with {@link normalizeForSearch} first; date-shaped tokens
 * (DOB, LMP) should be passed as ISO date strings instead.
 */
export function hashForSearch(normalizedValue: string): Buffer {
  const key = loadKey('PII_SEARCH_HASH_KEY');
  return createHmac('sha256', key).update(normalizedValue, 'utf8').digest();
}
