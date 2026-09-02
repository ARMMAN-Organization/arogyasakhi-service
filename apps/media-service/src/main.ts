import type { Server } from 'node:http';
import { appConfig } from './config/app-config';
import { createApp } from './app.module';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.connect();

  const app = createApp(prisma);
  const server: Server = app.listen(appConfig.PORT, () => {
    console.log(`media-service listening on :${appConfig.PORT}`);
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
