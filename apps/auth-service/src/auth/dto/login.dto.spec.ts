import { loginSchema } from './login.dto';

/**
 * Confirms the API boundary rejects mobile-number-shaped login requests, per
 * SRS FR-S-1.1 — login is username + password only, for every role.
 */
describe('loginSchema', () => {
  it('accepts a username + password payload', () => {
    const result = loginSchema.safeParse({ username: 'test.sakhi', password: 'Test@1234' });
    expect(result.success).toBe(true);
  });

  it('rejects a mobileNumber-based login payload', () => {
    const result = loginSchema.safeParse({ mobileNumber: '+919876543210', password: 'Test@1234' });
    expect(result.success).toBe(false);
  });

  it('rejects a payload with both username and mobileNumber', () => {
    const result = loginSchema.safeParse({
      username: 'test.sakhi',
      mobileNumber: '+919876543210',
      password: 'Test@1234',
    });
    expect(result.success).toBe(false);
  });
});
