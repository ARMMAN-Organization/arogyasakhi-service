import type { PrismaService } from '../prisma/prisma.service';
import type { CreateSessionInput } from './dto/create-session.dto';

/** Data access for user sessions. Owns only this service's `user_sessions` table. */
export class SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany() {
    return this.prisma.userSession.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  create(data: CreateSessionInput) {
    return this.prisma.userSession.create({ data });
  }
}
