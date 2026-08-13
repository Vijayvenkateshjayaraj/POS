import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import {
  BillingPaymentMethod,
  BillingSessionState,
  DeviceEventKind,
  ExternalOrderLineState,
  ManagerOverrideState,
  PaymentAttemptState,
  Prisma,
  StockReservationState,
} from '@prisma/client';
import { PrismaService } from './prisma.service';
import {
  calculateLineAmounts,
  calculateSessionTotals,
  makeInvoiceNumber,
  normalizeCompletionLine,
  positiveBigInt,
  positiveInteger,
  requiredString,
  serializeBigInts,
  verifyWebhookSignature,
} from './billing.logic';

const sessionTransitions: Record<BillingSessionState, BillingSessionState[]> = {
  ACTIVE: [BillingSessionState.PARKED, BillingSessionState.PAYMENT_PENDING, BillingSessionState.COMPLETED, BillingSessionState.SYNC_REQUIRED, BillingSessionState.CANCELLED],
  PARKED: [BillingSessionState.ACTIVE, BillingSessionState.CANCELLED],
  PAYMENT_PENDING: [BillingSessionState.COMPLETED, BillingSessionState.CANCELLED],
  SYNC_REQUIRED: [BillingSessionState.ACTIVE, BillingSessionState.PAYMENT_PENDING, BillingSessionState.COMPLETED],
  COMPLETED: [],
  CANCELLED: [],
};

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(body: Record<string, unknown>) {
    const idempotencyKey = requiredString(body.idempotencyKey, 'idempotencyKey');
    const existing = await this.prisma.billingSession.findUnique({ where: { idempotencyKey }, include: { lines: true, payments: true, invoice: true } });
    if (existing) return serializeBigInts(existing);
    const location = await this.resolveLocation(body.locationId, body.locationCode);
    const session = await this.prisma.billingSession.create({
      data: {
        idempotencyKey,
        locationId: location.id,
        channel: body.channel === 'WHOLESALE' ? 'WHOLESALE' : 'POS',
        recipient: this.json(body.recipient),
        offline: Boolean(body.offline),
      },
      include: { lines: true, payments: true },
    });
    return serializeBigInts(session);
  }

  async transitionSession(sessionId: string, body: Record<string, unknown>) {
    const current = await this.getSession(sessionId);
    const next = requiredString(body.state, 'state') as BillingSessionState;
    if (!Object.values(BillingSessionState).includes(next)) throw new BadRequestException('Unknown billing session state');
    if (!sessionTransitions[current.state].includes(next)) throw new ConflictException(`Cannot transition ${current.state} to ${next}`);
    return this.prisma.billingSession.update({ where: { id: sessionId }, data: { state: next, recipient: body.recipient === undefined ? undefined : this.json(body.recipient) } });
  }

  async reserveStock(sessionId: string, body: Record<string, unknown>) {
    const session = await this.getSession(sessionId);
    if (session.state !== BillingSessionState.ACTIVE && session.state !== BillingSessionState.SYNC_REQUIRED) throw new ConflictException('Only active billing sessions can reserve stock');
    if (!Array.isArray(body.lines) || body.lines.length === 0) throw new BadRequestException('At least one reservation line is required');
    const expiresAt = new Date(Date.now() + Math.min(Math.max(Number(body.ttlSeconds ?? 600), 60), 3600) * 1000);

    const result = await this.prisma.$transaction(async (tx) => {
      const reservations = [];
      for (const raw of body.lines as Record<string, unknown>[]) {
        const sku = requiredString(raw.sku, 'sku');
        const quantityBase = positiveBigInt(raw.quantityBase, 'quantityBase');
        const product = await tx.product.findUnique({ where: { sku } });
        if (!product) throw new NotFoundException(`Product ${sku} was not found`);
        const location = raw.locationCode ? await tx.location.findUnique({ where: { code: String(raw.locationCode) } }) : await tx.location.findUnique({ where: { id: session.locationId } });
        if (!location) throw new NotFoundException('Reservation location was not found');
        const balance = await tx.inventoryBalance.findUnique({ where: { productId_locationId: { productId: product.id, locationId: location.id } } });
        if (!balance) throw new ConflictException(`${sku} has no inventory balance at ${location.name}`);
        const existing = await tx.stockReservation.findUnique({ where: { billingSessionId_productId_locationId: { billingSessionId: sessionId, productId: product.id, locationId: location.id } } });
        const existingActive = existing?.state === StockReservationState.ACTIVE ? existing.quantityBase : 0n;
        const additional = quantityBase - existingActive;
        if (additional > 0n && balance.onHandBase - balance.reservedBase < additional) throw new ConflictException(`Insufficient available stock for ${sku} at ${location.name}`);
        if (additional !== 0n) {
          await tx.inventoryBalance.update({ where: { id: balance.id }, data: { reservedBase: { increment: additional }, version: { increment: 1 } } });
          await tx.inventoryLedger.create({
            data: {
              productId: product.id,
              locationId: location.id,
              reservedDeltaBase: additional,
              reason: 'Billing reservation',
              sourceType: 'BILLING_SESSION',
              sourceReference: `${sessionId}:reserve:${product.id}:${location.id}:${Date.now()}`,
            },
          });
        }
        const reservation = await tx.stockReservation.upsert({
          where: { billingSessionId_productId_locationId: { billingSessionId: sessionId, productId: product.id, locationId: location.id } },
          create: { billingSessionId: sessionId, productId: product.id, locationId: location.id, quantityBase, expiresAt },
          update: { quantityBase, expiresAt, state: StockReservationState.ACTIVE },
        });
        reservations.push(reservation);
      }
      return reservations;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return serializeBigInts(result);
  }

  async completeSession(sessionId: string, body: Record<string, unknown>) {
    if (!Array.isArray(body.lines) || body.lines.length === 0) throw new BadRequestException('At least one billing line is required');
    const normalizedLines = body.lines.map(normalizeCompletionLine);
    const requestedTotals = calculateSessionTotals(normalizedLines);
    try {
      const completed = await this.prisma.$transaction(async (tx) => {
        const session = await tx.billingSession.findUnique({ where: { id: sessionId }, include: { invoice: true } });
        if (!session) throw new NotFoundException('Billing session was not found');
        if (session.invoice) return session.invoice;
        if (session.state !== BillingSessionState.ACTIVE && session.state !== BillingSessionState.PAYMENT_PENDING && session.state !== BillingSessionState.SYNC_REQUIRED) throw new ConflictException(`Session cannot complete from ${session.state}`);

        const products = await Promise.all(normalizedLines.map(async (line) => {
          const product = await tx.product.findUnique({ where: { sku: line.sku } });
          if (!product) throw new NotFoundException(`Product ${line.sku} was not found`);
          return product;
        }));

        await tx.billingLine.createMany({
          data: normalizedLines.map((line, index) => {
            const amounts = calculateLineAmounts(line);
            return {
              billingSessionId: sessionId,
              productId: products[index].id,
              lineNumber: index + 1,
              quantityBase: line.quantityBase,
              enteredExpression: line.enteredExpression,
              productNameSnapshot: products[index].nameEnglish,
              skuSnapshot: products[index].sku,
              unitPriceAmountPaise: line.unitPriceAmountPaise,
              priceQuantityBase: line.priceQuantityBase,
              taxAmountPaise: amounts.taxAmountPaise,
              lineTotalAmountPaise: amounts.lineTotalAmountPaise,
              fulfillmentLocation: line.fulfillmentLocation,
            };
          }),
        });

        const grouped = new Map<string, { productId: string; locationId: string; quantityBase: bigint; lineNumbers: number[] }>();
        for (let index = 0; index < normalizedLines.length; index += 1) {
          const line = normalizedLines[index];
          const location = line.fulfillmentLocation
            ? await tx.location.findFirst({ where: { OR: [{ code: line.fulfillmentLocation }, { name: line.fulfillmentLocation }] } })
            : await tx.location.findUnique({ where: { id: session.locationId } });
          if (!location) throw new NotFoundException(`Fulfillment location ${line.fulfillmentLocation ?? session.locationId} was not found`);
          const key = `${products[index].id}:${location.id}`;
          const current = grouped.get(key);
          grouped.set(key, current
            ? { ...current, quantityBase: current.quantityBase + line.quantityBase, lineNumbers: [...current.lineNumbers, index + 1] }
            : { productId: products[index].id, locationId: location.id, quantityBase: line.quantityBase, lineNumbers: [index + 1] });
        }

        for (const movement of grouped.values()) {
          const balance = await tx.inventoryBalance.findUnique({ where: { productId_locationId: { productId: movement.productId, locationId: movement.locationId } } });
          if (!balance) throw new ConflictException('An inventory balance is missing for a billed product');
          const reservation = await tx.stockReservation.findUnique({ where: { billingSessionId_productId_locationId: { billingSessionId: sessionId, productId: movement.productId, locationId: movement.locationId } } });
          const ownReserved = reservation?.state === StockReservationState.ACTIVE ? reservation.quantityBase : 0n;
          const availableToSession = balance.onHandBase - balance.reservedBase + ownReserved;
          if (availableToSession < movement.quantityBase) throw new ConflictException('Stock changed while this bill was open; review the affected line');
          await tx.inventoryBalance.update({
            where: { id: balance.id },
            data: { onHandBase: { decrement: movement.quantityBase }, reservedBase: { decrement: ownReserved }, version: { increment: 1 } },
          });
          await tx.inventoryLedger.create({
            data: {
              productId: movement.productId,
              locationId: movement.locationId,
              onHandDeltaBase: -movement.quantityBase,
              reservedDeltaBase: -ownReserved,
              reason: 'Completed billing sale',
              sourceType: 'BILLING_SESSION',
              sourceReference: `${sessionId}:sale:${movement.productId}:${movement.locationId}`,
              notes: `Billing lines ${movement.lineNumbers.join(', ')}`,
            },
          });
          if (reservation) await tx.stockReservation.update({ where: { id: reservation.id }, data: { state: StockReservationState.COMMITTED, quantityBase: movement.quantityBase } });
        }

        const paymentBody = body.payment && typeof body.payment === 'object' ? body.payment as Record<string, unknown> : null;
        let paymentStatus = 'UNPAID';
        let nextState: BillingSessionState = BillingSessionState.COMPLETED;
        if (paymentBody) {
          const method = this.paymentMethod(paymentBody.method);
          const paymentState = paymentBody.state === 'CAPTURED' ? PaymentAttemptState.CAPTURED : method === BillingPaymentMethod.CREDIT ? PaymentAttemptState.PENDING : PaymentAttemptState.PENDING;
          const amountPaise = positiveInteger(paymentBody.amountPaise ?? requestedTotals.totalAmountPaise, 'payment.amountPaise');
          await tx.paymentAttempt.upsert({
            where: { idempotencyKey: requiredString(paymentBody.idempotencyKey ?? `${session.id}:payment`, 'payment.idempotencyKey') },
            create: {
              billingSessionId: session.id,
              idempotencyKey: requiredString(paymentBody.idempotencyKey ?? `${session.id}:payment`, 'payment.idempotencyKey'),
              method,
              amountPaise,
              state: paymentState,
              providerReference: typeof paymentBody.providerReference === 'string' ? paymentBody.providerReference : undefined,
              providerPayload: this.json(paymentBody.providerPayload),
            },
            update: {},
          });
          paymentStatus = paymentState === PaymentAttemptState.CAPTURED ? 'PAID' : method === BillingPaymentMethod.CREDIT ? 'CREDIT_DUE' : 'PAYMENT_PENDING';
          if (paymentState !== PaymentAttemptState.CAPTURED && method !== BillingPaymentMethod.CASH && method !== BillingPaymentMethod.CARD && method !== BillingPaymentMethod.CREDIT) nextState = BillingSessionState.PAYMENT_PENDING;
        }

        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber: makeInvoiceNumber(session.id),
            billingSessionId: session.id,
            locationId: session.locationId,
            subtotalAmountPaise: requestedTotals.subtotalAmountPaise,
            taxAmountPaise: requestedTotals.taxAmountPaise,
            totalAmountPaise: requestedTotals.totalAmountPaise,
            paymentStatus,
            snapshot: normalizedLines.map((line, index) => ({ sku: products[index].sku, name: products[index].nameEnglish, quantityBase: line.quantityBase.toString(), unitPriceAmountPaise: line.unitPriceAmountPaise, priceQuantityBase: line.priceQuantityBase.toString(), expression: line.enteredExpression })) as Prisma.InputJsonValue,
          },
        });
        await tx.billingSession.update({
          where: { id: session.id },
          data: { state: nextState, firstItemAt: session.firstItemAt ?? new Date(), subtotalAmountPaise: requestedTotals.subtotalAmountPaise, taxAmountPaise: requestedTotals.taxAmountPaise, totalAmountPaise: requestedTotals.totalAmountPaise, completedAt: new Date() },
        });
        const analytics = body.analytics && typeof body.analytics === 'object' ? body.analytics as Record<string, unknown> : null;
        if (analytics?.checkoutDurationMs !== undefined) {
          await tx.billingAnalyticsEvent.create({ data: { billingSessionId: session.id, eventType: 'CHECKOUT_COMPLETED', durationMs: positiveInteger(analytics.checkoutDurationMs, 'analytics.checkoutDurationMs'), payload: { lineCount: normalizedLines.length, offline: session.offline } } });
        }
        await tx.auditEvent.create({ data: { eventType: 'BILLING_SESSION_COMPLETED', entityType: 'BillingSession', entityId: session.id, actorType: 'USER', actorId: typeof body.actorId === 'string' ? body.actorId : null, payload: { invoiceNumber: invoice.invoiceNumber, idempotencyKey: session.idempotencyKey } } });
        return invoice;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return serializeBigInts(completed);
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ConflictException || error instanceof NotFoundException) throw error;
      const existing = await this.prisma.invoice.findUnique({ where: { billingSessionId: sessionId } });
      if (existing) return serializeBigInts(existing);
      throw error;
    }
  }

  async createPaymentAttempt(sessionId: string, body: Record<string, unknown>) {
    await this.getSession(sessionId);
    const idempotencyKey = requiredString(body.idempotencyKey, 'idempotencyKey');
    const existing = await this.prisma.paymentAttempt.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
    return this.prisma.paymentAttempt.create({
      data: {
        billingSessionId: sessionId,
        idempotencyKey,
        method: this.paymentMethod(body.method),
        amountPaise: positiveInteger(body.amountPaise, 'amountPaise'),
        state: PaymentAttemptState.CREATED,
        providerReference: typeof body.providerReference === 'string' ? body.providerReference : undefined,
      },
    });
  }

  async processPaymentWebhook(body: Record<string, unknown>, signature?: string) {
    if (!verifyWebhookSignature(body, signature, process.env.PAYMENT_WEBHOOK_SECRET)) throw new UnauthorizedException('Invalid payment webhook signature');
    const providerEventId = requiredString(body.eventId, 'eventId');
    const existing = await this.prisma.paymentWebhookEvent.findUnique({ where: { providerEventId } });
    if (existing) return { duplicate: true, eventId: providerEventId };
    const providerReference = requiredString(body.providerReference, 'providerReference');
    const attempt = await this.prisma.paymentAttempt.findUnique({ where: { providerReference } });
    if (!attempt) throw new NotFoundException('Payment attempt was not found');
    const captured = body.status === 'CAPTURED';
    await this.prisma.$transaction(async (tx) => {
      await tx.paymentWebhookEvent.create({ data: { provider: typeof body.provider === 'string' ? body.provider : 'razorpay', providerEventId, paymentAttemptId: attempt.id, payload: this.json(body) ?? {} } });
      await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { state: captured ? PaymentAttemptState.CAPTURED : PaymentAttemptState.FAILED, providerPayload: this.json(body) } });
      const invoice = await tx.invoice.findUnique({ where: { billingSessionId: attempt.billingSessionId } });
      if (invoice) await tx.invoice.update({ where: { id: invoice.id }, data: { paymentStatus: captured ? 'PAID' : 'PAYMENT_FAILED' } });
      await tx.billingSession.update({ where: { id: attempt.billingSessionId }, data: { state: captured ? (invoice ? BillingSessionState.COMPLETED : BillingSessionState.ACTIVE) : BillingSessionState.PAYMENT_PENDING } });
    });
    return { duplicate: false, eventId: providerEventId, captured };
  }

  async recordOverride(sessionId: string, body: Record<string, unknown>) {
    await this.getSession(sessionId);
    const state = body.approved ? ManagerOverrideState.APPROVED : ManagerOverrideState.REQUESTED;
    return this.prisma.managerOverride.create({
      data: {
        billingSessionId: sessionId,
        billingLineId: typeof body.billingLineId === 'string' ? body.billingLineId : undefined,
        ruleCode: requiredString(body.ruleCode, 'ruleCode'),
        reason: requiredString(body.reason, 'reason'),
        requestedBy: requiredString(body.requestedBy, 'requestedBy'),
        approvedBy: state === ManagerOverrideState.APPROVED ? requiredString(body.approvedBy, 'approvedBy') : undefined,
        state,
        resolvedAt: state === ManagerOverrideState.APPROVED ? new Date() : undefined,
      },
    });
  }

  async createExternalDraft(body: Record<string, unknown>) {
    if (!Array.isArray(body.lines) || body.lines.length === 0) throw new BadRequestException('Draft lines are required');
    const draft = await this.prisma.externalOrderDraft.create({
      data: {
        billingSessionId: typeof body.billingSessionId === 'string' ? body.billingSessionId : undefined,
        source: requiredString(body.source, 'source'),
        sourceReference: typeof body.sourceReference === 'string' ? body.sourceReference : undefined,
        rawText: requiredString(body.rawText, 'rawText'),
      },
    });
    for (const raw of body.lines as Record<string, unknown>[]) {
      const product = typeof raw.sku === 'string' ? await this.prisma.product.findUnique({ where: { sku: raw.sku } }) : null;
      const rawConfidence = Number(raw.confidenceBasisPoints ?? 0);
      const confidence = Number.isFinite(rawConfidence) ? Math.round(Math.max(0, Math.min(10_000, rawConfidence))) : 0;
      await this.prisma.externalOrderDraftLine.create({
        data: {
          externalOrderDraftId: draft.id,
          sourceText: requiredString(raw.sourceText, 'sourceText'),
          productId: product?.id,
          quantityBase: raw.quantityBase === undefined ? undefined : positiveBigInt(raw.quantityBase, 'quantityBase'),
          confidenceBasisPt: confidence,
          state: product ? confidence >= 9000 ? ExternalOrderLineState.MATCHED : ExternalOrderLineState.REVIEW : ExternalOrderLineState.UNMATCHED,
        },
      });
    }
    return serializeBigInts(await this.prisma.externalOrderDraft.findUnique({ where: { id: draft.id }, include: { lines: { include: { product: true } } } }));
  }

  async approveExternalLine(draftId: string, lineId: string, body: Record<string, unknown>) {
    const line = await this.prisma.externalOrderDraftLine.findFirst({ where: { id: lineId, externalOrderDraftId: draftId } });
    if (!line) throw new NotFoundException('External order line was not found');
    const product = await this.prisma.product.findUnique({ where: { sku: requiredString(body.sku, 'sku') } });
    if (!product) throw new NotFoundException('Approved product was not found');
    return serializeBigInts(await this.prisma.externalOrderDraftLine.update({ where: { id: line.id }, data: { productId: product.id, quantityBase: positiveBigInt(body.quantityBase, 'quantityBase'), state: ExternalOrderLineState.APPROVED, approvedBy: requiredString(body.approvedBy, 'approvedBy') } }));
  }

  async recordAnalytics(body: Record<string, unknown>) {
    return this.prisma.billingAnalyticsEvent.create({ data: { billingSessionId: typeof body.billingSessionId === 'string' ? body.billingSessionId : undefined, eventType: requiredString(body.eventType, 'eventType'), durationMs: body.durationMs === undefined ? undefined : positiveInteger(body.durationMs, 'durationMs'), payload: this.json(body.payload) } });
  }

  async recordDeviceEvent(body: Record<string, unknown>) {
    const eventKey = requiredString(body.eventKey, 'eventKey');
    const eventKind = requiredString(body.eventKind, 'eventKind') as DeviceEventKind;
    if (!Object.values(DeviceEventKind).includes(eventKind)) throw new BadRequestException('Unsupported device event kind');
    return this.prisma.deviceEvent.upsert({
      where: { eventKey },
      create: { deviceId: requiredString(body.deviceId, 'deviceId'), eventKey, eventKind, payload: this.json(body.payload) ?? {}, occurredAt: body.occurredAt ? new Date(String(body.occurredAt)) : new Date() },
      update: {},
    });
  }

  async recovery(locationCode?: string) {
    const location = locationCode ? await this.prisma.location.findUnique({ where: { code: locationCode } }) : null;
    const sessions = await this.prisma.billingSession.findMany({
      where: { ...(location ? { locationId: location.id } : {}), state: { in: [BillingSessionState.PARKED, BillingSessionState.PAYMENT_PENDING, BillingSessionState.SYNC_REQUIRED] } },
      include: { lines: true, payments: true },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    const printFailures = await this.prisma.deviceEvent.findMany({ where: { eventKind: 'PRINT_FAILED' }, orderBy: { occurredAt: 'desc' }, take: 20 });
    return serializeBigInts({ sessions, printFailures });
  }

  private async getSession(sessionId: string) {
    const session = await this.prisma.billingSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Billing session was not found');
    return session;
  }

  private async resolveLocation(locationId: unknown, locationCode: unknown) {
    const location = typeof locationId === 'string'
      ? await this.prisma.location.findUnique({ where: { id: locationId } })
      : typeof locationCode === 'string'
        ? await this.prisma.location.findUnique({ where: { code: locationCode } })
        : null;
    if (!location) throw new NotFoundException('Billing location was not found');
    return location;
  }

  private paymentMethod(value: unknown): BillingPaymentMethod {
    const normalized = requiredString(value, 'payment method').toUpperCase();
    if (!Object.values(BillingPaymentMethod).includes(normalized as BillingPaymentMethod)) throw new BadRequestException('Unsupported payment method');
    return normalized as BillingPaymentMethod;
  }

  private json(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined || value === null) return undefined;
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
