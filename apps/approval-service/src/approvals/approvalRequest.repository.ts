import type { PrismaService } from '../prisma/prisma.service';
import type { CreateApprovalRequestInput } from './dto/create-approvalRequest.dto';

/** Data access for approval requests. Owns only this service's `approval_requests` table. */
export class ApprovalRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany() {
    return this.prisma.approvalRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  create(data: CreateApprovalRequestInput) {
    return this.prisma.approvalRequest.create({ data });
  }

  findByClosureId(closureId: string) {
    return this.prisma.approvalRequest.findFirst({
      where: { closureId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByReopenRequestId(reopenRequestId: string) {
    return this.prisma.approvalRequest.findFirst({
      where: { reopenRequestId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
