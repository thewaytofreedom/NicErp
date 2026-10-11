import { Public } from '../auth/auth.guard.js';
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service.js';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Get()
  @ApiOperation({ summary: 'API process liveness' })
  live() {
    return { status: 'ok', service: 'nicerp-api' };
  }
  @Get('ready')
  @ApiOperation({ summary: 'Database readiness (503 when unavailable)' })
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'connected' };
    } catch {
      throw new ServiceUnavailableException({ status: 'error', database: 'unavailable' });
    }
  }
}
