import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { IncentiveEventService } from './incentiveEvent.service';
import { CreateIncentiveEventDto } from './dto/create-incentiveEvent.dto';

@Controller('incentives')
export class IncentiveEventController {
  constructor(private readonly service: IncentiveEventService) {}
  @Get() list() { return this.service.list(); }
  @Post() @HttpCode(HttpStatus.CREATED) create(@Body() dto: CreateIncentiveEventDto) { return this.service.create(dto); }
}
