'use client';

import {
  Fragment,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
} from 'react';

import {
  calculateInventoryImpact,
  calculateReceiptLine,
  type ReceivingRateBasis,
  type ReceivingUnit,
} from './supplier-receiving';

export type InventoryProduct = {
  id: number;
  name: string;
  short: string;
  sku: string;
  category: string;
  unit: string;
  price: number;
  stock: number;
  bagStock: number;
  retailStockKg: number;
  bagWeightKg: number;
  reorder: number;
  color: string;
  shop: string;
  barcode?: string;
  aliases?: string[];
  unitKind: 'WEIGHED' | 'COUNTED';
  packSizeKg?: number;
  cost: number;
  otherShopStock?: number;
};

type ReceiptLine = {
  id: number;
  mode: 'search' | 'existing' | 'new';
  query: string;
  productId: number | null;
  name: string;
  sku: string;
  category: string;
  hsn: string;
  unitKind: 'WEIGHED' | 'COUNTED';
  packSize: string;
  unitsPerContainer: string;
  quantity: string;
  receivedAs: ReceivingUnit;
  rate: string;
  rateBasis: ReceivingRateBasis;
  taxRate: string;
  discount: string;
};

const supplierSuggestions = [
  'Sri Radha Lakshmi Modern Rice Mill',
  'J. Saravanakumar',
  'Sree Muthukumaran Modern Rice Mill',
  'Vimulan Global Private Limited',
  'Suchi Traders',
  'Shrivel Hitech Rice Industries',
  'Trakx Food Products',
  'M.B. Enterprise',
];

const categoryColors: Record<string, string> = {
  Grains: '#d7bd75',
  Pulses: '#e0a05b',
  Flour: '#cba17d',
  Spices: '#b47e5b',
  Oils: '#d49a46',
  Sweeteners: '#9e6d43',
  Other: '#91aaba',
};

let nextReceiptLineId = 1;

function blankLine(overrides: Partial<ReceiptLine> = {}): ReceiptLine {
  return {
    id: nextReceiptLineId++,
    mode: 'search',
    query: '',
    productId: null,
    name: '',
    sku: '',
    category: 'Grains',
    hsn: '',
    unitKind: 'WEIGHED',
    packSize: '',
    unitsPerContainer: '1',
    quantity: '',
    receivedAs: 'bags',
    rate: '',
    rateBasis: 'container',
    taxRate: '0',
    discount: '',
    ...overrides,
  };
}

const money = (value: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
}).format(value);

const productInitials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase();

const lineMath = (line: ReceiptLine) => calculateReceiptLine({
  quantity: Number(line.quantity),
  packSizeKg: Number(line.packSize),
  unitsPerContainer: Number(line.unitsPerContainer),
  receivedAs: line.receivedAs,
  rate: Number(line.rate),
  rateBasis: line.rateBasis,
  taxRate: Number(line.taxRate),
  discount: Number(line.discount),
});

function rateBasisLabel(basis: ReceivingRateBasis, receivedAs: ReceivingUnit) {
  if (basis === 'container') return receivedAs === 'boxes' ? 'per box' : receivedAs === 'bags' ? 'per bag' : 'per entry';
  if (basis === 'unit') return 'per unit';
  if (basis === '100kg') return 'per 100 kg';
  return 'per kg';
}

export function SupplierReceivingPage({
  products,
  setProducts,
}: {
  products: InventoryProduct[];
  setProducts: Dispatch<SetStateAction<InventoryProduct[]>>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [supplier, setSupplier] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [billDate, setBillDate] = useState(today);
  const [deliveryDate, setDeliveryDate] = useState(today);
  const [location, setLocation] = useState('Anna Nagar');
  const [paymentTerms, setPaymentTerms] = useState('Credit');
  const [vehicleReference, setVehicleReference] = useState('');
  const [attachment, setAttachment] = useState('');
  const [lines, setLines] = useState<ReceiptLine[]>([blankLine()]);
  const [activeSearchId, setActiveSearchId] = useState<number | null>(null);
  const [freight, setFreight] = useState('');
  const [otherCharges, setOtherCharges] = useState('');
  const [roundOff, setRoundOff] = useState('');
  const [receivedMessage, setReceivedMessage] = useState('');
  const [validationVisible, setValidationVisible] = useState(false);
  const receiptTable = useRef<HTMLTableElement>(null);

  const updateLine = <K extends keyof ReceiptLine>(id: number, key: K, value: ReceiptLine[K]) => {
    setLines((current) => current.map((line) => line.id === id ? { ...line, [key]: value } : line));
    setReceivedMessage('');
  };

  const matchingProducts = (line: ReceiptLine) => {
    const query = line.query.trim().toLowerCase();
    if (!query) return products.slice(0, 6);
    return products.filter((product) => `${product.name} ${product.sku} ${product.barcode ?? ''} ${(product.aliases ?? []).join(' ')}`.toLowerCase().includes(query)).slice(0, 6);
  };

  const selectProduct = (lineId: number, product: InventoryProduct) => {
    setLines((current) => current.map((line) => line.id === lineId ? {
      ...line,
      mode: 'existing',
      productId: product.id,
      query: product.name,
      name: product.name,
      sku: product.sku,
      category: product.category,
      unitKind: product.unitKind,
      packSize: String(product.bagWeightKg || product.packSizeKg || ''),
    } : line));
    setActiveSearchId(null);
  };

  const createProductInline = (line: ReceiptLine) => {
    const proposedName = line.query.trim();
    setLines((current) => current.map((candidate) => candidate.id === line.id ? {
      ...candidate,
      mode: 'new',
      productId: null,
      name: proposedName,
      sku: candidate.sku || productInitials(proposedName).padEnd(3, 'X') + '-NEW-',
    } : candidate));
    setActiveSearchId(null);
  };

  const addRow = (count = 1) => {
    setLines((current) => [...current, ...Array.from({ length: count }, () => blankLine())]);
    window.setTimeout(() => {
      const inputs = receiptTable.current?.querySelectorAll<HTMLInputElement>('.receiving-product-input');
      inputs?.[inputs.length - count]?.focus();
    });
  };

  const removeRow = (id: number) => setLines((current) => current.length === 1 ? [blankLine()] : current.filter((line) => line.id !== id));

  const newSkuDuplicate = (line: ReceiptLine) => line.mode === 'new' && Boolean(line.sku.trim()) && (
    products.some((product) => product.sku.toLowerCase() === line.sku.trim().toLowerCase()) ||
    lines.some((candidate) => candidate.id !== line.id && candidate.mode === 'new' && candidate.sku.trim().toLowerCase() === line.sku.trim().toLowerCase())
  );

  const rowIssues = (line: ReceiptLine) => {
    const issues: string[] = [];
    if (line.mode === 'search' || (line.mode === 'existing' && !line.productId)) issues.push('Choose or create a product');
    if (line.mode === 'new' && (!line.name.trim() || !line.sku.trim())) issues.push('Complete the new item setup');
    if (newSkuDuplicate(line)) issues.push('SKU already exists');
    if (!(Number(line.quantity) > 0)) issues.push('Enter quantity');
    if (!(Number(line.rate) > 0)) issues.push('Enter purchase rate');
    if ((line.receivedAs === 'bags' || line.receivedAs === 'boxes' || line.rateBasis === 'kg' || line.rateBasis === '100kg') && !(Number(line.packSize) > 0)) issues.push('Enter pack size');
    if (line.receivedAs === 'boxes' && !(Number(line.unitsPerContainer) > 0)) issues.push('Enter packs per box');
    return issues;
  };

  const issueCount = lines.reduce((sum, line) => sum + rowIssues(line).length, 0)
    + (supplier.trim() ? 0 : 1)
    + (billNumber.trim() ? 0 : 1)
    + (billDate ? 0 : 1)
    + (deliveryDate ? 0 : 1);

  const totals = useMemo(() => lines.reduce((result, line) => {
    const amounts = lineMath(line);
    result.subtotal += amounts.subtotal;
    result.discount += amounts.subtotal - amounts.taxable;
    result.tax += amounts.tax;
    result.weight += amounts.receivedWeightKg;
    result.total += amounts.total;
    return result;
  }, { subtotal: 0, discount: 0, tax: 0, weight: 0, total: 0 }), [lines]);
  const grandTotal = totals.total + Number(freight || 0) + Number(otherCharges || 0) + Number(roundOff || 0);

  const resetReceipt = () => {
    setSupplier('');
    setBillNumber('');
    setBillDate(today);
    setDeliveryDate(today);
    setPaymentTerms('Credit');
    setVehicleReference('');
    setAttachment('');
    setFreight('');
    setOtherCharges('');
    setRoundOff('');
    setLines([blankLine()]);
    setValidationVisible(false);
  };

  const loadSampleBill = () => {
    setSupplier('Suchi Traders');
    setBillNumber('GST/404/2026-27');
    setBillDate('2026-07-04');
    setDeliveryDate('2026-07-04');
    setLocation('Anna Nagar');
    setVehicleReference('TN18CY3456');
    setPaymentTerms('Credit');
    setLines([
      blankLine({ mode: 'new', query: 'Nagasgold Ponni Boiled Rice 10 kg', name: 'Nagasgold Ponni Boiled Rice 10 kg', sku: 'RIC-NAG-PON-10', hsn: '10061010', unitKind: 'COUNTED', packSize: '10', quantity: '50', receivedAs: 'bags', rate: '638.10', rateBasis: 'container', taxRate: '5' }),
      blankLine({ mode: 'new', query: 'Nagasgold Ponni Boiled Rice 5 kg', name: 'Nagasgold Ponni Boiled Rice 5 kg', sku: 'RIC-NAG-PON-05', hsn: '10061010', unitKind: 'COUNTED', packSize: '5', quantity: '50', receivedAs: 'bags', rate: '333.33', rateBasis: 'container', taxRate: '5' }),
    ]);
    setFreight('');
    setOtherCharges('');
    setRoundOff('-0.08');
    setReceivedMessage('Sample loaded from the attached Suchi Traders bill. Review it before receiving.');
    setValidationVisible(false);
  };

  const receiveStock = () => {
    setValidationVisible(true);
    if (issueCount > 0) return;

    const createdCount = lines.filter((line) => line.mode === 'new').length;
    const updatedCount = lines.filter((line) => line.mode === 'existing').length;
    setProducts((current) => {
      const next = current.map((product) => ({ ...product }));
      let nextId = Math.max(0, ...next.map((product) => product.id)) + 1;

      for (const line of lines) {
        const impact = calculateInventoryImpact({
          quantity: Number(line.quantity),
          packSizeKg: Number(line.packSize),
          unitsPerContainer: Number(line.unitsPerContainer),
          receivedAs: line.receivedAs,
          rate: Number(line.rate),
          rateBasis: line.rateBasis,
          taxRate: Number(line.taxRate),
          discount: Number(line.discount),
          unitKind: line.unitKind,
        });

        if (line.mode === 'existing' && line.productId) {
          const index = next.findIndex((product) => product.id === line.productId);
          if (index >= 0) {
            const product = next[index];
            next[index] = {
              ...product,
              stock: Number((product.stock + impact.stockDelta).toFixed(2)),
              bagStock: Number((product.bagStock + impact.bagDelta).toFixed(2)),
              retailStockKg: Number((product.retailStockKg + impact.retailDelta).toFixed(2)),
              cost: impact.costPerBase,
            };
          }
          continue;
        }

        const normalizedName = line.name.trim();
        next.unshift({
          id: nextId++,
          name: normalizedName,
          short: productInitials(normalizedName) || 'NI',
          sku: line.sku.trim().toUpperCase(),
          category: line.category,
          unit: line.unitKind === 'WEIGHED' ? 'kg' : Number(line.packSize) > 0 ? `${Number(line.packSize)} kg` : 'unit',
          unitKind: line.unitKind,
          packSizeKg: line.unitKind === 'COUNTED' ? Number(line.packSize) || undefined : undefined,
          price: impact.costPerBase,
          cost: impact.costPerBase,
          stock: impact.stockDelta,
          bagStock: impact.bagDelta,
          retailStockKg: impact.retailDelta,
          bagWeightKg: Number(line.packSize) || 1,
          reorder: Math.max(10, Math.ceil(impact.stockDelta * 0.2)),
          color: categoryColors[line.category] ?? categoryColors.Other,
          shop: location,
        });
      }
      return next;
    });

    const receiptId = `GRN-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
    setReceivedMessage(`${receiptId} received from ${supplier}: ${lines.length} line${lines.length === 1 ? '' : 's'} posted together, ${createdCount} item${createdCount === 1 ? '' : 's'} created, and ${updatedCount} existing item${updatedCount === 1 ? '' : 's'} updated.`);
    resetReceipt();
  };

  const handleGridKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    const target = event.target as HTMLElement;
    if (!target.matches('[data-receiving-field]')) return;
    const fields = [...(receiptTable.current?.querySelectorAll<HTMLElement>('[data-receiving-field]') ?? [])].filter((field) => !field.hasAttribute('disabled'));
    const index = fields.indexOf(target);
    if (index < 0) return;
    event.preventDefault();
    if (fields[index + 1]) fields[index + 1].focus();
    else addRow();
  };

  return (
    <div className="page receiving-page">
      <div className="page-title receiving-title">
        <div><p>Purchasing &amp; inventory</p><h1>Supplier bill / stock receiving</h1><span>Enter the bill once, match every item, then update inventory together.</span></div>
        <div className="page-actions"><button className="secondary-action" onClick={loadSampleBill}>▧ Use sample bill</button><label className="secondary-action receiving-attach">⌕ Attach bill<input type="file" accept="image/*,.pdf" onChange={(event) => setAttachment(event.target.files?.[0]?.name ?? '')} /></label></div>
      </div>

      {receivedMessage && <div className="inventory-success receiving-success" role="status"><span>{receivedMessage.startsWith('GRN-') ? '✓' : 'i'}</span><div><strong>{receivedMessage.startsWith('GRN-') ? 'Stock received successfully' : 'Draft ready'}</strong><small>{receivedMessage}</small></div></div>}

      <section className="receiving-card bill-details-card">
        <div className="receiving-section-heading"><div><span>1</span><div><p>Bill details</p><h2>Delivery information</h2></div></div><small>{attachment ? `Attached: ${attachment}` : 'No bill attached'}</small></div>
        <div className="bill-details-grid">
          <label className="supplier-field"><span>Supplier name *</span><input list="supplier-list" value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Start typing supplier name" className={validationVisible && !supplier.trim() ? 'invalid' : ''} /><datalist id="supplier-list">{supplierSuggestions.map((name) => <option value={name} key={name} />)}</datalist></label>
          <label><span>Bill number *</span><input value={billNumber} onChange={(event) => setBillNumber(event.target.value)} placeholder="Example: GST/404/2026-27" className={validationVisible && !billNumber.trim() ? 'invalid' : ''} /></label>
          <label><span>Bill date *</span><input type="date" value={billDate} onChange={(event) => setBillDate(event.target.value)} /></label>
          <label><span>Delivery date *</span><input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} /></label>
          <label><span>Receiving location *</span><select value={location} onChange={(event) => setLocation(event.target.value)}><option>Anna Nagar</option><option>Ayyanambakkam</option></select></label>
          <label><span>Payment terms</span><select value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)}><option>Credit</option><option>Paid</option><option>Cash on delivery</option><option>Due in 30 days</option><option>Due in 45 days</option></select></label>
          <label><span>Vehicle / reference</span><input value={vehicleReference} onChange={(event) => setVehicleReference(event.target.value)} placeholder="Optional" /></label>
        </div>
      </section>

      <section className="receiving-card receiving-lines-card">
        <div className="receiving-section-heading"><div><span>2</span><div><p>Item entry</p><h2>Products on this bill</h2></div></div><small><kbd>Enter</kbd> moves to the next cell · <kbd>Tab</kbd> works like a spreadsheet</small></div>
        <div className="receiving-table-wrap">
          <table className="receiving-table" ref={receiptTable} onKeyDown={handleGridKeyDown}>
            <thead><tr><th>#</th><th>Product / variant</th><th>HSN</th><th>Pack kg</th><th>Packs / case</th><th>Qty</th><th>Receive as</th><th>Purchase rate</th><th>Rate basis</th><th>Tax %</th><th>Discount</th><th>Line total</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {lines.map((line, index) => {
                const amounts = lineMath(line);
                const selectedProduct = products.find((product) => product.id === line.productId);
                const matches = matchingProducts(line);
                const issues = rowIssues(line);
                return <Fragment key={line.id}>
                  <tr className={validationVisible && issues.length ? 'row-invalid' : ''}>
                    <td className="row-number">{index + 1}</td>
                    <td className="receiving-product-cell">
                      {line.mode === 'existing' && selectedProduct ? <div className="receiving-selected-product"><span className="mini-product" style={{ '--product-color': selectedProduct.color } as CSSProperties}>{selectedProduct.short}</span><span><strong>{selectedProduct.name}</strong><small>{selectedProduct.sku} · {selectedProduct.shop}</small></span><button title="Choose a different product" onClick={() => updateLine(line.id, 'mode', 'search')}>×</button></div> : <div className="receiving-product-search"><span>⌕</span><input className="receiving-product-input" data-receiving-field value={line.query} onFocus={() => setActiveSearchId(line.id)} onChange={(event) => { updateLine(line.id, 'query', event.target.value); updateLine(line.id, 'mode', 'search'); updateLine(line.id, 'productId', null); setActiveSearchId(line.id); }} onKeyDown={(event) => { if (event.key === 'Enter' && activeSearchId === line.id && matches[0]) { event.preventDefault(); event.stopPropagation(); selectProduct(line.id, matches[0]); } if (event.key === 'Escape') setActiveSearchId(null); }} placeholder="Type name, SKU or barcode" />
                        {activeSearchId === line.id && <div className="receiving-product-results">{matches.map((product) => <button type="button" key={product.id} onMouseDown={(event) => event.preventDefault()} onClick={() => selectProduct(line.id, product)}><span className="mini-product" style={{ '--product-color': product.color } as CSSProperties}>{product.short}</span><span><strong>{product.name}</strong><small>{product.sku} · {product.bagWeightKg} kg · {product.shop}</small></span><i>{product.stock} {product.unitKind === 'WEIGHED' ? 'kg' : 'packs'} in stock</i></button>)}{line.query.trim() && <button type="button" className="create-result" onMouseDown={(event) => event.preventDefault()} onClick={() => createProductInline(line)}><span>＋</span><span><strong>Create “{line.query.trim()}”</strong><small>Add its required catalog details below without leaving this bill</small></span><i>New item →</i></button>}</div>}
                      </div>}
                      {validationVisible && issues[0] && <small className="receiving-cell-error">{issues[0]}</small>}
                    </td>
                    <td><input aria-label={`Row ${index + 1} HSN code`} data-receiving-field value={line.hsn} onChange={(event) => updateLine(line.id, 'hsn', event.target.value)} placeholder="1006" inputMode="numeric" /></td>
                    <td><input aria-label={`Row ${index + 1} pack size in kilograms`} data-receiving-field type="number" min="0" step="0.01" value={line.packSize} onChange={(event) => updateLine(line.id, 'packSize', event.target.value)} placeholder="0" /></td>
                    <td><input aria-label={`Row ${index + 1} packs per case`} data-receiving-field type="number" min="1" step="1" disabled={line.receivedAs !== 'boxes'} value={line.unitsPerContainer} onChange={(event) => updateLine(line.id, 'unitsPerContainer', event.target.value)} /></td>
                    <td><input aria-label={`Row ${index + 1} quantity received`} data-receiving-field type="number" min="0" step="0.01" value={line.quantity} onChange={(event) => updateLine(line.id, 'quantity', event.target.value)} placeholder="0" /></td>
                    <td><select aria-label={`Row ${index + 1} receiving unit`} data-receiving-field value={line.receivedAs} onChange={(event) => updateLine(line.id, 'receivedAs', event.target.value as ReceivingUnit)}><option value="bags">Bags</option><option value="boxes">Boxes</option><option value="kg">Kilograms</option><option value="units">Units</option></select></td>
                    <td><div className="rupee-input"><span>₹</span><input aria-label={`Row ${index + 1} purchase rate`} data-receiving-field type="number" min="0" step="0.01" value={line.rate} onChange={(event) => updateLine(line.id, 'rate', event.target.value)} placeholder="0.00" /></div></td>
                    <td><select aria-label={`Row ${index + 1} rate basis`} data-receiving-field value={line.rateBasis} onChange={(event) => updateLine(line.id, 'rateBasis', event.target.value as ReceivingRateBasis)}><option value="container">{line.receivedAs === 'boxes' ? 'Per box' : line.receivedAs === 'bags' ? 'Per bag' : 'Per entry'}</option><option value="unit">Per unit</option><option value="kg">Per kg</option><option value="100kg">Per 100 kg</option></select></td>
                    <td><select aria-label={`Row ${index + 1} tax rate`} data-receiving-field value={line.taxRate} onChange={(event) => updateLine(line.id, 'taxRate', event.target.value)}><option value="0">Exempt</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option><option value="28">28%</option></select></td>
                    <td><div className="rupee-input compact"><span>₹</span><input aria-label={`Row ${index + 1} line discount`} data-receiving-field type="number" min="0" step="0.01" value={line.discount} onChange={(event) => updateLine(line.id, 'discount', event.target.value)} placeholder="0" /></div></td>
                    <td className="line-total"><strong>{money(amounts.total)}</strong><small>{amounts.receivedWeightKg > 0 ? `${amounts.receivedWeightKg.toLocaleString('en-IN')} kg` : `${amounts.itemCount.toLocaleString('en-IN')} units`} · {rateBasisLabel(line.rateBasis, line.receivedAs)}</small></td>
                    <td><button className="remove-receiving-row" onClick={() => removeRow(line.id)} aria-label={`Remove row ${index + 1}`}>×</button></td>
                  </tr>
                  {line.mode === 'new' && <tr className="new-product-setup"><td /><td colSpan={12}><div><span className="new-item-badge">New item</span><label><span>Product name *</span><input value={line.name} onChange={(event) => { updateLine(line.id, 'name', event.target.value); updateLine(line.id, 'query', event.target.value); }} /></label><label><span>SKU *</span><input value={line.sku} className={newSkuDuplicate(line) ? 'invalid' : ''} onChange={(event) => updateLine(line.id, 'sku', event.target.value.toUpperCase())} />{newSkuDuplicate(line) && <small>SKU already exists</small>}</label><label><span>Category</span><select value={line.category} onChange={(event) => updateLine(line.id, 'category', event.target.value)}><option>Grains</option><option>Pulses</option><option>Flour</option><option>Spices</option><option>Oils</option><option>Sweeteners</option><option>Other</option></select></label><label><span>Stock behavior</span><select value={line.unitKind} onChange={(event) => updateLine(line.id, 'unitKind', event.target.value as ReceiptLine['unitKind'])}><option value="COUNTED">Sealed packs / units</option><option value="WEIGHED">Loose by weight</option></select></label><button onClick={() => updateLine(line.id, 'mode', 'search')}>Cancel new item</button></div></td></tr>}
                </Fragment>;
              })}
            </tbody>
          </table>
        </div>
        <div className="receiving-table-footer"><div><button onClick={() => addRow()}>＋ Add row</button><button onClick={() => addRow(5)}>＋ Add 5 rows</button></div><span>{lines.length} line{lines.length === 1 ? '' : 's'} · {totals.weight.toLocaleString('en-IN')} kg represented</span></div>
      </section>

      <section className="receiving-finish-grid">
        <div className="receiving-card receiving-notes"><div className="receiving-section-heading"><div><span>3</span><div><p>Bill adjustments</p><h2>Charges &amp; notes</h2></div></div></div><div className="charges-grid"><label><span>Freight / cartage</span><div className="rupee-input"><span>₹</span><input type="number" step="0.01" value={freight} onChange={(event) => setFreight(event.target.value)} placeholder="0.00" /></div></label><label><span>Other charges / coolie</span><div className="rupee-input"><span>₹</span><input type="number" step="0.01" value={otherCharges} onChange={(event) => setOtherCharges(event.target.value)} placeholder="0.00" /></div></label><label><span>Round off (+ / -)</span><div className="rupee-input"><span>₹</span><input type="number" step="0.01" value={roundOff} onChange={(event) => setRoundOff(event.target.value)} placeholder="0.00" /></div></label></div><label className="receiving-notes-field"><span>Internal receiving notes</span><textarea placeholder="Damage, short delivery, lot details, or any discrepancy…" /></label></div>
        <aside className="receiving-card receipt-summary"><div className="summary-heading"><span>▥</span><div><p>Receipt summary</p><h2>{lines.length} bill line{lines.length === 1 ? '' : 's'}</h2></div></div><dl><div><dt>Items subtotal</dt><dd>{money(totals.subtotal)}</dd></div><div><dt>Line discounts</dt><dd>− {money(totals.discount)}</dd></div><div><dt>GST</dt><dd>{money(totals.tax)}</dd></div><div><dt>Freight &amp; other charges</dt><dd>{money(Number(freight || 0) + Number(otherCharges || 0))}</dd></div><div><dt>Round off</dt><dd>{money(Number(roundOff || 0))}</dd></div><div className="receipt-grand-total"><dt>Bill total</dt><dd>{money(grandTotal)}</dd></div></dl><div className="inventory-impact-note"><span>✓</span><p><strong>One inventory update</strong><small>All {lines.length} rows will post together at {location}. Nothing is changed while this bill is still a draft.</small></p></div>{validationVisible && issueCount > 0 && <div className="receiving-validation">! Fix {issueCount} missing or invalid field{issueCount === 1 ? '' : 's'} before receiving.</div>}<button className="receive-stock-button" onClick={receiveStock}>Receive stock <span>{money(grandTotal)} →</span></button><small className="receipt-audit-note">Creates one goods receipt reference and updates every matched inventory item in the same action.</small></aside>
      </section>
    </div>
  );
}
