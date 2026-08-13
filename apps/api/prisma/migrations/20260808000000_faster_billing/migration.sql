CREATE TYPE "BillingSessionState" AS ENUM ('ACTIVE', 'PARKED', 'PAYMENT_PENDING', 'COMPLETED', 'SYNC_REQUIRED', 'CANCELLED');
CREATE TYPE "BillingPaymentMethod" AS ENUM ('CASH', 'UPI', 'CARD', 'CREDIT', 'SPLIT');
CREATE TYPE "PaymentAttemptState" AS ENUM ('CREATED', 'PENDING', 'CAPTURED', 'FAILED', 'CANCELLED');
CREATE TYPE "StockReservationState" AS ENUM ('ACTIVE', 'COMMITTED', 'RELEASED', 'EXPIRED');
CREATE TYPE "ManagerOverrideState" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED');
CREATE TYPE "ExternalOrderDraftState" AS ENUM ('REVIEW', 'APPROVED', 'IMPORTED', 'REJECTED');
CREATE TYPE "ExternalOrderLineState" AS ENUM ('MATCHED', 'REVIEW', 'APPROVED', 'REJECTED', 'UNMATCHED');
CREATE TYPE "DeviceEventKind" AS ENUM ('SCALE_READING', 'SCALE_TARE', 'BARCODE_SCAN', 'PRINT_SUCCEEDED', 'PRINT_FAILED', 'DEVICE_CONNECTED', 'DEVICE_DISCONNECTED');

CREATE TABLE "billing_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "idempotency_key" TEXT NOT NULL,
    "location_id" UUID NOT NULL,
    "state" "BillingSessionState" NOT NULL DEFAULT 'ACTIVE',
    "channel" "Channel" NOT NULL DEFAULT 'POS',
    "recipient" JSONB,
    "offline" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "first_item_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "subtotal_amount_paise" INTEGER NOT NULL DEFAULT 0,
    "tax_amount_paise" INTEGER NOT NULL DEFAULT 0,
    "total_amount_paise" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_sessions_totals_nonnegative" CHECK ("subtotal_amount_paise" >= 0 AND "tax_amount_paise" >= 0 AND "total_amount_paise" >= 0)
);

CREATE TABLE "billing_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "billing_session_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "quantity_base" BIGINT NOT NULL,
    "entered_expression" TEXT,
    "product_name_snapshot" TEXT NOT NULL,
    "sku_snapshot" TEXT NOT NULL,
    "unit_price_amount_paise" INTEGER NOT NULL,
    "price_quantity_base" BIGINT NOT NULL,
    "cost_amount_paise" INTEGER,
    "tax_amount_paise" INTEGER NOT NULL,
    "line_total_amount_paise" INTEGER NOT NULL,
    "fulfillment_location" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_lines_positive_values" CHECK ("quantity_base" > 0 AND "unit_price_amount_paise" > 0 AND "price_quantity_base" > 0 AND "tax_amount_paise" >= 0 AND "line_total_amount_paise" > 0)
);

CREATE TABLE "payment_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "billing_session_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "method" "BillingPaymentMethod" NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "state" "PaymentAttemptState" NOT NULL DEFAULT 'CREATED',
    "provider_reference" TEXT,
    "provider_payload" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_attempts_positive_amount" CHECK ("amount_paise" > 0)
);

CREATE TABLE "payment_webhook_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "payment_attempt_id" UUID,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_number" TEXT NOT NULL,
    "billing_session_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "subtotal_amount_paise" INTEGER NOT NULL,
    "tax_amount_paise" INTEGER NOT NULL,
    "total_amount_paise" INTEGER NOT NULL,
    "payment_status" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoices_totals_nonnegative" CHECK ("subtotal_amount_paise" >= 0 AND "tax_amount_paise" >= 0 AND "total_amount_paise" >= 0)
);

CREATE TABLE "stock_reservations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "billing_session_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "quantity_base" BIGINT NOT NULL,
    "state" "StockReservationState" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stock_reservations_positive_quantity" CHECK ("quantity_base" > 0)
);

CREATE TABLE "manager_overrides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "billing_session_id" UUID NOT NULL,
    "billing_line_id" UUID,
    "rule_code" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "state" "ManagerOverrideState" NOT NULL DEFAULT 'REQUESTED',
    "requested_by" TEXT NOT NULL,
    "approved_by" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),
    CONSTRAINT "manager_overrides_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "external_order_drafts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "billing_session_id" UUID,
    "source" TEXT NOT NULL,
    "source_reference" TEXT,
    "raw_text" TEXT NOT NULL,
    "state" "ExternalOrderDraftState" NOT NULL DEFAULT 'REVIEW',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "external_order_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "external_order_draft_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "external_order_draft_id" UUID NOT NULL,
    "source_text" TEXT NOT NULL,
    "product_id" UUID,
    "quantity_base" BIGINT,
    "confidence_basis_points" INTEGER NOT NULL DEFAULT 0,
    "state" "ExternalOrderLineState" NOT NULL DEFAULT 'REVIEW',
    "approved_by" TEXT,
    CONSTRAINT "external_order_draft_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "external_order_draft_lines_confidence_range" CHECK ("confidence_basis_points" >= 0 AND "confidence_basis_points" <= 10000),
    CONSTRAINT "external_order_draft_lines_positive_quantity" CHECK ("quantity_base" IS NULL OR "quantity_base" > 0)
);

CREATE TABLE "billing_analytics_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "billing_session_id" UUID,
    "event_type" TEXT NOT NULL,
    "duration_ms" INTEGER,
    "payload" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_analytics_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_analytics_events_duration_nonnegative" CHECK ("duration_ms" IS NULL OR "duration_ms" >= 0)
);

CREATE TABLE "device_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "device_id" TEXT NOT NULL,
    "event_kind" "DeviceEventKind" NOT NULL,
    "event_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "device_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_sessions_idempotency_key_key" ON "billing_sessions"("idempotency_key");
CREATE INDEX "billing_sessions_location_id_state_updated_at_idx" ON "billing_sessions"("location_id", "state", "updated_at");
CREATE UNIQUE INDEX "billing_lines_billing_session_id_line_number_key" ON "billing_lines"("billing_session_id", "line_number");
CREATE INDEX "billing_lines_product_id_idx" ON "billing_lines"("product_id");
CREATE UNIQUE INDEX "payment_attempts_idempotency_key_key" ON "payment_attempts"("idempotency_key");
CREATE UNIQUE INDEX "payment_attempts_provider_reference_key" ON "payment_attempts"("provider_reference");
CREATE INDEX "payment_attempts_billing_session_id_state_idx" ON "payment_attempts"("billing_session_id", "state");
CREATE UNIQUE INDEX "payment_webhook_events_provider_event_id_key" ON "payment_webhook_events"("provider_event_id");
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");
CREATE UNIQUE INDEX "invoices_billing_session_id_key" ON "invoices"("billing_session_id");
CREATE INDEX "invoices_location_id_issued_at_idx" ON "invoices"("location_id", "issued_at");
CREATE UNIQUE INDEX "stock_reservations_billing_session_id_product_id_location_key" ON "stock_reservations"("billing_session_id", "product_id", "location_id");
CREATE INDEX "stock_reservations_location_id_state_expires_at_idx" ON "stock_reservations"("location_id", "state", "expires_at");
CREATE INDEX "manager_overrides_billing_session_id_state_idx" ON "manager_overrides"("billing_session_id", "state");
CREATE INDEX "external_order_drafts_state_created_at_idx" ON "external_order_drafts"("state", "created_at");
CREATE INDEX "external_order_draft_lines_external_order_draft_id_state_idx" ON "external_order_draft_lines"("external_order_draft_id", "state");
CREATE INDEX "billing_analytics_events_event_type_created_at_idx" ON "billing_analytics_events"("event_type", "created_at");
CREATE UNIQUE INDEX "device_events_event_key_key" ON "device_events"("event_key");
CREATE INDEX "device_events_device_id_occurred_at_idx" ON "device_events"("device_id", "occurred_at");

ALTER TABLE "billing_sessions" ADD CONSTRAINT "billing_sessions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_lines" ADD CONSTRAINT "billing_lines_billing_session_id_fkey" FOREIGN KEY ("billing_session_id") REFERENCES "billing_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_lines" ADD CONSTRAINT "billing_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_billing_session_id_fkey" FOREIGN KEY ("billing_session_id") REFERENCES "billing_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_payment_attempt_id_fkey" FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billing_session_id_fkey" FOREIGN KEY ("billing_session_id") REFERENCES "billing_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_billing_session_id_fkey" FOREIGN KEY ("billing_session_id") REFERENCES "billing_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "manager_overrides" ADD CONSTRAINT "manager_overrides_billing_session_id_fkey" FOREIGN KEY ("billing_session_id") REFERENCES "billing_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "manager_overrides" ADD CONSTRAINT "manager_overrides_billing_line_id_fkey" FOREIGN KEY ("billing_line_id") REFERENCES "billing_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "external_order_drafts" ADD CONSTRAINT "external_order_drafts_billing_session_id_fkey" FOREIGN KEY ("billing_session_id") REFERENCES "billing_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "external_order_draft_lines" ADD CONSTRAINT "external_order_draft_lines_external_order_draft_id_fkey" FOREIGN KEY ("external_order_draft_id") REFERENCES "external_order_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_order_draft_lines" ADD CONSTRAINT "external_order_draft_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "billing_analytics_events" ADD CONSTRAINT "billing_analytics_events_billing_session_id_fkey" FOREIGN KEY ("billing_session_id") REFERENCES "billing_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
