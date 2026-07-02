import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateReferralDto } from './dto/create-referral.dto';

@Injectable()
export class ReferralRepository {
  constructor(private readonly prisma: PrismaService) {}
  findMany() { return this.prisma.referral.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }); }
  create(data: CreateReferralDto) { return this.prisma.referral.create({ data }); }
}
