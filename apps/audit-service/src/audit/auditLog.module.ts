import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogController } from './auditLog.controller';
import { AuditLogRepository } from './auditLog.repository';
import { AuditLogService } from './auditLog.service';

@Module({ controllers: [AuditLogController], providers: [AuditLogService, AuditLogRepository, PrismaService] })
export class AuditLogModule {}
