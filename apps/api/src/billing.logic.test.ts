import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { calculateSessionTotals, makeInvoiceNumber, normalizeCompletionLine, verifyWebhookSignature } from './billing.logic.ts';

test('normalizes base quantities and calculates paise without floating stock quantities', () => {
  const rice = normalizeCompletionLine({ sku: 'RICE-PONNI-LOOSE', quantityBase: '2500', unitPriceAmountPaise: 7200, priceQuantityBase: '1000', taxRateBasisPoints: 500 });
  const oil = normalizeCompletionLine({ sku: 'OIL-GINGELLY-1L', quantityBase: '2', unitPriceAmountPaise: 34900, priceQuantityBase: '1', taxRateBasisPoints: 500 });
  assert.deepEqual(calculateSessionTotals([rice, oil]), {
    subtotalAmountPaise: 87800,
    taxAmountPaise: 4390,
    totalAmountPaise: 92190,
  });
});

test('rejects invalid quantities and tax rates', () => {
  assert.throws(() => normalizeCompletionLine({ sku: 'RICE', quantityBase: 0, unitPriceAmountPaise: 100, priceQuantityBase: 1000 }), /positive base-unit/);
  assert.throws(() => normalizeCompletionLine({ sku: 'RICE', quantityBase: 1, unitPriceAmountPaise: 100, priceQuantityBase: 1000, taxRateBasisPoints: 12000 }), /between 0 and 10000/);
});

test('produces stable invoice numbers from a session identifier', () => {
  const number = makeInvoiceNumber('00000000-0000-4000-8000-123456789abc', new Date('2026-08-08T12:00:00Z'));
  assert.equal(number, 'SVT-20260808-56789ABC');
});

test('accepts only the expected webhook HMAC when a secret is configured', () => {
  const body = { eventId: 'evt-1', status: 'CAPTURED' };
  const signature = createHmac('sha256', 'secret').update(JSON.stringify(body)).digest('hex');
  assert.equal(verifyWebhookSignature(body, signature, 'secret'), true);
  assert.equal(verifyWebhookSignature(body, 'bad', 'secret'), false);
});
