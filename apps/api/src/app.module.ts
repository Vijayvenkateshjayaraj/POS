import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FoundationController } from './foundation.controller';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [HealthController, FoundationController],
  providers: [PrismaService],
})
export class AppModule {}

