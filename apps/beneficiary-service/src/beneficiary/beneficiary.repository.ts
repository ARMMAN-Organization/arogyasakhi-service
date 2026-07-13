import type { PrismaService } from '../prisma/prisma.service';
import type { CreateBeneficiaryInput } from './dto/create-beneficiary.dto';

/** Data-access layer for beneficiary cases. Only this domain touches these tables. */
export class BeneficiaryRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany() {
    return this.prisma.beneficiaryCase.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  create(data: CreateBeneficiaryInput) {
    return this.prisma.beneficiaryCase.create({ data });
  }
}
