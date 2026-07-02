import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';

/** Data-access layer for beneficiary cases. Only this domain touches these tables. */
@Injectable()
export class BeneficiaryRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany() {
    return this.prisma.beneficiaryCase.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  create(data: CreateBeneficiaryDto) {
    return this.prisma.beneficiaryCase.create({ data });
  }
}
