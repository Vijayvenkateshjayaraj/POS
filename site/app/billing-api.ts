type ApiCartLine = {
  sku: string;
  name: string;
  unitKind: 'WEIGHED' | 'COUNTED';
  quantity: number;
  price: number;
  enteredExpression?: string;
  fulfillmentShop?: string;
};

export type CompleteBillingInput = {
  idempotencyKey: string;
  recipient: Record<string, unknown>;
  lines: ApiCartLine[];
  payment: string;
  paymentPending: boolean;
  offline: boolean;
  durationSeconds?: number;
};

const apiSkuByPrototypeSku: Record<string, string> = {
  'RIC-PON-01': 'RICE-PONNI-LOOSE',
  'DAL-TOO-02': 'DAL-TOOR-LOOSE',
  'OIL-GIN-01': 'OIL-GINGELLY-1L',
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(4500),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText })) as { message?: string };
    throw new Error(error.message ?? `Billing API returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function persistCompletedBill(input: CompleteBillingInput) {
  const session = await postJson<{ id: string }>('/api/v1/billing/sessions', {
    idempotencyKey: input.idempotencyKey,
    locationCode: 'ANNA_NAGAR',
    channel: 'POS',
    recipient: input.recipient,
    offline: input.offline,
  });
  const lines = input.lines.map((line) => ({
    sku: apiSkuByPrototypeSku[line.sku] ?? line.sku,
    quantityBase: line.unitKind === 'WEIGHED' ? Math.round(line.quantity * 1000) : Math.round(line.quantity),
    unitPriceAmountPaise: Math.round(line.price * 100),
    priceQuantityBase: line.unitKind === 'WEIGHED' ? 1000 : 1,
    taxRateBasisPoints: 500,
    enteredExpression: line.enteredExpression,
    fulfillmentLocation: line.fulfillmentShop,
  }));
  const reservationLines = lines.map((line) => ({
    sku: line.sku,
    quantityBase: line.quantityBase,
    locationCode: line.fulfillmentLocation === 'Ayyanambakkam' ? 'AYYANAMBAKKAM' : 'ANNA_NAGAR',
  }));
  await postJson(`/api/v1/billing/sessions/${session.id}/reservations`, { lines: reservationLines, ttlSeconds: 600 });
  const normalizedPayment = input.payment.includes('+') ? 'SPLIT' : input.payment.split(' ')[0].toUpperCase();
  return postJson<{ invoiceNumber: string; paymentStatus: string }>(`/api/v1/billing/sessions/${session.id}/complete`, {
    lines,
    actorId: 'demo-cashier',
    payment: {
      idempotencyKey: `${input.idempotencyKey}:payment`,
      method: normalizedPayment,
      amountPaise: Math.round(input.lines.reduce((sum, line) => sum + line.price * line.quantity, 0) * 1.05 * 100),
      state: input.paymentPending || normalizedPayment === 'CREDIT' ? 'PENDING' : 'CAPTURED',
      providerReference: normalizedPayment === 'UPI' ? `${input.idempotencyKey}:upi` : undefined,
    },
    analytics: { checkoutDurationMs: (input.durationSeconds ?? 0) * 1000 },
  });
}
