import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from './prisma.service';

type HealthResult = {
  status: 'ok';
  service: 'api';
  checks?: {
    database: 'up';
    uploads: 'writable';
  };
  timestamp: string;
};

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  live(): HealthResult {
    return {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get()
  ready(): Promise<HealthResult> {
    return this.readiness();
  }

  @Get('ready')
  async readiness(): Promise<HealthResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;

      const uploadsDirectory = process.env.UPLOADS_DIR ?? '../../uploads';
      await mkdir(uploadsDirectory, { recursive: true });
      await access(uploadsDirectory, constants.R_OK | constants.W_OK);

      const probe = join(
        uploadsDirectory,
        `.health-${process.pid}-${Date.now()}`,
      );
      await writeFile(probe, 'ok', { flag: 'wx' });
      await unlink(probe);

      return {
        status: 'ok',
        service: 'api',
        checks: {
          database: 'up',
          uploads: 'writable',
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        service: 'api',
        message: error instanceof Error ? error.message : 'Readiness check failed',
        timestamp: new Date().toISOString(),
      });
    }
  }
}

