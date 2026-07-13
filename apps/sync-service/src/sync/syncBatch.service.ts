import type { SyncBatchRepository } from './syncBatch.repository';
import type { CreateSyncBatchInput } from './dto/create-syncBatch.dto';

/** Sync-batch domain logic. Data access is delegated to the repository. */
export class SyncBatchService {
  constructor(private readonly repository: SyncBatchRepository) {}

  list() {
    return this.repository.findMany();
  }

  create(dto: CreateSyncBatchInput) {
    return this.repository.create(dto);
  }
}
