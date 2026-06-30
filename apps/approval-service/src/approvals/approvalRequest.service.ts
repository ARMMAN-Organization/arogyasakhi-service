import { Injectable } from '@nestjs/common';
import { ApprovalRequestRepository } from './approvalRequest.repository';
import type { CreateApprovalRequestDto } from './dto/create-approvalRequest.dto';

@Injectable()
export class ApprovalRequestService {
  constructor(private readonly repository: ApprovalRequestRepository) {}
  list() { return this.repository.findMany(); }
  create(dto: CreateApprovalRequestDto) { return this.repository.create(dto); }
}
