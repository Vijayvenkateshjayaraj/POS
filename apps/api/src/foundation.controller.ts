import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Controller('api/v1/foundation')
export class FoundationController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async summary() {
    const [locations, products, priceBooks, inventoryBalances] =
      await Promise.all([
        this.prisma.location.findMany({
          where: { active: true },
          orderBy: { code: 'asc' },
          select: {
            id: true,
            code: true,
            name: true,
            city: true,
            timezone: true,
            capabilities: true,
          },
        }),
        this.prisma.product.count({ where: { status: 'ACTIVE' } }),
        this.prisma.priceBook.count({ where: { active: true } }),
        this.prisma.inventoryBalance.count(),
      ]);

    return {
      system: 'Unified Commerce System',
      architecture: 'modular monolith',
      locations,
      sampleData: {
        activeProducts: products,
        activePriceBooks: priceBooks,
        inventoryBalances,
      },
    };
  }
}

