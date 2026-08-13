export type ReceivingUnit = 'bags' | 'boxes' | 'kg' | 'units';
export type ReceivingRateBasis = 'container' | 'unit' | 'kg' | '100kg';

export type ReceiptLineMathInput = {
  quantity: number;
  packSizeKg: number;
  unitsPerContainer: number;
  receivedAs: ReceivingUnit;
  rate: number;
  rateBasis: ReceivingRateBasis;
  taxRate: number;
  discount: number;
};

export type ReceiptLineAmounts = {
  containerCount: number;
  itemCount: number;
  receivedWeightKg: number;
  subtotal: number;
  taxable: number;
  tax: number;
  total: number;
};

const finitePositive = (value: number, fallback = 0) => Number.isFinite(value) && value > 0 ? value : fallback;
const money = (value: number) => Number(value.toFixed(2));

export function calculateReceiptLine(input: ReceiptLineMathInput): ReceiptLineAmounts {
  const quantity = finitePositive(input.quantity);
  const packSizeKg = finitePositive(input.packSizeKg);
  const unitsPerContainer = Math.max(1, Math.floor(finitePositive(input.unitsPerContainer, 1)));
  const rate = finitePositive(input.rate);
  const containerCount = input.receivedAs === 'bags' || input.receivedAs === 'boxes' ? quantity : 0;
  const itemCount = input.receivedAs === 'boxes' ? quantity * unitsPerContainer : quantity;
  const receivedWeightKg = input.receivedAs === 'kg'
    ? quantity
    : input.receivedAs === 'units' && packSizeKg === 0
      ? 0
      : itemCount * packSizeKg;

  let subtotal = 0;
  if (input.rateBasis === 'container') subtotal = quantity * rate;
  if (input.rateBasis === 'unit') subtotal = itemCount * rate;
  if (input.rateBasis === 'kg') subtotal = receivedWeightKg * rate;
  if (input.rateBasis === '100kg') subtotal = receivedWeightKg / 100 * rate;
  subtotal = money(subtotal);

  const discount = Math.min(Math.max(0, finitePositive(input.discount)), subtotal);
  const taxable = money(subtotal - discount);
  const tax = money(taxable * Math.max(0, input.taxRate || 0) / 100);
  return {
    containerCount,
    itemCount,
    receivedWeightKg: money(receivedWeightKg),
    subtotal,
    taxable,
    tax,
    total: money(taxable + tax),
  };
}

export function calculateInventoryImpact(
  input: ReceiptLineMathInput & { unitKind: 'WEIGHED' | 'COUNTED' },
) {
  const amounts = calculateReceiptLine(input);
  if (input.unitKind === 'WEIGHED') {
    const stockDelta = amounts.receivedWeightKg;
    return {
      stockDelta,
      bagDelta: input.receivedAs === 'bags' || input.receivedAs === 'boxes' ? amounts.itemCount : 0,
      retailDelta: input.receivedAs === 'kg' ? stockDelta : 0,
      costPerBase: stockDelta > 0 ? money(amounts.taxable / stockDelta) : 0,
    };
  }

  const stockDelta = input.receivedAs === 'boxes' ? amounts.itemCount : input.quantity;
  return {
    stockDelta,
    bagDelta: stockDelta,
    retailDelta: 0,
    costPerBase: stockDelta > 0 ? money(amounts.taxable / stockDelta) : 0,
  };
}
