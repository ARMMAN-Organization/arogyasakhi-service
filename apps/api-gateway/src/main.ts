import type { Server } from 'node:http';
import { PublicKeyVerifier } from '@armman/service-commons';
import { appConfig } from './config/app-config';
import { createApp } from './app.module';

async function bootstrap(): Promise<void> {
  const signer = await PublicKeyVerifier.create(appConfig.JWT_PUBLIC_KEY);
  const app = createApp(signer);
  const server: Server = app.listen(appConfig.PORT, () => {
    console.log(`api-gateway listening on :${appConfig.PORT}`);
  });

  const shutdown = (signal: string): void => {
    console.log(`Received ${signal}, shutting down gracefully.`);
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

void bootstrap();
