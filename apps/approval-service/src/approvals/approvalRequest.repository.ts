import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateApprovalRequestDto } from './dto/create-approvalRequest.dto';

@Injectable()
export class ApprovalRequestRepository {
  constructor(private readonly prisma: PrismaService) {}
  findMany() { return this.prisma.approvalRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }); }
  create(data: CreateApprovalRequestDto) { return this.prisma.approvalRequest.create({ data }); }
}
