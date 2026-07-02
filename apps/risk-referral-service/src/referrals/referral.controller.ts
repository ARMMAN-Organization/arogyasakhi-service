import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ReferralService } from './referral.service';
import { CreateReferralDto } from './dto/create-referral.dto';

@Controller('referrals')
export class ReferralController {
  constructor(private readonly service: ReferralService) {}
  @Get() list() { return this.service.list(); }
  @Post() @HttpCode(HttpStatus.CREATED) create(@Body() dto: CreateReferralDto) { return this.service.create(dto); }
}
