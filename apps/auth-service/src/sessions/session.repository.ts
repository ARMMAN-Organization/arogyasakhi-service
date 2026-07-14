import type { PrismaService } from '../prisma/prisma.service';
import type { CreateSessionInput } from './dto/create-session.dto';

/** Data access for sessions. Owns only this service's `sessions` table. */
export class SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany() {
    return this.prisma.session.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  create(data: CreateSessionInput) {
    return this.prisma.session.create({ data });
  }
}
