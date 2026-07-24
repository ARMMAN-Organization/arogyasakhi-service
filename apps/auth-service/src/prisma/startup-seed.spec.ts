import { seedAdminUsers, seedOnStartup, seedRoles } from './startup-seed';
import type { PrismaService } from './prisma.service';

jest.mock('argon2', () => ({
  hash: jest.fn((plain: string) => Promise.resolve(`hashed(${plain})`)),
}));

describe('startup-seed', () => {
  const originalEnv = { ...process.env };
  let prisma: {
    role: { count: jest.Mock; createMany: jest.Mock; findUniqueOrThrow: jest.Mock };
    user: { findUnique: jest.Mock; create: jest.Mock };
    userRole: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ADMIN;

    prisma = {
      role: {
        count: jest.fn(),
        createMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      userRole: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('seedRoles', () => {
    it('seeds all 4 roles when the roles table is empty', async () => {
      prisma.role.count.mockResolvedValue(0);

      const result = await seedRoles(prisma as unknown as PrismaService);

      expect(prisma.role.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ roleCode: 'SAKHI' }),
          expect.objectContaining({ roleCode: 'SUPERVISOR' }),
          expect.objectContaining({ roleCode: 'MANAGER' }),
          expect.objectContaining({ roleCode: 'ADMIN' }),
        ]),
      });
      expect(result).toMatchObject({ step: 'roles', created: true });
    });

    it('skips when roles already exist', async () => {
      prisma.role.count.mockResolvedValue(4);

      const result = await seedRoles(prisma as unknown as PrismaService);

      expect(prisma.role.createMany).not.toHaveBeenCalled();
      expect(result).toMatchObject({ step: 'roles', created: false });
    });
  });

  describe('seedAdminUsers', () => {
    const ADMIN_ROLE = { id: 'role-admin', roleCode: 'ADMIN' };

    it('skips when ADMIN env var is unset', async () => {
      const results = await seedAdminUsers(prisma as unknown as PrismaService);

      expect(results).toEqual([
        { step: 'seedUser:ADMIN', created: false, message: 'ADMIN not set or empty — skipped.' },
      ]);
      expect(prisma.role.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('skips when ADMIN env var is an empty array', async () => {
      process.env.ADMIN = '[]';
      const results = await seedAdminUsers(prisma as unknown as PrismaService);
      expect(results).toEqual([
        { step: 'seedUser:ADMIN', created: false, message: 'ADMIN not set or empty — skipped.' },
      ]);
    });

    it('throws a clear error when ADMIN is not valid JSON', async () => {
      process.env.ADMIN = '{not json';
      await expect(seedAdminUsers(prisma as unknown as PrismaService)).rejects.toThrow(
        'ADMIN must be valid JSON',
      );
    });

    it('throws a clear error when ADMIN entries are missing required fields', async () => {
      process.env.ADMIN = JSON.stringify([{ username: 'admin.one' }]);
      await expect(seedAdminUsers(prisma as unknown as PrismaService)).rejects.toThrow(
        'ADMIN is malformed',
      );
    });

    it('creates a new admin user and role assignment, deriving a free mobile number', async () => {
      process.env.ADMIN = JSON.stringify([
        { username: 'system.admin', password: 'ChangeMe@123', displayName: 'System Administrator' },
      ]);
      prisma.role.findUniqueOrThrow.mockResolvedValue(ADMIN_ROLE);
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // username check
        .mockResolvedValueOnce(null); // mobile number probe, first slot free
      prisma.user.create.mockResolvedValue({ id: 'user-1' });

      const results = await seedAdminUsers(prisma as unknown as PrismaService);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          username: 'system.admin',
          mobileNumber: '+919000000301',
          passwordHash: 'hashed(ChangeMe@123)',
          displayName: 'System Administrator',
          status: 'ACTIVE',
        },
      });
      expect(prisma.userRole.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'user-1', roleId: 'role-admin', status: 'ACTIVE' }),
      });
      expect(results).toEqual([
        {
          step: 'seedUser:system.admin',
          created: true,
          message: 'Seeded ADMIN user system.admin (mobile +919000000301).',
        },
      ]);
    });

    it('skips a user that already exists by username, without creating anything', async () => {
      process.env.ADMIN = JSON.stringify([
        { username: 'existing.admin', password: 'x', displayName: 'Existing Admin' },
      ]);
      prisma.role.findUniqueOrThrow.mockResolvedValue(ADMIN_ROLE);
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'already-there' });

      const results = await seedAdminUsers(prisma as unknown as PrismaService);

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(results).toEqual([
        {
          step: 'seedUser:existing.admin',
          created: false,
          message: 'User existing.admin already exists — skipped.',
        },
      ]);
    });

    it('skips past mobile numbers already taken and picks the next free slot', async () => {
      process.env.ADMIN = JSON.stringify([
        { username: 'second.admin', password: 'x', displayName: 'Second Admin' },
      ]);
      prisma.role.findUniqueOrThrow.mockResolvedValue(ADMIN_ROLE);
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // username check
        .mockResolvedValueOnce({ id: 'taken-1' }) // +919000000301 taken
        .mockResolvedValueOnce(null); // +919000000302 free
      prisma.user.create.mockResolvedValue({ id: 'user-2' });

      await seedAdminUsers(prisma as unknown as PrismaService);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ mobileNumber: '+919000000302' }),
        }),
      );
    });
  });

  describe('seedOnStartup', () => {
    it('runs seedRoles then seedAdminUsers and logs a summary line per step', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      prisma.role.count.mockResolvedValue(4);

      await seedOnStartup(prisma as unknown as PrismaService);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('roles'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('seedUser:ADMIN'));
      logSpy.mockRestore();
    });
  });
});
