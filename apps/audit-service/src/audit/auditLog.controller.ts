import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuditLogService } from './auditLog.service';
import { CreateAuditLogDto } from './dto/create-auditLog.dto';

@Controller('audit')
export class AuditLogController {
  constructor(private readonly service: AuditLogService) {}
  @Get() list() { return this.service.list(); }
  @Post() @HttpCode(HttpStatus.CREATED) create(@Body() dto: CreateAuditLogDto) { return this.service.create(dto); }
}
