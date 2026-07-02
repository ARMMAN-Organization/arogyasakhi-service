import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SessionController } from './session.controller';
import { SessionRepository } from './session.repository';
import { SessionService } from './session.service';

@Module({ controllers: [SessionController], providers: [SessionService, SessionRepository, PrismaService] })
export class SessionModule {}
