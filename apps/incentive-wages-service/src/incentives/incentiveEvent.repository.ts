import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateIncentiveEventDto } from './dto/create-incentiveEvent.dto';

@Injectable()
export class IncentiveEventRepository {
  constructor(private readonly prisma: PrismaService) {}
  findMany() { return this.prisma.incentiveEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }); }
  create(data: CreateIncentiveEventDto) { return this.prisma.incentiveEvent.create({ data }); }
}
