import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RuleSetController } from './ruleSet.controller';
import { RuleSetRepository } from './ruleSet.repository';
import { RuleSetService } from './ruleSet.service';

@Module({ controllers: [RuleSetController], providers: [RuleSetService, RuleSetRepository, PrismaService] })
export class RuleSetModule {}
