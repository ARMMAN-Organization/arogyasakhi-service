import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateAuditLogDto } from './dto/create-auditLog.dto';

@Injectable()
export class AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}
  findMany() { return this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }); }
  create(data: CreateAuditLogDto) { return this.prisma.auditLog.create({ data }); }
}
