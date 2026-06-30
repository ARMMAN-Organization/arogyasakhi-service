import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IncentiveEventController } from './incentiveEvent.controller';
import { IncentiveEventRepository } from './incentiveEvent.repository';
import { IncentiveEventService } from './incentiveEvent.service';

@Module({ controllers: [IncentiveEventController], providers: [IncentiveEventService, IncentiveEventRepository, PrismaService] })
export class IncentiveEventModule {}
