import type { Server } from 'node:http';
import { appConfig } from './config/app-config';
import { createApp } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { scheduleOverdueFollowupJob } from './jobs/overdueFollowup.job';

async function bootstrap(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.connect();

  scheduleOverdueFollowupJob(
    prisma,
    appConfig.OVERDUE_FOLLOWUP_JOB_CRON,
    appConfig.SERVICE_ACCOUNT_CLIENT_ID,
    appConfig.SERVICE_ACCOUNT_CLIENT_SECRET,
  );

  const app = createApp(prisma);
  const server: Server = app.listen(appConfig.PORT, () => {
    console.log(`risk-referral-service listening on :${appConfig.PORT}`);
  });

  const shutdown = (signal: string): void => {
    console.log(`Received ${signal}, shutting down gracefully.`);
    server.close(() => {
      void prisma.disconnect().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
