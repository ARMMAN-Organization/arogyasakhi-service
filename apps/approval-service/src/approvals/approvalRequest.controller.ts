import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApprovalRequestService } from './approvalRequest.service';
import { CreateApprovalRequestDto } from './dto/create-approvalRequest.dto';

@Controller('approvals')
export class ApprovalRequestController {
  constructor(private readonly service: ApprovalRequestService) {}
  @Get() list() { return this.service.list(); }
  @Post() @HttpCode(HttpStatus.CREATED) create(@Body() dto: CreateApprovalRequestDto) { return this.service.create(dto); }
}
