import type { Server } from 'node:http';
import Redis from 'ioredis';
import { LocalKeypairTokenSigner } from '@armman/service-commons';
import { appConfig } from './config/app-config';
import { createApp } from './app.module';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.connect();

  const signer = await LocalKeypairTokenSigner.create(
    appConfig.JWT_PRIVATE_KEY,
    appConfig.JWT_PUBLIC_KEY,
  );
  const redis = new Redis(appConfig.REDIS_URL);

  const app = createApp(prisma, signer, redis);
  const server: Server = app.listen(appConfig.PORT, () => {
    console.log(`auth-service listening on :${appConfig.PORT}`);
  });

  const shutdown = (signal: string): void => {
    console.log(`Received ${signal}, shutting down gracefully.`);
    server.close(() => {
      redis.disconnect();
      void prisma.disconnect().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

void bootstrap();
