import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VisitInstanceController } from './visitInstance.controller';
import { VisitInstanceRepository } from './visitInstance.repository';
import { VisitInstanceService } from './visitInstance.service';

@Module({ controllers: [VisitInstanceController], providers: [VisitInstanceService, VisitInstanceRepository, PrismaService] })
export class VisitInstanceModule {}
