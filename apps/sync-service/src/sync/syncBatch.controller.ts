import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { SyncBatchService } from './syncBatch.service';
import { CreateSyncBatchDto } from './dto/create-syncBatch.dto';

@Controller('sync')
export class SyncBatchController {
  constructor(private readonly service: SyncBatchService) {}
  @Get() list() { return this.service.list(); }
  @Post() @HttpCode(HttpStatus.CREATED) create(@Body() dto: CreateSyncBatchDto) { return this.service.create(dto); }
}
