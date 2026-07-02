import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SyncBatchController } from './syncBatch.controller';
import { SyncBatchRepository } from './syncBatch.repository';
import { SyncBatchService } from './syncBatch.service';

@Module({ controllers: [SyncBatchController], providers: [SyncBatchService, SyncBatchRepository, PrismaService] })
export class SyncBatchModule {}
