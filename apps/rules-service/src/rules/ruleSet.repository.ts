import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateRuleSetDto } from './dto/create-ruleSet.dto';

@Injectable()
export class RuleSetRepository {
  constructor(private readonly prisma: PrismaService) {}
  findMany() { return this.prisma.ruleSet.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }); }
  create(data: CreateRuleSetDto) { return this.prisma.ruleSet.create({ data }); }
}
