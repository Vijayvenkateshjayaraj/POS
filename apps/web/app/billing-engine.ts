export type BillableProduct = {
  id: number;
  name: string;
  sku: string;
  barcode?: string;
  aliases?: string[];
  unitKind?: 'WEIGHED' | 'COUNTED';
  packSizeKg?: number;
  bagWeightKg?: number;
  bagStock?: number;
  retailStockKg?: number;
  price: number;
  cost?: number;
  stock: number;
};

export type ParsedBillingCommand = {
  productId: number | null;
  quantity: number;
  baseQuantity: number;
  enteredExpression: string;
  mode: 'DEFAULT' | 'WEIGHT' | 'COUNT' | 'AMOUNT' | 'PACK';
  confidence: number;
  sourceText: string;
  error?: string;
};

export type CartGuardrailInput = BillableProduct & {
  lineId: number;
  quantity: number;
};

export type GuardrailIssue = {
  code: 'DUPLICATE_LINE' | 'BELOW_COST' | 'UNUSUAL_QUANTITY' | 'CREDIT_LIMIT' | 'ACCOUNT_HOLD';
  severity: 'warning' | 'block';
  message: string;
  lineIds?: number[];
};

export type ExternalOrderLine = {
  id: string;
  sourceText: string;
  productId: number | null;
  quantity: number;
  confidence: number;
  status: 'MATCHED' | 'REVIEW' | 'UNMATCHED';
  error?: string;
};

const compact = (value: string) => value
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

const roundQuantity = (value: number) => Math.round(value * 1000) / 1000;

export function allocateInventorySale(
  product: Pick<BillableProduct, 'stock' | 'unitKind' | 'packSizeKg' | 'bagWeightKg' | 'bagStock' | 'retailStockKg'>,
  quantity: number,
  saleMode: 'RETAIL' | 'BAG' = 'RETAIL',
) {
  const soldQuantity = roundQuantity(Math.max(0, Math.min(quantity, product.stock)));
  const bagWeightKg = product.bagWeightKg ?? product.packSizeKg ?? 26;
  const currentBags = Math.max(0, Math.floor(product.bagStock ?? (product.unitKind === 'COUNTED' ? product.stock : 0)));
  const currentRetailKg = Math.max(0, product.retailStockKg ?? (product.unitKind === 'WEIGHED' ? product.stock - currentBags * bagWeightKg : 0));

  if (product.unitKind === 'COUNTED') {
    const nextBags = Math.max(0, currentBags - soldQuantity);
    return { bagStock: nextBags, retailStockKg: 0, stock: nextBags, openedBags: 0 };
  }

  const bagSaleCount = soldQuantity / bagWeightKg;
  const isWholeBagSale = saleMode === 'BAG' && Math.abs(bagSaleCount - Math.round(bagSaleCount)) < 0.001;
  if (isWholeBagSale) {
    const bagsSold = Math.min(currentBags, Math.round(bagSaleCount));
    const nextBags = currentBags - bagsSold;
    return {
      bagStock: nextBags,
      retailStockKg: roundQuantity(currentRetailKg),
      stock: roundQuantity(nextBags * bagWeightKg + currentRetailKg),
      openedBags: 0,
    };
  }

  const shortageKg = Math.max(0, soldQuantity - currentRetailKg);
  const openedBags = shortageKg > 0 ? Math.min(currentBags, Math.ceil((shortageKg - 0.000001) / bagWeightKg)) : 0;
  const nextBags = currentBags - openedBags;
  const nextRetailKg = roundQuantity(Math.max(0, currentRetailKg + openedBags * bagWeightKg - soldQuantity));
  return {
    bagStock: nextBags,
    retailStockKg: nextRetailKg,
    stock: roundQuantity(nextBags * bagWeightKg + nextRetailKg),
    openedBags,
  };
}

export function stepQuantity(value: number | string, direction: 'up' | 'down', step = 0.25, min = step, max = Number.POSITIVE_INFINITY) {
  const parsed = Number(value);
  const current = Number.isFinite(parsed) ? parsed : min;
  const epsilon = step / 1_000_000;
  const stepIndex = direction === 'up'
    ? Math.floor((current + epsilon) / step) + 1
    : Math.ceil((current - epsilon) / step) - 1;
  return roundQuantity(Math.min(max, Math.max(min, stepIndex * step)));
}

function scoreProduct(query: string, product: BillableProduct) {
  const normalized = compact(query);
  const sku = compact(product.sku);
  const barcode = compact(product.barcode ?? '');
  const candidates = [product.name, ...(product.aliases ?? [])].map(compact);
  if (!normalized) return 0;
  if (normalized === sku || (barcode && normalized === barcode)) return 1;
  if (candidates.some((candidate) => candidate === normalized)) return 0.98;
  if (candidates.some((candidate) => candidate.includes(normalized) || normalized.includes(candidate))) return 0.92;

  const queryTokens = normalized.split(' ').filter(Boolean);
  const bestTokenScore = candidates.reduce((best, candidate) => {
    const tokens = new Set(candidate.split(' ').filter(Boolean));
    const matches = queryTokens.filter((token) => tokens.has(token) || [...tokens].some((value) => value.startsWith(token))).length;
    return Math.max(best, matches / Math.max(queryTokens.length, 1));
  }, 0);
  return bestTokenScore >= 0.5 ? Math.min(0.88, 0.58 + bestTokenScore * 0.3) : 0;
}

export function parseBillingCommand(input: string, products: BillableProduct[]): ParsedBillingCommand {
  const sourceText = input.trim();
  const fallback: ParsedBillingCommand = {
    productId: null,
    quantity: 0,
    baseQuantity: 0,
    enteredExpression: sourceText,
    mode: 'DEFAULT',
    confidence: 0,
    sourceText,
  };
  if (!sourceText) return { ...fallback, error: 'Enter an item, SKU, or barcode.' };

  const packMatch = sourceText.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*kg\b/i);
  const bagMatch = sourceText.match(/(\d+(?:\.\d+)?)\s*bags?\b/i);
  const amountMatch = sourceText.match(/(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)/i);
  const gramsMatch = sourceText.match(/(\d+(?:\.\d+)?)\s*g(?:rams?)?\b/i);
  const kgMatch = sourceText.match(/(\d+(?:\.\d+)?)\s*kgs?\b/i);
  const countMatch = !packMatch && !bagMatch && !amountMatch && !gramsMatch && !kgMatch
    ? sourceText.match(/^\s*(\d+(?:\.\d+)?)\s+(?=[a-z\p{L}])/iu)
    : null;

  const productQuery = sourceText
    .replace(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*kg\b/ig, ' ')
    .replace(/(\d+(?:\.\d+)?)\s*bags?\b/ig, ' ')
    .replace(/(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)/ig, ' ')
    .replace(/(\d+(?:\.\d+)?)\s*g(?:rams?)?\b/ig, ' ')
    .replace(/(\d+(?:\.\d+)?)\s*kgs?\b/ig, ' ')
    .replace(/^\s*\d+(?:\.\d+)?\s+(?=[a-z\p{L}])/iu, ' ')
    .trim();

  const ranked = products
    .map((product) => ({ product, score: scoreProduct(productQuery || sourceText, product) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
  const match = ranked[0];
  if (!match) return { ...fallback, error: `No product matches “${productQuery || sourceText}”.` };

  const product = match.product;
  const isCounted = product.unitKind === 'COUNTED';
  let quantity = 1;
  let mode: ParsedBillingCommand['mode'] = 'DEFAULT';

  if (bagMatch) {
    const bags = Number(bagMatch[1]);
    if (!Number.isInteger(bags)) return { ...fallback, productId: product.id, confidence: match.score, error: 'Bags must be sold as whole units.' };
    const bagWeight = product.bagWeightKg ?? product.packSizeKg;
    if (!isCounted && !bagWeight) return { ...fallback, productId: product.id, confidence: match.score, error: `Set the bag weight for ${product.name} before selling bags.` };
    quantity = isCounted ? bags : bags * bagWeight!;
    mode = 'PACK';
  } else if (packMatch) {
    const packs = Number(packMatch[1]);
    const packKg = Number(packMatch[2]);
    quantity = isCounted && product.packSizeKg && Math.abs(product.packSizeKg - packKg) < 0.01 ? packs : packs * packKg;
    mode = 'PACK';
  } else if (amountMatch) {
    quantity = Number(amountMatch[1]) / product.price;
    mode = 'AMOUNT';
  } else if (gramsMatch) {
    const kg = Number(gramsMatch[1]) / 1000;
    quantity = isCounted && product.packSizeKg ? kg / product.packSizeKg : kg;
    mode = 'WEIGHT';
  } else if (kgMatch) {
    const kg = Number(kgMatch[1]);
    quantity = isCounted && product.packSizeKg ? kg / product.packSizeKg : kg;
    mode = 'WEIGHT';
  } else if (countMatch) {
    quantity = Number(countMatch[1]);
    mode = 'COUNT';
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ...fallback, productId: product.id, confidence: match.score, error: 'Quantity must be greater than zero.' };
  }
  if (isCounted && Math.abs(quantity - Math.round(quantity)) > 0.001) {
    return { ...fallback, productId: product.id, confidence: match.score, error: `${product.name} must be sold as a whole pack.` };
  }

  quantity = roundQuantity(isCounted ? Math.round(quantity) : quantity);
  const baseQuantity = isCounted ? quantity : Math.round(quantity * 1000);
  return {
    productId: product.id,
    quantity,
    baseQuantity,
    enteredExpression: sourceText,
    mode,
    confidence: match.score,
    sourceText,
  };
}

export function evaluateGuardrails(
  cart: CartGuardrailInput[],
  account?: { outstanding: number; creditLimit: number; status?: 'Active' | 'On hold' } | null,
  payment = 'UPI',
): GuardrailIssue[] {
  const issues: GuardrailIssue[] = [];
  const linesByProduct = new Map<number, number[]>();
  cart.forEach((line) => linesByProduct.set(line.id, [...(linesByProduct.get(line.id) ?? []), line.lineId]));
  linesByProduct.forEach((lineIds) => {
    if (lineIds.length > 1) issues.push({ code: 'DUPLICATE_LINE', severity: 'warning', message: 'The same product appears on multiple lines.', lineIds });
  });
  cart.forEach((line) => {
    if (line.cost && line.price < line.cost) issues.push({ code: 'BELOW_COST', severity: 'block', message: `${line.name} is priced below cost.`, lineIds: [line.lineId] });
    if (line.quantity > (line.unitKind === 'COUNTED' ? 25 : 50)) issues.push({ code: 'UNUSUAL_QUANTITY', severity: 'warning', message: `Confirm the unusually large quantity for ${line.name}.`, lineIds: [line.lineId] });
  });
  if (account?.status === 'On hold') issues.push({ code: 'ACCOUNT_HOLD', severity: 'block', message: 'This restaurant account is on hold.' });
  if (payment === 'Credit' && account) {
    const total = cart.reduce((sum, line) => sum + line.price * line.quantity * 1.05, 0);
    if (account.outstanding + total > account.creditLimit) issues.push({ code: 'CREDIT_LIMIT', severity: 'block', message: 'This bill exceeds the available credit limit.' });
  }
  return issues;
}

export function parseExternalOrder(text: string, products: BillableProduct[]): ExternalOrderLine[] {
  return text
    .split(/\r?\n|,(?=\s*\d)/)
    .map((line) => line.trim().replace(/^[-•]\s*/, ''))
    .filter(Boolean)
    .map((sourceText, index) => {
      const parsed = parseBillingCommand(sourceText, products);
      const status: ExternalOrderLine['status'] = parsed.productId === null
        ? 'UNMATCHED'
        : parsed.confidence >= 0.9
          ? 'MATCHED'
          : 'REVIEW';
      return {
        id: `external-${index + 1}`,
        sourceText,
        productId: parsed.productId,
        quantity: parsed.quantity,
        confidence: parsed.confidence,
        status,
        error: parsed.error,
      };
    });
}
