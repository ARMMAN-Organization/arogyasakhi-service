import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { VisitInstanceService } from './visitInstance.service';
import { CreateVisitInstanceDto } from './dto/create-visitInstance.dto';

@Controller('visits')
export class VisitInstanceController {
  constructor(private readonly service: VisitInstanceService) {}
  @Get() list() { return this.service.list(); }
  @Post() @HttpCode(HttpStatus.CREATED) create(@Body() dto: CreateVisitInstanceDto) { return this.service.create(dto); }
}
