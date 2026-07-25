import { updateUserSchema } from './update-user.dto';

describe('updateUserSchema', () => {
  it('rejects an empty body', () => {
    const result = updateUserSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects an unknown field', () => {
    const result = updateUserSchema.safeParse({ displayName: 'X', notAField: true });
    expect(result.success).toBe(false);
  });

  it('accepts displayName alone', () => {
    expect(updateUserSchema.safeParse({ displayName: 'Renamed Sakhi' }).success).toBe(true);
  });

  it('accepts email set to null', () => {
    expect(updateUserSchema.safeParse({ email: null }).success).toBe(true);
  });

  it('rejects an invalid status enum value', () => {
    expect(updateUserSchema.safeParse({ status: 'NOT_A_STATUS' }).success).toBe(false);
  });

  describe('username', () => {
    it('accepts a valid username', () => {
      expect(updateUserSchema.safeParse({ username: 'new.username' }).success).toBe(true);
    });

    it('rejects a username with disallowed characters', () => {
      expect(updateUserSchema.safeParse({ username: 'bad@user' }).success).toBe(false);
    });
  });

  describe('password', () => {
    it('rejects a password shorter than 8 characters', () => {
      expect(updateUserSchema.safeParse({ password: 'short' }).success).toBe(false);
    });

    it('rejects a password longer than 200 characters', () => {
      expect(updateUserSchema.safeParse({ password: 'a'.repeat(201) }).success).toBe(false);
    });

    it('accepts a valid password', () => {
      expect(updateUserSchema.safeParse({ password: 'NewStr0ngPass!' }).success).toBe(true);
    });
  });

  describe('role/project/geography scope', () => {
    it('rejects projectId without roleCode', () => {
      const result = updateUserSchema.safeParse({
        projectId: 'a35c5e7e-83a0-4a2c-9e9b-9b0a4b3c1a11',
      });
      expect(result.success).toBe(false);
    });

    it('rejects geographyUnitId without roleCode', () => {
      const result = updateUserSchema.safeParse({
        geographyUnitId: 'a35c5e7e-83a0-4a2c-9e9b-9b0a4b3c1a11',
      });
      expect(result.success).toBe(false);
    });

    it('rejects roleCode alone with neither projectId nor geographyUnitId', () => {
      expect(updateUserSchema.safeParse({ roleCode: 'SAKHI' }).success).toBe(false);
    });

    it('accepts roleCode with projectId', () => {
      const result = updateUserSchema.safeParse({
        roleCode: 'SAKHI',
        projectId: 'a35c5e7e-83a0-4a2c-9e9b-9b0a4b3c1a11',
      });
      expect(result.success).toBe(true);
    });

    it('accepts roleCode with projectId explicitly cleared to null', () => {
      expect(updateUserSchema.safeParse({ roleCode: 'SAKHI', projectId: null }).success).toBe(true);
    });

    it('rejects a non-UUID projectId', () => {
      expect(
        updateUserSchema.safeParse({ roleCode: 'SAKHI', projectId: 'not-a-uuid' }).success,
      ).toBe(false);
    });
  });

  describe('Sakhi profile fields', () => {
    it('accepts employeeCode alone', () => {
      expect(updateUserSchema.safeParse({ employeeCode: 'EMP-00999' }).success).toBe(true);
    });

    it('rejects an invalid phoneNumber format', () => {
      expect(updateUserSchema.safeParse({ phoneNumber: '9876543210' }).success).toBe(false);
    });

    it('accepts backupContact set to null', () => {
      expect(updateUserSchema.safeParse({ backupContact: null }).success).toBe(true);
    });

    it('rejects activeTo before activeFrom', () => {
      const result = updateUserSchema.safeParse({
        activeFrom: '2026-06-01',
        activeTo: '2026-01-01',
      });
      expect(result.success).toBe(false);
    });

    it('accepts activeTo on or after activeFrom', () => {
      const result = updateUserSchema.safeParse({
        activeFrom: '2026-01-01',
        activeTo: '2026-06-01',
      });
      expect(result.success).toBe(true);
    });

    it('accepts activeTo set to null with no activeFrom comparison', () => {
      expect(updateUserSchema.safeParse({ activeTo: null }).success).toBe(true);
    });
  });
});
