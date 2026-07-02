import { Injectable } from '@nestjs/common';
import { SyncBatchRepository } from './syncBatch.repository';
import type { CreateSyncBatchDto } from './dto/create-syncBatch.dto';

@Injectable()
export class SyncBatchService {
  constructor(private readonly repository: SyncBatchRepository) {}
  list() { return this.repository.findMany(); }
  create(dto: CreateSyncBatchDto) { return this.repository.create(dto); }
}
