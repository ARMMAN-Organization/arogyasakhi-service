import {
  signInternalIdentity,
  verifyInternalIdentitySignature,
} from './internal-identity-signature';

const SECRET = 'test-shared-secret';
const FIELDS = {
  userId: 'user-1',
  roles: 'SAKHI,SUPERVISOR',
  projectId: 'project-1',
  geographyUnitId: 'geo-1',
};

describe('signInternalIdentity / verifyInternalIdentitySignature', () => {
  it('verifies a signature the same secret and fields just signed', () => {
    const signature = signInternalIdentity(FIELDS, SECRET);
    expect(verifyInternalIdentitySignature(signature, FIELDS, SECRET)).toBe(true);
  });

  it('rejects when the secret differs', () => {
    const signature = signInternalIdentity(FIELDS, SECRET);
    expect(verifyInternalIdentitySignature(signature, FIELDS, 'wrong-secret')).toBe(false);
  });

  it('rejects when any field differs from what was signed (userId tampered)', () => {
    const signature = signInternalIdentity(FIELDS, SECRET);
    expect(
      verifyInternalIdentitySignature(signature, { ...FIELDS, userId: 'someone-else' }, SECRET),
    ).toBe(false);
  });

  it('rejects when roles are tampered (privilege escalation attempt)', () => {
    const signature = signInternalIdentity(FIELDS, SECRET);
    expect(verifyInternalIdentitySignature(signature, { ...FIELDS, roles: 'ADMIN' }, SECRET)).toBe(
      false,
    );
  });

  it('rejects an undefined signature', () => {
    expect(verifyInternalIdentitySignature(undefined, FIELDS, SECRET)).toBe(false);
  });

  it('rejects a malformed signature with no separator', () => {
    expect(verifyInternalIdentitySignature('not-a-valid-signature', FIELDS, SECRET)).toBe(false);
  });

  it('rejects a signature with a non-numeric timestamp', () => {
    expect(verifyInternalIdentitySignature('not-a-number.abc123', FIELDS, SECRET)).toBe(false);
  });

  it('rejects an expired signature (older than the max age window)', () => {
    const oldTimestamp = Date.now() - 60_000; // 60s ago, past the 30s window
    const staleSignature = signInternalIdentity(FIELDS, SECRET).replace(
      /^\d+/,
      String(oldTimestamp),
    );
    expect(verifyInternalIdentitySignature(staleSignature, FIELDS, SECRET)).toBe(false);
  });

  it('rejects a signature whose mac has a different length than expected', () => {
    expect(verifyInternalIdentitySignature(`${Date.now()}.deadbeef`, FIELDS, SECRET)).toBe(false);
  });

  it('produces different signatures for different signing calls (timestamp changes)', async () => {
    const first = signInternalIdentity(FIELDS, SECRET);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = signInternalIdentity(FIELDS, SECRET);
    expect(first).not.toBe(second);
    expect(verifyInternalIdentitySignature(first, FIELDS, SECRET)).toBe(true);
    expect(verifyInternalIdentitySignature(second, FIELDS, SECRET)).toBe(true);
  });
});
