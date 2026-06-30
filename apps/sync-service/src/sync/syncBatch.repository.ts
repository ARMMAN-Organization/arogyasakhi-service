import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSyncBatchDto } from './dto/create-syncBatch.dto';

@Injectable()
export class SyncBatchRepository {
  constructor(private readonly prisma: PrismaService) {}
  findMany() { return this.prisma.syncBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }); }
  create(data: CreateSyncBatchDto) { return this.prisma.syncBatch.create({ data }); }
}
