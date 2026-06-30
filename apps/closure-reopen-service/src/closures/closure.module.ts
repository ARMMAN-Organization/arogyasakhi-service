import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClosureController } from './closure.controller';
import { ClosureRepository } from './closure.repository';
import { ClosureService } from './closure.service';

@Module({ controllers: [ClosureController], providers: [ClosureService, ClosureRepository, PrismaService] })
export class ClosureModule {}
