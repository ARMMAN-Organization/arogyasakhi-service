import type { PrismaService } from '../prisma/prisma.service';
import type { CreateVisitInstanceInput } from './dto/create-visitInstance.dto';

/** Data access for visit instances. Owns only this service's `visit_instances` table. */
export class VisitInstanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany() {
    return this.prisma.visitInstance.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  findByLocalVisitUuid(localVisitUuid: string) {
    return this.prisma.visitInstance.findUnique({ where: { localVisitUuid } });
  }

  findScheduleById(scheduleId: string) {
    return this.prisma.visitSchedule.findFirst({
      where: { id: scheduleId, isDeleted: false },
    });
  }

  create(data: CreateVisitInstanceInput) {
    return this.prisma.visitInstance.create({ data });
  }
}
