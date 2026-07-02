import { AllExceptionsFilter, ResponseInterceptor } from '@armman/service-commons';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { appConfig } from './config/app-config';
import { registerProxies } from './proxy/register-proxies';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableCors({ origin: appConfig.CORS_ORIGINS, credentials: true });
  // Mount downstream proxies before the global prefix/pipes/interceptors so
  // forwarded traffic streams through untouched; only the gateway's own routes
  // (info, health) go through the Nest pipeline below.
  registerProxies(app);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
  await app.listen(appConfig.PORT);
}
void bootstrap();
