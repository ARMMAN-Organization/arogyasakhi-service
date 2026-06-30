import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSessionDto } from './dto/create-session.dto';

@Injectable()
export class SessionRepository {
  constructor(private readonly prisma: PrismaService) {}
  findMany() { return this.prisma.session.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }); }
  create(data: CreateSessionDto) { return this.prisma.session.create({ data }); }
}
