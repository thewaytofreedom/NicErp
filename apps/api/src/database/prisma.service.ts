import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { readConfig } from '../config.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({
      adapter: new PrismaPg({
        connectionString: readConfig().databaseUrl,
        connectionTimeoutMillis: 5000,
        query_timeout: 10000,
      }),
    });
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
