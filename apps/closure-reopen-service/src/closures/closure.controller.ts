import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ClosureService } from './closure.service';
import { CreateClosureDto } from './dto/create-closure.dto';

@Controller('closures')
export class ClosureController {
  constructor(private readonly service: ClosureService) {}
  @Get() list() { return this.service.list(); }
  @Post() @HttpCode(HttpStatus.CREATED) create(@Body() dto: CreateClosureDto) { return this.service.create(dto); }
}
