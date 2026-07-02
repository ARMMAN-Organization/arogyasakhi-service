import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApprovalRequestController } from './approvalRequest.controller';
import { ApprovalRequestRepository } from './approvalRequest.repository';
import { ApprovalRequestService } from './approvalRequest.service';

@Module({ controllers: [ApprovalRequestController], providers: [ApprovalRequestService, ApprovalRequestRepository, PrismaService] })
export class ApprovalRequestModule {}
