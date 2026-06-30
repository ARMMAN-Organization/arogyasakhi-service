import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateClosureDto } from './dto/create-closure.dto';

@Injectable()
export class ClosureRepository {
  constructor(private readonly prisma: PrismaService) {}
  findMany() { return this.prisma.closure.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }); }
  create(data: CreateClosureDto) { return this.prisma.closure.create({ data }); }
}
