import {
  Channel,
  PriceBookKind,
  PrismaClient,
  ProductStatus,
  UnitKind,
} from '@prisma/client';

const prisma = new PrismaClient();

const ids = {
  location: {
    annaNagar: '10000000-0000-4000-8000-000000000001',
    ayyanambakkam: '10000000-0000-4000-8000-000000000002',
  },
  unit: {
    gram: '20000000-0000-4000-8000-000000000001',
    each: '20000000-0000-4000-8000-000000000002',
  },
  category: {
    rice: '30000000-0000-4000-8000-000000000001',
    pulses: '30000000-0000-4000-8000-000000000002',
    oils: '30000000-0000-4000-8000-000000000003',
    flour: '30000000-0000-4000-8000-000000000004',
    spices: '30000000-0000-4000-8000-000000000005',
    sweeteners: '30000000-0000-4000-8000-000000000006',
  },
  tax: {
    gst5: '40000000-0000-4000-8000-000000000001',
  },
  product: {
    ponniRice: '50000000-0000-4000-8000-000000000001',
    toorDal: '50000000-0000-4000-8000-000000000002',
    gingellyOil: '50000000-0000-4000-8000-000000000003',
    atta: '50000000-0000-4000-8000-000000000004',
    salt: '50000000-0000-4000-8000-000000000005',
    jaggery: '50000000-0000-4000-8000-000000000006',
    idliRice: '50000000-0000-4000-8000-000000000007',
    uradDal: '50000000-0000-4000-8000-000000000008',
  },
  priceBook: {
    retail: '60000000-0000-4000-8000-000000000001',
    wholesale: '60000000-0000-4000-8000-000000000002',
  },
  supplier: {
    demo: '70000000-0000-4000-8000-000000000001',
  },
};

async function seedMasterData(): Promise<void> {
  await prisma.location.upsert({
    where: { code: 'ANNA_NAGAR' },
    update: {
      name: 'Anna Nagar',
      capabilities: {
        pos: true,
        kiosk: true,
        pickup: true,
        ecommerceRetail: true,
        ecommerceWholesale: true,
        ownDelivery: true,
      },
    },
    create: {
      id: ids.location.annaNagar,
      code: 'ANNA_NAGAR',
      name: 'Anna Nagar',
      capabilities: {
        pos: true,
        kiosk: true,
        pickup: true,
        ecommerceRetail: true,
        ecommerceWholesale: true,
        ownDelivery: true,
      },
    },
  });

  await prisma.location.upsert({
    where: { code: 'AYYANAMBAKKAM' },
    update: {
      name: 'Ayyanambakkam',
      capabilities: {
        pos: true,
        kiosk: true,
        pickup: true,
        ecommerceRetail: true,
        ecommerceWholesale: true,
        ownDelivery: true,
      },
    },
    create: {
      id: ids.location.ayyanambakkam,
      code: 'AYYANAMBAKKAM',
      name: 'Ayyanambakkam',
      capabilities: {
        pos: true,
        kiosk: true,
        pickup: true,
        ecommerceRetail: true,
        ecommerceWholesale: true,
        ownDelivery: true,
      },
    },
  });

  await prisma.unit.upsert({
    where: { code: 'GRAM' },
    update: {},
    create: {
      id: ids.unit.gram,
      code: 'GRAM',
      name: 'Gram',
      symbol: 'g',
      kind: UnitKind.WEIGHED,
    },
  });
  await prisma.unit.upsert({
    where: { code: 'EACH' },
    update: {},
    create: {
      id: ids.unit.each,
      code: 'EACH',
      name: 'Each',
      symbol: 'ea',
      kind: UnitKind.COUNTED,
    },
  });

  const categories = [
    [ids.category.rice, 'RICE', 'Rice', 'அரிசி'],
    [ids.category.pulses, 'PULSES', 'Pulses', 'பருப்பு வகைகள்'],
    [ids.category.oils, 'OILS', 'Oils', 'எண்ணெய்கள்'],
    [ids.category.flour, 'FLOUR', 'Flour', 'மாவு வகைகள்'],
    [ids.category.spices, 'SPICES', 'Spices', 'மசாலா பொருட்கள்'],
    [ids.category.sweeteners, 'SWEETENERS', 'Sweeteners', 'இனிப்பு பொருட்கள்'],
  ] as const;
  for (const [id, code, nameEnglish, nameTamil] of categories) {
    await prisma.category.upsert({
      where: { code },
      update: { nameEnglish, nameTamil },
      create: { id, code, nameEnglish, nameTamil },
    });
  }

  await prisma.taxProfile.upsert({
    where: { code: 'GST_5' },
    update: { gstRateBasisPt: 500 },
    create: {
      id: ids.tax.gst5,
      code: 'GST_5',
      name: 'GST 5%',
      gstRateBasisPt: 500,
    },
  });

  const products = [
    {
      id: ids.product.ponniRice,
      sku: 'RICE-PONNI-LOOSE',
      barcode: null,
      nameEnglish: 'Ponni Raw Rice (Loose)',
      nameTamil: 'பொன்னி பச்சரிசி',
      hsnCode: '1006',
      unitKind: UnitKind.WEIGHED,
      minimumQuantityBase: 100n,
      maximumQuantityBase: 25_000n,
      quantityIncrementBase: 50n,
      categoryId: ids.category.rice,
      baseUnitId: ids.unit.gram,
    },
    {
      id: ids.product.toorDal,
      sku: 'DAL-TOOR-LOOSE',
      barcode: null,
      nameEnglish: 'Toor Dal (Loose)',
      nameTamil: 'துவரம் பருப்பு',
      hsnCode: '0713',
      unitKind: UnitKind.WEIGHED,
      minimumQuantityBase: 100n,
      maximumQuantityBase: 25_000n,
      quantityIncrementBase: 50n,
      categoryId: ids.category.pulses,
      baseUnitId: ids.unit.gram,
    },
    {
      id: ids.product.gingellyOil,
      sku: 'OIL-GINGELLY-1L',
      barcode: '8900000000017',
      nameEnglish: 'Gingelly Oil 1 L',
      nameTamil: 'நல்லெண்ணெய் 1 லிட்டர்',
      hsnCode: '1515',
      unitKind: UnitKind.COUNTED,
      minimumQuantityBase: 1n,
      maximumQuantityBase: 24n,
      quantityIncrementBase: 1n,
      categoryId: ids.category.oils,
      baseUnitId: ids.unit.each,
    },
    {
      id: ids.product.atta,
      sku: 'FLO-AAT-05',
      barcode: '890100000004',
      nameEnglish: 'Aashirvaad Atta 5 kg',
      nameTamil: 'கோதுமை மாவு 5 கிலோ',
      hsnCode: '1101',
      unitKind: UnitKind.COUNTED,
      minimumQuantityBase: 1n,
      maximumQuantityBase: 20n,
      quantityIncrementBase: 1n,
      categoryId: ids.category.flour,
      baseUnitId: ids.unit.each,
    },
    {
      id: ids.product.salt,
      sku: 'SPI-SAL-01',
      barcode: '890100000005',
      nameEnglish: 'Crystal Salt 1 kg',
      nameTamil: 'கல் உப்பு 1 கிலோ',
      hsnCode: '2501',
      unitKind: UnitKind.COUNTED,
      minimumQuantityBase: 1n,
      maximumQuantityBase: 50n,
      quantityIncrementBase: 1n,
      categoryId: ids.category.spices,
      baseUnitId: ids.unit.each,
    },
    {
      id: ids.product.jaggery,
      sku: 'SUG-JAG-01',
      barcode: '890100000006',
      nameEnglish: 'Jaggery Cubes (Loose)',
      nameTamil: 'வெல்லம்',
      hsnCode: '1701',
      unitKind: UnitKind.WEIGHED,
      minimumQuantityBase: 100n,
      maximumQuantityBase: 25_000n,
      quantityIncrementBase: 50n,
      categoryId: ids.category.sweeteners,
      baseUnitId: ids.unit.gram,
    },
    {
      id: ids.product.idliRice,
      sku: 'RIC-IDL-05',
      barcode: '890100000007',
      nameEnglish: 'Idli Rice 5 kg',
      nameTamil: 'இட்லி அரிசி 5 கிலோ',
      hsnCode: '1006',
      unitKind: UnitKind.COUNTED,
      minimumQuantityBase: 1n,
      maximumQuantityBase: 20n,
      quantityIncrementBase: 1n,
      categoryId: ids.category.rice,
      baseUnitId: ids.unit.each,
    },
    {
      id: ids.product.uradDal,
      sku: 'DAL-URA-01',
      barcode: '890100000008',
      nameEnglish: 'Urad Dal Whole (Loose)',
      nameTamil: 'உளுந்து',
      hsnCode: '0713',
      unitKind: UnitKind.WEIGHED,
      minimumQuantityBase: 100n,
      maximumQuantityBase: 25_000n,
      quantityIncrementBase: 50n,
      categoryId: ids.category.pulses,
      baseUnitId: ids.unit.gram,
    },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { sku: product.sku },
      update: {
        nameEnglish: product.nameEnglish,
        nameTamil: product.nameTamil,
        status: ProductStatus.ACTIVE,
      },
      create: {
        ...product,
        status: ProductStatus.ACTIVE,
        taxProfileId: ids.tax.gst5,
      },
    });
  }

  await prisma.priceBook.upsert({
    where: { code: 'RETAIL_INR' },
    update: {},
    create: {
      id: ids.priceBook.retail,
      code: 'RETAIL_INR',
      name: 'Default Retail',
      kind: PriceBookKind.RETAIL,
    },
  });
  await prisma.priceBook.upsert({
    where: { code: 'WHOLESALE_INR' },
    update: {},
    create: {
      id: ids.priceBook.wholesale,
      code: 'WHOLESALE_INR',
      name: 'Approved Wholesale',
      kind: PriceBookKind.WHOLESALE,
    },
  });

  await prisma.supplier.upsert({
    where: { code: 'SUPPLIER-DEMO' },
    update: {},
    create: {
      id: ids.supplier.demo,
      code: 'SUPPLIER-DEMO',
      name: 'Sample Chennai Supplier',
    },
  });

  for (const product of products) {
    await prisma.productSupplier.upsert({
      where: {
        productId_supplierId: {
          productId: product.id,
          supplierId: ids.supplier.demo,
        },
      },
      update: {},
      create: {
        productId: product.id,
        supplierId: ids.supplier.demo,
        preferred: true,
      },
    });
  }
}

async function seedVisibilityAndPricing(): Promise<void> {
  const productIds = Object.values(ids.product);
  const locationIds = Object.values(ids.location);
  const channels = Object.values(Channel);

  for (const productId of productIds) {
    for (const locationId of locationIds) {
      for (const channel of channels) {
        await prisma.channelVisibility.upsert({
          where: {
            productId_locationId_channel: { productId, locationId, channel },
          },
          update: {},
          create: { productId, locationId, channel, enabled: true },
        });
      }
    }
  }

  const rules = [
    [ids.priceBook.retail, ids.product.ponniRice, 1n, 7_200, 1_000n],
    [ids.priceBook.retail, ids.product.toorDal, 1n, 14_500, 1_000n],
    [ids.priceBook.retail, ids.product.gingellyOil, 1n, 42_000, 1n],
    [ids.priceBook.retail, ids.product.atta, 1n, 29_200, 1n],
    [ids.priceBook.retail, ids.product.salt, 1n, 2_800, 1n],
    [ids.priceBook.retail, ids.product.jaggery, 1n, 8_600, 1_000n],
    [ids.priceBook.retail, ids.product.idliRice, 1n, 36_500, 1n],
    [ids.priceBook.retail, ids.product.uradDal, 1n, 19_200, 1_000n],
    [ids.priceBook.wholesale, ids.product.ponniRice, 25_000n, 6_800, 1_000n],
    [ids.priceBook.wholesale, ids.product.toorDal, 10_000n, 13_700, 1_000n],
    [ids.priceBook.wholesale, ids.product.gingellyOil, 12n, 39_500, 1n],
  ] as const;

  for (const [priceBookId, productId, minimumQuantity, priceAmountPaise, priceQuantityBase] of rules) {
    await prisma.priceRule.upsert({
      where: {
        priceBookId_productId_minimumQuantity: {
          priceBookId,
          productId,
          minimumQuantity,
        },
      },
      update: { priceAmountPaise, priceQuantityBase },
      create: {
        priceBookId,
        productId,
        minimumQuantity,
        priceAmountPaise,
        priceQuantityBase,
      },
    });
  }
}

async function seedOpeningInventory(): Promise<void> {
  const openings = [
    [ids.location.annaNagar, ids.product.ponniRice, 125_000n],
    [ids.location.annaNagar, ids.product.toorDal, 75_000n],
    [ids.location.annaNagar, ids.product.gingellyOil, 60n],
    [ids.location.annaNagar, ids.product.atta, 40n],
    [ids.location.annaNagar, ids.product.salt, 150n],
    [ids.location.annaNagar, ids.product.jaggery, 35_000n],
    [ids.location.annaNagar, ids.product.idliRice, 55n],
    [ids.location.annaNagar, ids.product.uradDal, 45_000n],
    [ids.location.ayyanambakkam, ids.product.ponniRice, 200_000n],
    [ids.location.ayyanambakkam, ids.product.toorDal, 110_000n],
    [ids.location.ayyanambakkam, ids.product.gingellyOil, 90n],
    [ids.location.ayyanambakkam, ids.product.atta, 65n],
    [ids.location.ayyanambakkam, ids.product.salt, 220n],
    [ids.location.ayyanambakkam, ids.product.jaggery, 50_000n],
    [ids.location.ayyanambakkam, ids.product.idliRice, 85n],
    [ids.location.ayyanambakkam, ids.product.uradDal, 70_000n],
  ] as const;

  for (const [locationId, productId, quantity] of openings) {
    const sourceReference = `SEED-OPENING-${locationId}-${productId}`;
    await prisma.$transaction([
      prisma.inventoryBalance.upsert({
        where: { productId_locationId: { productId, locationId } },
        update: {},
        create: {
          productId,
          locationId,
          onHandBase: quantity,
          reservedBase: 0n,
        },
      }),
      prisma.inventoryLedger.upsert({
        where: { sourceReference },
        update: {},
        create: {
          productId,
          locationId,
          onHandDeltaBase: quantity,
          reason: 'OPENING_STOCK',
          sourceType: 'SAMPLE_DATA',
          sourceReference,
          notes: 'Idempotent local-development sample opening balance',
        },
      }),
    ]);
  }
}

async function seedConfiguration(): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: 'routing.whole_basket' },
    update: {},
    create: {
      key: 'routing.whole_basket',
      description: 'Configurable single-location routing; automatic splits disabled',
      value: {
        automaticSplitEnabled: false,
        manualSplitEnabled: false,
        ranking: ['complete_stock', 'priority', 'capacity', 'travel_time'],
        candidateLocationCodes: ['ANNA_NAGAR', 'AYYANAMBAKKAM'],
      },
    },
  });

  const existingAudit = await prisma.auditEvent.findFirst({
    where: {
      eventType: 'SAMPLE_DATA_CREATED',
      entityType: 'SYSTEM',
      entityId: 'foundation',
    },
  });
  if (!existingAudit) {
    await prisma.auditEvent.create({
      data: {
        eventType: 'SAMPLE_DATA_CREATED',
        entityType: 'SYSTEM',
        entityId: 'foundation',
        actorType: 'SEED',
        payload: {
          locations: ['ANNA_NAGAR', 'AYYANAMBAKKAM'],
          products: Object.keys(ids.product),
        },
      },
    });
  }
}

async function main(): Promise<void> {
  await seedMasterData();
  await seedVisibilityAndPricing();
  await seedOpeningInventory();
  await seedConfiguration();
  console.info('Sample data is ready.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
