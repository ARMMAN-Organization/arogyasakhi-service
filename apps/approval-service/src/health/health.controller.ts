import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Get('live') live(): { status: string } { return { status: 'ok' }; }
  @Get('ready') async ready(): Promise<{ status: string }> { await this.prisma.$queryRaw`SELECT 1`; return { status: 'ok' }; }
}
