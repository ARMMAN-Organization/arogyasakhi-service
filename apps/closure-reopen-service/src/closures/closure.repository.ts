import type { PrismaService } from '../prisma/prisma.service';
import type { CreateClosureInput } from './dto/create-closure.dto';

/** Data access for closures. Owns only this service's `closures` table. */
export class ClosureRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany() {
    return this.prisma.closure.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  create(data: CreateClosureInput) {
    return this.prisma.closure.create({ data });
  }
}
