import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { RuleSetService } from './ruleSet.service';
import { CreateRuleSetDto } from './dto/create-ruleSet.dto';

@Controller('rules')
export class RuleSetController {
  constructor(private readonly service: RuleSetService) {}
  @Get() list() { return this.service.list(); }
  @Post() @HttpCode(HttpStatus.CREATED) create(@Body() dto: CreateRuleSetDto) { return this.service.create(dto); }
}
