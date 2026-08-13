import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateInventoryImpact, calculateReceiptLine } from './supplier-receiving.ts';

test('calculates a taxed bag-rate supplier line', () => {
  assert.deepEqual(calculateReceiptLine({
    quantity: 50,
    packSizeKg: 10,
    unitsPerContainer: 1,
    receivedAs: 'bags',
    rate: 638.1,
    rateBasis: 'container',
    taxRate: 5,
    discount: 0,
  }), {
    containerCount: 50,
    itemCount: 50,
    receivedWeightKg: 500,
    subtotal: 31_905,
    taxable: 31_905,
    tax: 1_595.25,
    total: 33_500.25,
  });
});

test('supports a rate quoted per 100 kg with a discount', () => {
  const amounts = calculateReceiptLine({
    quantity: 2,
    packSizeKg: 30,
    unitsPerContainer: 1,
    receivedAs: 'bags',
    rate: 9_700,
    rateBasis: '100kg',
    taxRate: 0,
    discount: 20,
  });
  assert.equal(amounts.receivedWeightKg, 60);
  assert.equal(amounts.subtotal, 5_820);
  assert.equal(amounts.total, 5_800);
});

test('converts boxes into individual counted stock in one receipt impact', () => {
  assert.deepEqual(calculateInventoryImpact({
    quantity: 5,
    packSizeKg: 1,
    unitsPerContainer: 20,
    receivedAs: 'boxes',
    rate: 152,
    rateBasis: 'unit',
    taxRate: 5,
    discount: 0,
    unitKind: 'COUNTED',
  }), {
    stockDelta: 100,
    bagDelta: 100,
    retailDelta: 0,
    costPerBase: 152,
  });
});

test('receiving loose kilograms updates retail stock instead of sealed bags', () => {
  assert.deepEqual(calculateInventoryImpact({
    quantity: 100,
    packSizeKg: 0,
    unitsPerContainer: 1,
    receivedAs: 'kg',
    rate: 124.6,
    rateBasis: 'kg',
    taxRate: 0,
    discount: 0,
    unitKind: 'WEIGHED',
  }), {
    stockDelta: 100,
    bagDelta: 0,
    retailDelta: 100,
    costPerBase: 124.6,
  });
});
