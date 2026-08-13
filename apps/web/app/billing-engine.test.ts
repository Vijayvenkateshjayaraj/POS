import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateInventorySale, evaluateGuardrails, parseBillingCommand, parseExternalOrder, stepQuantity, type BillableProduct } from './billing-engine.ts';

const products: BillableProduct[] = [
  { id: 1, name: 'Ponni Boiled Rice', sku: 'RIC-PON-01', barcode: '8901', aliases: ['ponni rice', 'பொன்னி அரிசி'], unitKind: 'WEIGHED', bagWeightKg: 26, price: 72, cost: 61, stock: 100 },
  { id: 2, name: 'Aashirvaad Atta', sku: 'FLO-AAT-05', aliases: ['atta'], unitKind: 'COUNTED', packSizeKg: 5, price: 292, cost: 258, stock: 20 },
  { id: 3, name: 'Toor Dal', sku: 'DAL-TOO-02', aliases: ['thuvaram paruppu'], unitKind: 'WEIGHED', price: 168, cost: 145, stock: 50 },
];

test('parses weighed, amount, pack, barcode, and Tamil commands', () => {
  assert.equal(parseBillingCommand('2.5kg ponni', products).quantity, 2.5);
  assert.equal(parseBillingCommand('500g ponni rice', products).quantity, 0.5);
  assert.equal(parseBillingCommand('₹200 ponni', products).quantity, 2.778);
  assert.equal(parseBillingCommand('3 x 5kg atta', products).quantity, 3);
  assert.equal(parseBillingCommand('2 bags ponni', products).quantity, 52);
  assert.equal(parseBillingCommand('8901', products).productId, 1);
  assert.equal(parseBillingCommand('1kg பொன்னி அரிசி', products).productId, 1);
});

test('opens a sealed bag for retail sales and keeps the remainder in loose stock', () => {
  const result = allocateInventorySale({ unitKind: 'WEIGHED', stock: 260, bagStock: 10, retailStockKg: 0, bagWeightKg: 26 }, 12, 'RETAIL');
  assert.deepEqual(result, { bagStock: 9, retailStockKg: 14, stock: 248, openedBags: 1 });
});

test('uses loose stock first and removes sealed bags directly for bag sales', () => {
  const retailSale = allocateInventorySale({ unitKind: 'WEIGHED', stock: 274, bagStock: 10, retailStockKg: 14, bagWeightKg: 26 }, 12, 'RETAIL');
  assert.deepEqual(retailSale, { bagStock: 10, retailStockKg: 2, stock: 262, openedBags: 0 });
  const bagSale = allocateInventorySale({ unitKind: 'WEIGHED', stock: 274, bagStock: 10, retailStockKg: 14, bagWeightKg: 26 }, 26, 'BAG');
  assert.deepEqual(bagSale, { bagStock: 9, retailStockKg: 14, stock: 248, openedBags: 0 });
});

test('rejects fractional counted packs and unknown products', () => {
  assert.match(parseBillingCommand('2.5kg atta', products).error ?? '', /whole pack/);
  assert.match(parseBillingCommand('1kg mystery flour', products).error ?? '', /No product/);
});

test('detects duplicate, below-cost, high-quantity, and credit guardrails', () => {
  const issues = evaluateGuardrails([
    { ...products[0], lineId: 1, quantity: 60, price: 55 },
    { ...products[0], lineId: 2, quantity: 1 },
  ], { outstanding: 900, creditLimit: 1000, status: 'Active' }, 'Credit');
  assert.deepEqual(new Set(issues.map((issue) => issue.code)), new Set(['DUPLICATE_LINE', 'BELOW_COST', 'UNUSUAL_QUANTITY', 'CREDIT_LIMIT']));
});

test('keeps uncertain external lines in review and unknown lines unmatched', () => {
  const lines = parseExternalOrder('10kg ponni\n2 atta\n3kg unknown item', products);
  assert.equal(lines[0].status, 'MATCHED');
  assert.equal(lines[1].productId, 2);
  assert.equal(lines[2].status, 'UNMATCHED');
});

test('steps weighed quantities on exact quarter-kilogram boundaries', () => {
  assert.equal(stepQuantity(1, 'up'), 1.25);
  assert.equal(stepQuantity(1, 'down'), 0.75);
  assert.equal(stepQuantity(1.01, 'up'), 1.25);
  assert.equal(stepQuantity(1.01, 'down'), 1);
  assert.equal(stepQuantity(0.25, 'down'), 0.25);
});
