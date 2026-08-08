CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "UnitKind" AS ENUM ('COUNTED', 'WEIGHED');
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'UNPUBLISHED', 'ARCHIVED');
CREATE TYPE "PriceBookKind" AS ENUM ('RETAIL', 'WHOLESALE', 'CUSTOMER');
CREATE TYPE "Channel" AS ENUM ('POS', 'KIOSK', 'ECOMMERCE', 'WHOLESALE');

CREATE TABLE "locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'Chennai',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "capabilities" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "units" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "kind" "UnitKind" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name_english" TEXT NOT NULL,
    "name_tamil" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tax_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gst_rate_basis_points" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tax_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "name_english" TEXT NOT NULL,
    "name_tamil" TEXT,
    "hsn_code" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "unit_kind" "UnitKind" NOT NULL,
    "minimum_quantity_base" BIGINT NOT NULL DEFAULT 1,
    "maximum_quantity_base" BIGINT,
    "quantity_increment_base" BIGINT NOT NULL DEFAULT 1,
    "category_id" UUID NOT NULL,
    "base_unit_id" UUID NOT NULL,
    "tax_profile_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "channel_visibility" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "channel" "Channel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "channel_visibility_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "price_books" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PriceBookKind" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "price_books_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "price_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "price_book_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "minimum_quantity_base" BIGINT NOT NULL DEFAULT 1,
    "price_amount_paise" INTEGER NOT NULL,
    "price_quantity_base" BIGINT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "price_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "price_rules_positive_price" CHECK ("price_amount_paise" >= 0),
    CONSTRAINT "price_rules_positive_quantity" CHECK ("price_quantity_base" > 0)
);

CREATE TABLE "inventory_balances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "on_hand_base" BIGINT NOT NULL DEFAULT 0,
    "reserved_base" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inventory_balances_reserved_nonnegative" CHECK ("reserved_base" >= 0)
);

CREATE TABLE "inventory_ledger" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "on_hand_delta_base" BIGINT NOT NULL DEFAULT 0,
    "reserved_delta_base" BIGINT NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_reference" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventory_ledger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "suppliers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_suppliers" (
    "product_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "preferred" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "product_suppliers_pkey" PRIMARY KEY ("product_id", "supplier_id")
);

CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "locations_code_key" ON "locations"("code");
CREATE UNIQUE INDEX "units_code_key" ON "units"("code");
CREATE UNIQUE INDEX "categories_code_key" ON "categories"("code");
CREATE UNIQUE INDEX "tax_profiles_code_key" ON "tax_profiles"("code");
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");
CREATE INDEX "products_category_id_status_idx" ON "products"("category_id", "status");
CREATE UNIQUE INDEX "channel_visibility_product_id_location_id_channel_key" ON "channel_visibility"("product_id", "location_id", "channel");
CREATE INDEX "channel_visibility_location_id_channel_enabled_idx" ON "channel_visibility"("location_id", "channel", "enabled");
CREATE UNIQUE INDEX "price_books_code_key" ON "price_books"("code");
CREATE UNIQUE INDEX "price_rules_price_book_id_product_id_minimum_quantity_base_key" ON "price_rules"("price_book_id", "product_id", "minimum_quantity_base");
CREATE INDEX "price_rules_product_id_active_idx" ON "price_rules"("product_id", "active");
CREATE UNIQUE INDEX "inventory_balances_product_id_location_id_key" ON "inventory_balances"("product_id", "location_id");
CREATE INDEX "inventory_balances_location_id_idx" ON "inventory_balances"("location_id");
CREATE UNIQUE INDEX "inventory_ledger_source_reference_key" ON "inventory_ledger"("source_reference");
CREATE INDEX "inventory_ledger_product_id_location_id_created_at_idx" ON "inventory_ledger"("product_id", "location_id", "created_at");
CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");
CREATE INDEX "audit_events_entity_type_entity_id_created_at_idx" ON "audit_events"("entity_type", "entity_id", "created_at");

ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_base_unit_id_fkey" FOREIGN KEY ("base_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_tax_profile_id_fkey" FOREIGN KEY ("tax_profile_id") REFERENCES "tax_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "channel_visibility" ADD CONSTRAINT "channel_visibility_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "channel_visibility" ADD CONSTRAINT "channel_visibility_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_price_book_id_fkey" FOREIGN KEY ("price_book_id") REFERENCES "price_books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_suppliers" ADD CONSTRAINT "product_suppliers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_suppliers" ADD CONSTRAINT "product_suppliers_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

