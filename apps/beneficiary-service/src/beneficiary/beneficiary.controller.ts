import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { BeneficiaryService } from './beneficiary.service';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';

/** Thin HTTP layer — validation + delegation only. */
@Controller('beneficiaries')
export class BeneficiaryController {
  constructor(private readonly beneficiaryService: BeneficiaryService) {}

  @Get()
  list() {
    return this.beneficiaryService.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateBeneficiaryDto) {
    return this.beneficiaryService.create(dto);
  }
}
