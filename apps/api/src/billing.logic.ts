import { createHmac, timingSafeEqual } from 'node:crypto';

export type CompletionLineInput = {
  sku: string;
  quantityBase: bigint;
  unitPriceAmountPaise: number;
  priceQuantityBase: bigint;
  taxRateBasisPoints: number;
  enteredExpression?: string;
  fulfillmentLocation?: string;
};

export function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

export function positiveInteger(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${field} must be a positive integer`);
  return parsed;
}

export function positiveBigInt(value: unknown, field: string): bigint {
  try {
    const parsed = BigInt(typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' ? value : '0');
    if (parsed <= 0n) throw new Error();
    return parsed;
  } catch {
    throw new Error(`${field} must be a positive base-unit quantity`);
  }
}

export function normalizeCompletionLine(value: unknown): CompletionLineInput {
  if (!value || typeof value !== 'object') throw new Error('Each billing line must be an object');
  const line = value as Record<string, unknown>;
  const quantityBase = positiveBigInt(line.quantityBase, 'quantityBase');
  const priceQuantityBase = positiveBigInt(line.priceQuantityBase ?? 1, 'priceQuantityBase');
  const unitPriceAmountPaise = positiveInteger(line.unitPriceAmountPaise, 'unitPriceAmountPaise');
  const taxRateBasisPoints = line.taxRateBasisPoints === undefined ? 500 : Number(line.taxRateBasisPoints);
  if (!Number.isInteger(taxRateBasisPoints) || taxRateBasisPoints < 0 || taxRateBasisPoints > 10_000) throw new Error('taxRateBasisPoints must be between 0 and 10000');
  return {
    sku: requiredString(line.sku, 'sku'),
    quantityBase,
    unitPriceAmountPaise,
    priceQuantityBase,
    taxRateBasisPoints,
    enteredExpression: typeof line.enteredExpression === 'string' ? line.enteredExpression.trim() : undefined,
    fulfillmentLocation: typeof line.fulfillmentLocation === 'string' ? line.fulfillmentLocation.trim() : undefined,
  };
}

export function calculateLineAmounts(line: CompletionLineInput) {
  const subtotalAmountPaise = Math.round(line.unitPriceAmountPaise * Number(line.quantityBase) / Number(line.priceQuantityBase));
  if (!Number.isSafeInteger(subtotalAmountPaise) || subtotalAmountPaise <= 0) throw new Error('Calculated line subtotal is invalid');
  const taxAmountPaise = Math.round(subtotalAmountPaise * line.taxRateBasisPoints / 10_000);
  return { subtotalAmountPaise, taxAmountPaise, lineTotalAmountPaise: subtotalAmountPaise + taxAmountPaise };
}

export function calculateSessionTotals(lines: CompletionLineInput[]) {
  return lines.reduce((totals, line) => {
    const calculated = calculateLineAmounts(line);
    return {
      subtotalAmountPaise: totals.subtotalAmountPaise + calculated.subtotalAmountPaise,
      taxAmountPaise: totals.taxAmountPaise + calculated.taxAmountPaise,
      totalAmountPaise: totals.totalAmountPaise + calculated.lineTotalAmountPaise,
    };
  }, { subtotalAmountPaise: 0, taxAmountPaise: 0, totalAmountPaise: 0 });
}

export function makeInvoiceNumber(sessionId: string, issuedAt = new Date()) {
  const date = issuedAt.toISOString().slice(0, 10).replaceAll('-', '');
  return `SVT-${date}-${sessionId.replaceAll('-', '').slice(-8).toUpperCase()}`;
}

export function verifyWebhookSignature(payload: unknown, signature: string | undefined, secret: string | undefined) {
  if (!secret) return true;
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function serializeBigInts<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, item: unknown) => typeof item === 'bigint' ? item.toString() : item)) as T;
}
