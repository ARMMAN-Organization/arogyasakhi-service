import type { ApprovalRequestRepository } from './approvalRequest.repository';
import type { CreateApprovalRequestInput } from './dto/create-approvalRequest.dto';

/** Approval request domain logic. Data access is delegated to the repository. */
export class ApprovalRequestService {
  constructor(private readonly repository: ApprovalRequestRepository) {}

  list() {
    return this.repository.findMany();
  }

  create(dto: CreateApprovalRequestInput) {
    return this.repository.create(dto);
  }
}
