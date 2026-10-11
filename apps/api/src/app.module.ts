import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { ErpModule } from './erp/erp.module.js';
import { ErrorsFilter } from './common/errors.filter.js';
@Module({
  imports: [DatabaseModule, AuthModule, ErpModule],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: ErrorsFilter }],
})
export class AppModule {}
