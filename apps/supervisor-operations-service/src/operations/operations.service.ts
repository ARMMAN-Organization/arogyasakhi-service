import type { OperationsRepository } from './operations.repository';
import type { CreateSupervisorEventInput } from './dto/create-supervisorEvent.dto';

/** Supervisor operations domain logic. Data access is delegated to the repository. */
export class OperationsService {
  constructor(private readonly repository: OperationsRepository) {}

  listEvents() {
    return this.repository.findEvents();
  }

  createEvent(dto: CreateSupervisorEventInput) {
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
