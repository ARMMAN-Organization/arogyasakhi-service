import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReferralController } from './referral.controller';
import { ReferralRepository } from './referral.repository';
import { ReferralService } from './referral.service';

@Module({ controllers: [ReferralController], providers: [ReferralService, ReferralRepository, PrismaService] })
export class ReferralModule {}
