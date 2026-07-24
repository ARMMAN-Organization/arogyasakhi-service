import { unprocessable } from '@armman/service-commons';
import type { OperationsRepository } from './operations.repository';
import type { CreateSupervisorEventInput } from './dto/create-supervisorEvent.dto';

/** Supervisor operations domain logic. Data access is delegated to the repository. */
export class OperationsService {
  constructor(private readonly repository: OperationsRepository) {}

  listEvents() {
    return this.repository.findEvents();
  }

  createEvent(dto: CreateSupervisorEventInput) {
    // The DTO's photoMediaId is application-mandatory when status = COMPLETED
    // (ERD §4.7) — the schema keeps it optional so SCHEDULED/CANCELLED events
    // can be created without a photo, so this rule is enforced here instead.
    if (dto.status === 'COMPLETED' && !dto.photoMediaId) {
      throw unprocessable('photoMediaId is required when status is COMPLETED.');
    }
    return this.repository.createEvent(dto);
  }

  listInventoryItems() {
    return this.repository.findInventoryItems();
  }

  listInventoryTransactions() {
    return this.repository.findInventoryTransactions();
  }

  listCallLogs() {
    return this.repository.findCallLogs();
  }
}
