import { randomBytes } from 'node:crypto';
import { decryptPii, encryptPii, hashForSearch, normalizeForSearch } from './pii-crypto';

describe('pii-crypto', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    process.env.PII_SEARCH_HASH_KEY = randomBytes(32).toString('base64');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('encryptPii / decryptPii', () => {
    it('round-trips a plaintext string', () => {
      const ciphertext = encryptPii('Jane Doe');
      expect(decryptPii(ciphertext)).toBe('Jane Doe');
    });

    it('produces different ciphertexts for the same plaintext (random IV)', () => {
      const a = encryptPii('Jane Doe');
      const b = encryptPii('Jane Doe');
      expect(a.equals(b)).toBe(false);
      expect(decryptPii(a)).toBe('Jane Doe');
      expect(decryptPii(b)).toBe('Jane Doe');
    });

    it('fails to decrypt with a different key', () => {
      const ciphertext = encryptPii('Jane Doe');
      process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
      expect(() => decryptPii(ciphertext)).toThrow();
    });

    it('throws a clear error when PII_ENCRYPTION_KEY is unset', () => {
      delete process.env.PII_ENCRYPTION_KEY;
      expect(() => encryptPii('Jane Doe')).toThrow('PII_ENCRYPTION_KEY');
    });
  });

  describe('hashForSearch', () => {
    it('is deterministic for the same input', () => {
      const a = hashForSearch('jane doe');
      const b = hashForSearch('jane doe');
      expect(a.equals(b)).toBe(true);
    });

    it('produces different hashes for different inputs', () => {
      const a = hashForSearch('jane doe');
      const b = hashForSearch('john doe');
      expect(a.equals(b)).toBe(false);
    });

    it('throws a clear error when PII_SEARCH_HASH_KEY is unset', () => {
      delete process.env.PII_SEARCH_HASH_KEY;
      expect(() => hashForSearch('jane doe')).toThrow('PII_SEARCH_HASH_KEY');
    });
  });

  describe('normalizeForSearch', () => {
    it('lowercases, trims, and collapses whitespace', () => {
      expect(normalizeForSearch('  Jane   Doe  ')).toBe('jane doe');
    });

    it('strips punctuation', () => {
      expect(normalizeForSearch("O'Brien-Smith!")).toBe('obriensmith');
    });

    it('produces the same token for equivalent inputs', () => {
      expect(normalizeForSearch('Jane   Doe')).toBe(normalizeForSearch('jane doe'));
    });
  });
});
