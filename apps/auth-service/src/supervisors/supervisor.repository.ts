import type { PrismaService } from '../prisma/prisma.service';

/**
 * Data access for the Supervisor→Manager hierarchy link (FR-SV-4.3's
 * "designated Manager" resolution) and the role checks that guard setting
 * it. `SupervisorProfile.userId`/`managerUserId` are kept as plain scalars
 * (no Prisma relation), matching this schema file's own convention for that
 * model — see schema.prisma's comment on SupervisorProfile.userId.
 */
export class SupervisorRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveUserRole(userId: string, roleCode: string) {
    return this.prisma.userRole.findFirst({
      where: { userId, status: 'ACTIVE', isDeleted: false, role: { roleCode } },
    });
  }

  findUserById(userId: string) {
    return this.prisma.user.findFirst({ where: { id: userId, isDeleted: false } });
  }

  findSupervisorProfileByUserId(userId: string) {
    return this.prisma.supervisorProfile.findFirst({ where: { userId, isDeleted: false } });
  }

  /** `userId` here is the Sakhi's `users.user_id`, same id `sakhi.repository.ts`'s
   * own `findById` takes — not the `sakhi_profiles` row's own PK. */
  findSakhiProfileByUserId(userId: string) {
    return this.prisma.sakhiProfile.findFirst({
      where: { userId, isDeleted: false },
      include: { user: true },
    });
  }

  /**
   * Creates or updates the calling Supervisor's manager link. `activeFrom`
   * is only meaningful on first create (no application code sets it again
   * on update) — mirrors sakhi_profiles' own activeFrom, stamped once at
   * assignment time.
   */
  upsertManager(supervisorUserId: string, managerUserId: string, updatedByUserId: string) {
    return this.prisma.supervisorProfile.upsert({
      where: { userId: supervisorUserId },
      update: { managerUserId, updatedByUserId },
      create: {
        userId: supervisorUserId,
        managerUserId,
        activeFrom: new Date(),
        createdByUserId: updatedByUserId,
        updatedByUserId,
      },
    });
  }
}
