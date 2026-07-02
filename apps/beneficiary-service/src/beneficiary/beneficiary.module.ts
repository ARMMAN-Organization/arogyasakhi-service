import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { BeneficiaryController } from './beneficiary.controller';
import { BeneficiaryRepository } from './beneficiary.repository';
import { BeneficiaryService } from './beneficiary.service';

@Module({
  controllers: [BeneficiaryController],
  providers: [BeneficiaryService, BeneficiaryRepository, PrismaService],
})
export class BeneficiaryModule {}
