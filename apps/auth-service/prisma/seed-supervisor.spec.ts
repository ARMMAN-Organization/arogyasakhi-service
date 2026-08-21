import { resolveSupervisorId } from './seed-supervisor';
import type { PrismaClient } from '../../../node_modules/.prisma/client-auth-service';

describe('resolveSupervisorId', () => {
  let prisma: { user: { findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
  });

  it("returns the matching user's id when the supervisor username exists", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'supervisor-user-1' });

    const id = await resolveSupervisorId(
      prisma as unknown as Pick<PrismaClient, 'user'>,
      'pemma.deshmukh',
    );

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { username: 'pemma.deshmukh' },
    });
    expect(id).toBe('supervisor-user-1');
  });

  it('throws a clear error naming the missing username when no such user exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      resolveSupervisorId(prisma as unknown as Pick<PrismaClient, 'user'>, 'ghost.supervisor'),
    ).rejects.toThrow('Supervisor username "ghost.supervisor" not found');
  });
});
