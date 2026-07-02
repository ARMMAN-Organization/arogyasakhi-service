import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateVisitInstanceDto } from './dto/create-visitInstance.dto';

@Injectable()
export class VisitInstanceRepository {
  constructor(private readonly prisma: PrismaService) {}
  findMany() { return this.prisma.visitInstance.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }); }
  create(data: CreateVisitInstanceDto) { return this.prisma.visitInstance.create({ data }); }
}
