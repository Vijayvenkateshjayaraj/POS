import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FoundationController } from './foundation.controller';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma.service';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [HealthController, FoundationController, BillingController],
  providers: [PrismaService, BillingService],
})
export class AppModule {}
