import { RequestIdMiddleware, RbacGuard, buildLoggerOptions } from '@armman/service-commons';
import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { appConfig } from './config/app-config';
import { HealthController } from './health/health.controller';
import { InfoController } from './info/info.controller';

@Module({
  imports: [LoggerModule.forRoot(buildLoggerOptions(appConfig.LOG_LEVEL))],
  controllers: [HealthController, InfoController],
  providers: [{ provide: APP_GUARD, useClass: RbacGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void { consumer.apply(RequestIdMiddleware).forRoutes('*'); }
}
