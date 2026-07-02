import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { SessionService } from './session.service';
import { CreateSessionDto } from './dto/create-session.dto';

@Controller('sessions')
export class SessionController {
  constructor(private readonly service: SessionService) {}
  @Get() list() { return this.service.list(); }
  @Post() @HttpCode(HttpStatus.CREATED) create(@Body() dto: CreateSessionDto) { return this.service.create(dto); }
}
