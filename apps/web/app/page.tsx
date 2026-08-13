'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { allocateInventorySale, evaluateGuardrails, parseBillingCommand, parseExternalOrder, stepQuantity, type ExternalOrderLine } from './billing-engine';
import { persistCompletedBill, type CompleteBillingInput } from './billing-api';
import { SupplierReceivingPage, type InventoryProduct } from './supplier-receiving-page';

type Page = 'billing' | 'inventory' | 'receiving' | 'deliveries' | 'customers' | 'bills';
type StockStatus = 'In stock' | 'Low stock' | 'Out of stock';
type DeliveryStatus = 'Pending' | 'Out for delivery' | 'Delivered' | 'Failed';
type RestaurantStatus = 'Active' | 'On hold';
type ColorTheme = 'light' | 'dark';

type Product = InventoryProduct;

type CartLine = Product & { lineId: number; quantity: number; enteredExpression?: string; fulfillmentShop?: string; saleMode?: 'RETAIL' | 'BAG' };

type Customer = {
  id: number;
  name: string;
  phone: string;
  address: string;
  visits: number;
  totalSpent: number;
  topItem: string;
  lastVisit: string;
};

type Bill = {
  id: string;
  customer: string;
  phone: string;
  date: string;
  time: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  amount: number;
  payment: string;
  status: 'Paid' | 'Pending' | 'Refunded';
  shop: string;
  syncState?: 'SYNCED' | 'SYNC_REQUIRED';
  durationSeconds?: number;
};

type BillingRecipientDraft = {
  kind: 'walk-in' | 'new' | 'existing' | 'new-restaurant' | 'existing-restaurant';
  customerId?: number;
  restaurantId?: number;
  name: string;
  phone: string;
  address: string;
  contact: string;
  email: string;
  area: string;
  gstin: string;
  deliverySlot: string;
  creditLimit: string;
  payment?: string;
  delivery?: boolean;
};

type ParkedBillingSession = {
  id: string;
  label: string;
  createdAt: string;
  cart: CartLine[];
  recipient: BillingRecipientDraft;
  payment: string;
  delivery: boolean;
};

type RecoveryItem = {
  id: string;
  kind: 'PAYMENT' | 'PRINT' | 'SYNC' | 'APPROVAL';
  title: string;
  detail: string;
  tone: 'amber' | 'red' | 'blue';
};

type QueuedBillingSync = { billId: string; payload: CompleteBillingInput };

type Delivery = {
  id: string;
  billId: string;
  customer: string;
  phone: string;
  address: string;
  status: DeliveryStatus;
  slot: string;
  updated: string;
  driver: string;
};

type Restaurant = {
  id: number;
  name: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  area: string;
  gstin: string;
  deliverySlot: string;
  creditLimit: number;
  outstanding: number;
  totalOrders: number;
  totalSpent: number;
  lastOrder: string;
  nextDelivery: string;
  status: RestaurantStatus;
  notes: string;
};

type RestaurantBillingDetails = Pick<Restaurant, 'contact' | 'email' | 'area' | 'gstin' | 'deliverySlot' | 'creditLimit'> & { id?: number };

const initialProducts: Product[] = [
  { id: 1, name: 'Ponni Boiled Rice', short: 'PR', sku: 'RIC-PON-01', barcode: '890100000001', aliases: ['ponni rice', 'boiled rice', 'பொன்னி அரிசி', 'ponni arisi'], category: 'Grains', unit: 'kg', unitKind: 'WEIGHED', price: 72, cost: 61, stock: 84, bagStock: 3, retailStockKg: 6, bagWeightKg: 26, otherShopStock: 46, reorder: 20, color: '#e7c772', shop: 'Anna Nagar' },
  { id: 2, name: 'Toor Dal Premium', short: 'TD', sku: 'DAL-TOO-02', barcode: '890100000002', aliases: ['toor dal', 'thuvaram paruppu', 'துவரம் பருப்பு'], category: 'Pulses', unit: 'kg', unitKind: 'WEIGHED', price: 168, cost: 145, stock: 12, bagStock: 0, retailStockKg: 12, bagWeightKg: 26, otherShopStock: 35, reorder: 15, color: '#e9a94f', shop: 'Anna Nagar' },
  { id: 3, name: 'Gingelly Oil', short: 'GO', sku: 'OIL-GIN-01', barcode: '890100000003', aliases: ['sesame oil', 'nallennai', 'நல்லெண்ணெய்'], category: 'Oils', unit: '1 L', unitKind: 'COUNTED', packSizeKg: 1, price: 349, cost: 306, stock: 31, bagStock: 31, retailStockKg: 0, bagWeightKg: 1, otherShopStock: 18, reorder: 10, color: '#d08c3d', shop: 'Ayyanambakkam' },
  { id: 4, name: 'Aashirvaad Atta', short: 'AA', sku: 'FLO-AAT-05', barcode: '890100000004', aliases: ['atta', 'wheat flour', 'கோதுமை மாவு'], category: 'Flour', unit: '5 kg', unitKind: 'COUNTED', packSizeKg: 5, price: 292, cost: 258, stock: 9, bagStock: 9, retailStockKg: 0, bagWeightKg: 5, otherShopStock: 22, reorder: 12, color: '#c97a57', shop: 'Anna Nagar' },
  { id: 5, name: 'Crystal Salt', short: 'CS', sku: 'SPI-SAL-01', barcode: '890100000005', aliases: ['salt', 'uppu', 'உப்பு'], category: 'Spices', unit: '1 kg', unitKind: 'COUNTED', packSizeKg: 1, price: 28, cost: 20, stock: 120, bagStock: 120, retailStockKg: 0, bagWeightKg: 1, otherShopStock: 75, reorder: 30, color: '#91aaba', shop: 'Ayyanambakkam' },
  { id: 6, name: 'Jaggery Cubes', short: 'JC', sku: 'SUG-JAG-01', barcode: '890100000006', aliases: ['jaggery', 'vellam', 'வெல்லம்'], category: 'Sweeteners', unit: 'kg', unitKind: 'WEIGHED', price: 86, cost: 72, stock: 0, bagStock: 0, retailStockKg: 0, bagWeightKg: 26, otherShopStock: 18, reorder: 10, color: '#9e6d43', shop: 'Anna Nagar' },
  { id: 7, name: 'Idli Rice', short: 'IR', sku: 'RIC-IDL-05', barcode: '890100000007', aliases: ['idly rice', 'இட்லி அரிசி'], category: 'Grains', unit: '5 kg', unitKind: 'COUNTED', packSizeKg: 5, price: 365, cost: 318, stock: 46, bagStock: 46, retailStockKg: 0, bagWeightKg: 5, otherShopStock: 28, reorder: 12, color: '#d8c9a2', shop: 'Ayyanambakkam' },
  { id: 8, name: 'Urad Dal Whole', short: 'UD', sku: 'DAL-URA-01', barcode: '890100000008', aliases: ['urad dal', 'ulundhu', 'உளுந்து'], category: 'Pulses', unit: 'kg', unitKind: 'WEIGHED', price: 192, cost: 164, stock: 23, bagStock: 0, retailStockKg: 23, bagWeightKg: 26, otherShopStock: 14, reorder: 15, color: '#7c7069', shop: 'Anna Nagar' },
];

const initialCustomers: Customer[] = [
  { id: 1, name: 'Ananya Raman', phone: '+91 98402 17452', address: '12, 4th Avenue, Anna Nagar, Chennai', visits: 18, totalSpent: 28460, topItem: 'Ponni Boiled Rice', lastVisit: 'Today, 10:42 AM' },
  { id: 2, name: 'Karthik S', phone: '+91 99624 80311', address: 'Mogappair East, Chennai', visits: 11, totalSpent: 17820, topItem: 'Gingelly Oil', lastVisit: 'Yesterday' },
  { id: 3, name: 'Sangeetha Stores', phone: '+91 98845 77218', address: 'Vanagaram Main Road, Chennai', visits: 32, totalSpent: 84250, topItem: 'Toor Dal Premium', lastVisit: '06 Aug 2026' },
  { id: 4, name: 'Mohammed Imran', phone: '+91 97911 64209', address: 'Nolambur, Chennai', visits: 7, totalSpent: 9340, topItem: 'Idli Rice', lastVisit: '03 Aug 2026' },
  { id: 5, name: 'Priya Narayanan', phone: '+91 99401 51726', address: 'Shanthi Colony, Anna Nagar', visits: 9, totalSpent: 12490, topItem: 'Aashirvaad Atta', lastVisit: '30 Jul 2026' },
  { id: 6, name: 'Ramesh Kumar', phone: '+91 98410 28641', address: 'Ambattur, Chennai', visits: 14, totalSpent: 21680, topItem: 'Ponni Boiled Rice', lastVisit: '29 Jul 2026' },
  { id: 7, name: 'Lakshmi Vilas Stores', phone: '+91 98842 19573', address: 'Maduravoyal, Chennai', visits: 25, totalSpent: 62540, topItem: 'Toor Dal Premium', lastVisit: '28 Jul 2026' },
  { id: 8, name: 'Deepa Krishnan', phone: '+91 97890 41327', address: 'Korattur, Chennai', visits: 6, totalSpent: 7890, topItem: 'Gingelly Oil', lastVisit: '26 Jul 2026' },
  { id: 9, name: 'Balaji Provisions', phone: '+91 99627 58419', address: 'Padi, Chennai', visits: 21, totalSpent: 48730, topItem: 'Urad Dal Whole', lastVisit: '24 Jul 2026' },
  { id: 10, name: 'Naveen Raj', phone: '+91 97908 25164', address: 'Koyambedu, Chennai', visits: 5, totalSpent: 6340, topItem: 'Idli Rice', lastVisit: '22 Jul 2026' },
  { id: 11, name: 'Meenakshi Sundaram', phone: '+91 99405 73182', address: 'Arumbakkam, Chennai', visits: 13, totalSpent: 19420, topItem: 'Aashirvaad Atta', lastVisit: '20 Jul 2026' },
  { id: 12, name: 'Vasanth Supermarket', phone: '+91 98406 42915', address: 'Nerkundram, Chennai', visits: 29, totalSpent: 76480, topItem: 'Ponni Boiled Rice', lastVisit: '18 Jul 2026' },
  { id: 13, name: 'Revathi S', phone: '+91 98848 16730', address: 'Thirumangalam, Chennai', visits: 8, totalSpent: 10360, topItem: 'Crystal Salt', lastVisit: '16 Jul 2026' },
  { id: 14, name: 'Saravana Agencies', phone: '+91 97898 64021', address: 'Ayanambakkam, Chennai', visits: 17, totalSpent: 39820, topItem: 'Gingelly Oil', lastVisit: '14 Jul 2026' },
  { id: 15, name: 'Janani Prakash', phone: '+91 99621 37584', address: 'Anna Nagar West, Chennai', visits: 4, totalSpent: 5160, topItem: 'Jaggery Cubes', lastVisit: '12 Jul 2026' },
  { id: 16, name: 'Murugan Stores', phone: '+91 97910 48263', address: 'Mogappair West, Chennai', visits: 23, totalSpent: 57940, topItem: 'Toor Dal Premium', lastVisit: '10 Jul 2026' },
  { id: 17, name: 'Aarthi Venkatesh', phone: '+91 99404 92617', address: 'Choolaimedu, Chennai', visits: 10, totalSpent: 14280, topItem: 'Idli Rice', lastVisit: '08 Jul 2026' },
  { id: 18, name: 'Ganesh Traders', phone: '+91 98409 31852', address: 'Porur, Chennai', visits: 27, totalSpent: 69350, topItem: 'Ponni Boiled Rice', lastVisit: '06 Jul 2026' },
  { id: 19, name: 'Shobana M', phone: '+91 98841 75326', address: 'Villivakkam, Chennai', visits: 7, totalSpent: 8720, topItem: 'Aashirvaad Atta', lastVisit: '04 Jul 2026' },
  { id: 20, name: 'Sri Devi Mini Mart', phone: '+91 97892 60418', address: 'Valasaravakkam, Chennai', visits: 19, totalSpent: 43610, topItem: 'Urad Dal Whole', lastVisit: '02 Jul 2026' },
];

const initialBills: Bill[] = [
  { id: 'INV-2048', customer: 'Ananya Raman', phone: '+91 98402 17452', date: '07 Aug 2026', time: '10:42 AM', items: [{ name: 'Ponni Boiled Rice', quantity: 5, price: 72 }, { name: 'Toor Dal Premium', quantity: 2, price: 168 }], amount: 730, payment: 'UPI', status: 'Paid', shop: 'Anna Nagar' },
  { id: 'INV-2047', customer: 'Walk-in customer', phone: '—', date: '07 Aug 2026', time: '10:18 AM', items: [{ name: 'Gingelly Oil', quantity: 1, price: 349 }, { name: 'Crystal Salt', quantity: 2, price: 28 }], amount: 405, payment: 'Cash', status: 'Paid', shop: 'Ayyanambakkam' },
  { id: 'INV-2046', customer: 'Karthik S', phone: '+91 99624 80311', date: '07 Aug 2026', time: '9:36 AM', items: [{ name: 'Idli Rice', quantity: 2, price: 365 }], amount: 730, payment: 'Card', status: 'Paid', shop: 'Ayyanambakkam' },
  { id: 'INV-2045', customer: 'Sangeetha Stores', phone: '+91 98845 77218', date: '06 Aug 2026', time: '6:48 PM', items: [{ name: 'Toor Dal Premium', quantity: 10, price: 168 }], amount: 1680, payment: 'Credit', status: 'Pending', shop: 'Anna Nagar' },
  { id: 'INV-2044', customer: 'Mohammed Imran', phone: '+91 97911 64209', date: '06 Aug 2026', time: '4:22 PM', items: [{ name: 'Ponni Boiled Rice', quantity: 10, price: 72 }, { name: 'Urad Dal Whole', quantity: 1, price: 192 }], amount: 912, payment: 'UPI', status: 'Paid', shop: 'Anna Nagar' },
  { id: 'INV-2043', customer: 'Priya Narayanan', phone: '+91 99401 51726', date: '05 Aug 2026', time: '12:14 PM', items: [{ name: 'Aashirvaad Atta', quantity: 2, price: 292 }], amount: 584, payment: 'Cash', status: 'Refunded', shop: 'Anna Nagar' },
];

const initialDeliveries: Delivery[] = [
  { id: 'DEL-3110', billId: 'INV-2051', customer: 'Marina Grill', phone: '+91 98408 67321', address: '18, ECR Main Road, Thiruvanmiyur', status: 'Out for delivery', slot: 'Today · 2–4 PM', updated: '11:34 AM', driver: 'Selvam R' },
  { id: 'DEL-3109', billId: 'INV-2050', customer: 'Annapoorna Bhavan', phone: '+91 99620 41857', address: '42, 2nd Avenue, Anna Nagar', status: 'Pending', slot: 'Today · 4–6 PM', updated: '10:52 AM', driver: 'Unassigned' },
  { id: 'DEL-3108', billId: 'INV-2048', customer: 'Ananya Raman', phone: '+91 98402 17452', address: '12, 4th Avenue, Anna Nagar', status: 'Out for delivery', slot: 'Today · 12–2 PM', updated: '11:18 AM', driver: 'Ravi M' },
  { id: 'DEL-3107', billId: 'INV-2046', customer: 'Karthik S', phone: '+91 99624 80311', address: 'Mogappair East, Chennai', status: 'Pending', slot: 'Today · 2–4 PM', updated: '10:02 AM', driver: 'Unassigned' },
  { id: 'DEL-3106', billId: 'INV-2044', customer: 'Mohammed Imran', phone: '+91 97911 64209', address: 'Nolambur, Chennai', status: 'Delivered', slot: '06 Aug · 4–6 PM', updated: '06 Aug, 5:24 PM', driver: 'Selvam R' },
  { id: 'DEL-3105', billId: 'INV-2042', customer: 'Meena Kumar', phone: '+91 98840 12672', address: 'Ambattur Industrial Estate', status: 'Failed', slot: '06 Aug · 2–4 PM', updated: '06 Aug, 3:48 PM', driver: 'Ravi M' },
  { id: 'DEL-3104', billId: 'INV-2041', customer: 'Arjun V', phone: '+91 97908 34718', address: 'Anna Nagar West Extension', status: 'Delivered', slot: '05 Aug · 6–8 PM', updated: '05 Aug, 7:12 PM', driver: 'Selvam R' },
];

const initialRestaurants: Restaurant[] = [
  { id: 101, name: 'Annapoorna Bhavan', contact: 'R. Prakash', phone: '+91 99620 41857', email: 'orders@annapoornabhavan.in', address: '42, 2nd Avenue, Anna Nagar, Chennai', area: 'Anna Nagar', gstin: '33AABFA2718D1ZP', deliverySlot: '4–6 PM', creditLimit: 75000, outstanding: 18420, totalOrders: 48, totalSpent: 386540, lastOrder: 'Today, 9:18 AM', nextDelivery: 'Today · 4–6 PM', status: 'Active', notes: 'Call the kitchen storekeeper 20 minutes before arrival.' },
  { id: 102, name: 'Marina Grill', contact: 'Fathima Noor', phone: '+91 98408 67321', email: 'purchase@marinagrill.in', address: '18, ECR Main Road, Thiruvanmiyur, Chennai', area: 'Thiruvanmiyur', gstin: '33AAHFM6421C1Z4', deliverySlot: '2–4 PM', creditLimit: 100000, outstanding: 32680, totalOrders: 63, totalSpent: 524300, lastOrder: 'Today, 8:42 AM', nextDelivery: 'Today · 2–4 PM', status: 'Active', notes: 'Use the service entrance behind the restaurant.' },
  { id: 103, name: 'Copper Chimney Kitchen', contact: 'Naveen Kumar', phone: '+91 97911 80462', email: 'stores@copperkitchen.in', address: '7, Nelson Manickam Road, Aminjikarai, Chennai', area: 'Aminjikarai', gstin: '33AACFC9182F1ZS', deliverySlot: '10 AM–12 PM', creditLimit: 60000, outstanding: 0, totalOrders: 37, totalSpent: 292840, lastOrder: '06 Aug 2026', nextDelivery: '10 Aug · 10 AM–12 PM', status: 'Active', notes: 'GST invoice must be included with every delivery.' },
  { id: 104, name: 'Dindigul Spice House', contact: 'S. Karthikeyan', phone: '+91 98844 17620', email: 'accounts@dindigulspice.in', address: '113, Arcot Road, Vadapalani, Chennai', area: 'Vadapalani', gstin: '33AAGFD7624N1Z8', deliverySlot: '12–2 PM', creditLimit: 50000, outstanding: 12750, totalOrders: 29, totalSpent: 214690, lastOrder: '05 Aug 2026', nextDelivery: '11 Aug · 12–2 PM', status: 'Active', notes: 'Collect signed delivery challan at the receiving desk.' },
  { id: 105, name: 'Basil & Bean Cafe', contact: 'Meera Joseph', phone: '+91 99403 72518', email: 'hello@basilbean.in', address: '26, 6th Street, Nungambakkam, Chennai', area: 'Nungambakkam', gstin: '33AARFB5217J1Z6', deliverySlot: '8–10 AM', creditLimit: 35000, outstanding: 8400, totalOrders: 21, totalSpent: 148260, lastOrder: '03 Aug 2026', nextDelivery: '09 Aug · 8–10 AM', status: 'Active', notes: 'Deliver before the cafe opens at 10 AM.' },
  { id: 106, name: 'Madras Tiffin Room', contact: 'V. Gopal', phone: '+91 97890 64273', email: 'procurement@madrasroom.in', address: '9, MTH Road, Ambattur, Chennai', area: 'Ambattur', gstin: '33AAQFM1834P1ZT', deliverySlot: '6–8 AM', creditLimit: 45000, outstanding: 45000, totalOrders: 34, totalSpent: 268100, lastOrder: '28 Jul 2026', nextDelivery: 'On hold', status: 'On hold', notes: 'Account paused until the outstanding balance is cleared.' },
];

const navItems: Array<{ id: Page; label: string; icon: string }> = [
  { id: 'billing', label: 'Billing', icon: '▤' },
  { id: 'inventory', label: 'Inventory', icon: '□' },
  { id: 'receiving', label: 'Stock receiving', icon: '⇣' },
  { id: 'deliveries', label: 'Deliveries', icon: '⌁' },
  { id: 'customers', label: 'Customers', icon: '◎' },
  { id: 'bills', label: 'All bills', icon: '≡' },
];

const money = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);

function stockStatus(product: Product): StockStatus {
  if (product.stock === 0) return 'Out of stock';
  if (product.stock <= product.reorder) return 'Low stock';
  return 'In stock';
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

export default function Home() {
  const [page, setPage] = useState<Page>('billing');
  const [products, setProducts] = useState(initialProducts);
  const [customers, setCustomers] = useState(initialCustomers);
  const [restaurants, setRestaurants] = useState(initialRestaurants);
  const [bills, setBills] = useState(initialBills);
  const [deliveries, setDeliveries] = useState(initialDeliveries);
  const [cart, setCart] = useState<CartLine[]>([]);
  const nextCartLineId = useRef(1);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [customerDetail, setCustomerDetail] = useState<Customer | null>(null);
  const [billingSession, setBillingSession] = useState(0);
  const [resumeDraft, setResumeDraft] = useState<BillingRecipientDraft | null>(null);
  const [parkedSessions, setParkedSessions] = useState<ParkedBillingSession[]>([]);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingPaymentIds, setPendingPaymentIds] = useState<string[]>([]);
  const [failedPrintIds, setFailedPrintIds] = useState<string[]>(['INV-2046']);
  const [syncQueue, setSyncQueue] = useState<QueuedBillingSync[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<ColorTheme>('light');
  const [toast, setToast] = useState('');
  const completionLock = useRef(false);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem('svt-color-theme');
    const initialTheme: ColorTheme = storedTheme === 'light' || storedTheme === 'dark'
      ? storedTheme
      : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    setTheme(initialTheme);
    document.documentElement.dataset.theme = initialTheme;
    setIsOnline(window.navigator.onLine);
    const stored = window.localStorage.getItem('svt-parked-billing-sessions');
    if (stored) {
      try { setParkedSessions(JSON.parse(stored) as ParkedBillingSession[]); } catch { window.localStorage.removeItem('svt-parked-billing-sessions'); }
    }
    const storedSyncQueue = window.localStorage.getItem('svt-billing-sync-queue');
    if (storedSyncQueue) {
      try { setSyncQueue(JSON.parse(storedSyncQueue) as QueuedBillingSync[]); } catch { window.localStorage.removeItem('svt-billing-sync-queue'); }
    }
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const persistParkedSessions = (sessions: ParkedBillingSession[]) => {
    setParkedSessions(sessions);
    window.localStorage.setItem('svt-parked-billing-sessions', JSON.stringify(sessions));
  };

  const persistSyncQueue = (entries: QueuedBillingSync[]) => {
    setSyncQueue(entries);
    window.localStorage.setItem('svt-billing-sync-queue', JSON.stringify(entries));
  };

  const queueBillForSync = (entry: QueuedBillingSync) => {
    const next = [entry, ...syncQueue.filter((candidate) => candidate.billId !== entry.billId)];
    persistSyncQueue(next);
    setBills((current) => current.map((bill) => bill.id === entry.billId ? { ...bill, syncState: 'SYNC_REQUIRED' } : bill));
  };

  const navigate = (next: Page) => {
    setPage(next);
    setCustomerDetail(null);
    setMenuOpen(false);
  };

  const addToCart = (product: Product, initialQuantity: number, metadata?: Pick<CartLine, 'enteredExpression' | 'fulfillmentShop' | 'saleMode'>) => {
    const sellableStock = metadata?.fulfillmentShop && metadata.fulfillmentShop !== product.shop ? product.otherShopStock ?? 0 : product.stock;
    if (sellableStock === 0 || initialQuantity <= 0) return null;
    const lineId = nextCartLineId.current++;
    setCart((current) => [...current, { ...product, stock: sellableStock, lineId, quantity: initialQuantity, ...metadata }]);
    return lineId;
  };

  const setCartQuantity = (lineId: number, quantity: number) => {
    setCart((current) => {
      const selectedLine = current.find((item) => item.lineId === lineId);
      if (!selectedLine) return current;
      const allocatedToOtherLines = current.reduce((sum, item) =>
        item.id === selectedLine.id && item.lineId !== lineId ? sum + item.quantity : sum, 0);
      const availableForLine = Math.max(0, selectedLine.stock - allocatedToOtherLines);
      return current.map((item) =>
        item.lineId === lineId ? { ...item, quantity: Math.max(0, Math.min(quantity, availableForLine)) } : item,
      );
    });
  };

  const setCartPrice = (lineId: number, productId: number, price: number) => {
    const nextPrice = Number(price.toFixed(2));
    if (!Number.isFinite(nextPrice) || nextPrice <= 0) return;
    setCart((current) => current.map((item) => item.lineId === lineId ? { ...item, price: nextPrice } : item));
  };

  const removeFromCart = (lineId: number) => setCart((current) => current.filter((item) => item.lineId !== lineId));

  const completeBill = (details: { name: string; phone: string; address: string; payment: string; delivery: boolean; restaurant?: RestaurantBillingDetails; durationSeconds?: number; paymentPending?: boolean }) => {
    if (!cart.length || completionLock.current) return;
    completionLock.current = true;
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const total = Number((subtotal * 1.05).toFixed(2));
    const nextNumber = 2049 + (bills.length - initialBills.length);
    const now = new Date();
    const name = details.name.trim() || selectedRestaurant?.name || selectedCustomer?.name || 'Walk-in customer';
    const phone = details.phone.trim() || selectedRestaurant?.phone || selectedCustomer?.phone || '—';
    const address = details.address.trim() || selectedRestaurant?.address || selectedCustomer?.address || '';
    const bill: Bill = {
      id: `INV-${nextNumber}`,
      customer: name,
      phone,
      date: now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: now.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }),
      items: cart.map(({ name: itemName, quantity, price }) => ({ name: itemName, quantity, price })),
      amount: total,
      payment: details.payment,
      status: details.payment === 'Credit' || details.paymentPending ? 'Pending' : 'Paid',
      shop: 'Anna Nagar',
      syncState: isOnline ? 'SYNCED' : 'SYNC_REQUIRED',
      durationSeconds: details.durationSeconds,
    };

    setBills((current) => [bill, ...current]);
    const syncPayload: CompleteBillingInput = {
      idempotencyKey: `pos-${bill.id}-${now.getTime()}`,
      recipient: { name, phone, address, restaurantId: details.restaurant?.id },
      lines: cart.map((line) => ({ sku: line.sku, name: line.name, unitKind: line.unitKind, quantity: line.quantity, price: line.price, enteredExpression: line.enteredExpression, fulfillmentShop: line.fulfillmentShop })),
      payment: details.payment,
      paymentPending: Boolean(details.paymentPending),
      offline: !isOnline,
      durationSeconds: details.durationSeconds,
    };
    if (isOnline) {
      void persistCompletedBill(syncPayload).then((invoice) => {
        setToast(`${bill.id} saved · server invoice ${invoice.invoiceNumber}`);
        window.setTimeout(() => setToast(''), 3500);
      }).catch(() => {
        queueBillForSync({ billId: bill.id, payload: syncPayload });
        setToast(`${bill.id} is safe locally · API sync queued`);
        window.setTimeout(() => setToast(''), 3500);
      });
    } else queueBillForSync({ billId: bill.id, payload: syncPayload });
    setProducts((current) => current.map((product) => {
      const localLines = cart.filter((item) => item.id === product.id && (!item.fulfillmentShop || item.fulfillmentShop === product.shop));
      return localLines.reduce<Product>((nextProduct, line) => {
        const allocation = allocateInventorySale(nextProduct, line.quantity, line.saleMode ?? 'RETAIL');
        return { ...nextProduct, bagStock: allocation.bagStock, retailStockKg: allocation.retailStockKg, stock: allocation.stock };
      }, product);
    }));

    if (details.restaurant) {
      const existingRestaurant = restaurants.find((restaurant) => restaurant.id === details.restaurant?.id);
      if (existingRestaurant) {
        setRestaurants((current) => current.map((restaurant) => restaurant.id === existingRestaurant.id ? {
          ...restaurant,
          ...details.restaurant,
          name,
          phone,
          address,
          totalOrders: restaurant.totalOrders + 1,
          totalSpent: restaurant.totalSpent + total,
          outstanding: details.payment === 'Credit' ? restaurant.outstanding + total : restaurant.outstanding,
          lastOrder: 'Just now',
          nextDelivery: details.delivery ? `Today · ${details.restaurant?.deliverySlot}` : restaurant.nextDelivery,
        } : restaurant));
      } else {
        setRestaurants((current) => [{
          id: Date.now(),
          name,
          phone,
          address,
          ...details.restaurant!,
          outstanding: details.payment === 'Credit' ? total : 0,
          totalOrders: 1,
          totalSpent: total,
          lastOrder: 'Just now',
          nextDelivery: details.delivery ? `Today · ${details.restaurant!.deliverySlot}` : 'Not scheduled',
          status: 'Active',
          notes: 'New restaurant account — add delivery notes when available.',
        }, ...current]);
      }
    } else if (name !== 'Walk-in customer' && phone !== '—') {
      const existing = customers.find((customer) => customer.phone === phone);
      if (existing) {
        setCustomers((current) =>
          current.map((customer) =>
            customer.id === existing.id
              ? { ...customer, visits: customer.visits + 1, totalSpent: customer.totalSpent + total, lastVisit: 'Just now' }
              : customer,
          ),
        );
      } else {
        setCustomers((current) => [
          {
            id: Date.now(),
            name,
            phone,
            address,
            visits: 1,
            totalSpent: total,
            topItem: [...cart].sort((a, b) => b.quantity - a.quantity)[0].name,
            lastVisit: 'Just now',
          },
          ...current,
        ]);
      }
    }

    if (details.delivery && address) {
      setDeliveries((current) => [
        {
          id: `DEL-${3109 + (deliveries.length - initialDeliveries.length)}`,
          billId: bill.id,
          customer: name,
          phone,
          address,
          status: 'Pending',
          slot: 'Today · 4–6 PM',
          updated: 'Just now',
          driver: 'Unassigned',
        },
        ...current,
      ]);
    }

    setCart([]);
    setSelectedCustomer(null);
    setSelectedRestaurant(null);
    setResumeDraft(null);
    setSelectedBill(bill);
    if (details.paymentPending) setPendingPaymentIds((current) => [...current, bill.id]);
    setToast(`${bill.id} created${isOnline ? '' : ' offline — queued to sync'}`);
    window.setTimeout(() => setToast(''), 3500);
    window.setTimeout(() => { completionLock.current = false; }, 500);
  };

  const parkCurrentSession = (session: Omit<ParkedBillingSession, 'id' | 'createdAt'>) => {
    if (!session.cart.length) return;
    const parked: ParkedBillingSession = { ...session, id: `PARK-${Date.now()}`, createdAt: new Date().toISOString() };
    persistParkedSessions([parked, ...parkedSessions]);
    setCart([]);
    setSelectedCustomer(null);
    setSelectedRestaurant(null);
    setResumeDraft(null);
    setBillingSession((current) => current + 1);
    setToast(`${parked.label} parked safely`);
    window.setTimeout(() => setToast(''), 3000);
  };

  const resumeParkedSession = (session: ParkedBillingSession) => {
    setCart(session.cart.map((line) => ({ ...line, lineId: nextCartLineId.current++ })));
    setSelectedCustomer(session.recipient.customerId ? customers.find((customer) => customer.id === session.recipient.customerId) ?? null : null);
    setSelectedRestaurant(session.recipient.restaurantId ? restaurants.find((restaurant) => restaurant.id === session.recipient.restaurantId) ?? null : null);
    setResumeDraft({ ...session.recipient, payment: session.payment, delivery: session.delivery });
    persistParkedSessions(parkedSessions.filter((candidate) => candidate.id !== session.id));
    setBillingSession((current) => current + 1);
    navigate('billing');
    setToast(`${session.label} resumed`);
    window.setTimeout(() => setToast(''), 3000);
  };

  const copyBillToCart = (bill: Bill, keepCurrentRecipient = false) => {
    const nextLines = bill.items.flatMap((item) => {
      const product = products.find((candidate) => candidate.name === item.name);
      return product ? [{ ...product, lineId: nextCartLineId.current++, quantity: Math.min(item.quantity, product.stock), enteredExpression: `Copied from ${bill.id}` }] : [];
    });
    setCart(nextLines);
    if (!keepCurrentRecipient) {
      const restaurant = restaurants.find((candidate) => candidate.phone === bill.phone || candidate.name === bill.customer);
      const customer = customers.find((candidate) => candidate.phone === bill.phone);
      setSelectedRestaurant(restaurant ?? null);
      setSelectedCustomer(restaurant ? null : customer ?? null);
      setResumeDraft(null);
    }
    setBillingSession((current) => current + 1);
    navigate('billing');
    setToast(`${bill.id} copied into a new bill`);
    window.setTimeout(() => setToast(''), 3000);
  };

  const recoveryItems: RecoveryItem[] = [
    ...pendingPaymentIds.map((id) => ({ id: `payment-${id}`, kind: 'PAYMENT' as const, title: `${id} awaiting UPI`, detail: 'Payment can reconcile without blocking the cashier.', tone: 'amber' as const })),
    ...failedPrintIds.map((id) => ({ id: `print-${id}`, kind: 'PRINT' as const, title: `${id} did not print`, detail: 'The sale is safe; retry the receipt only.', tone: 'red' as const })),
    ...syncQueue.map((entry) => ({ id: `sync-${entry.billId}`, kind: 'SYNC' as const, title: `${entry.billId} waiting to sync`, detail: 'Full transaction stored locally with its idempotency key.', tone: 'blue' as const })),
  ];

  const resolveRecoveryItem = (item: RecoveryItem) => {
    if (item.kind === 'PAYMENT') setPendingPaymentIds((current) => current.filter((id) => `payment-${id}` !== item.id));
    if (item.kind === 'PRINT') setFailedPrintIds((current) => current.filter((id) => `print-${id}` !== item.id));
    if (item.kind === 'SYNC') {
      const entry = syncQueue.find((candidate) => `sync-${candidate.billId}` === item.id);
      if (!entry || !isOnline) {
        setToast('Reconnect before replaying the offline transaction.');
        window.setTimeout(() => setToast(''), 3000);
        return;
      }
      void persistCompletedBill({ ...entry.payload, offline: true }).then(() => {
        persistSyncQueue(syncQueue.filter((candidate) => candidate.billId !== entry.billId));
        setBills((current) => current.map((bill) => bill.id === entry.billId ? { ...bill, syncState: 'SYNCED' } : bill));
        setToast(`${entry.billId} synchronized exactly once`);
        window.setTimeout(() => setToast(''), 3000);
      }).catch(() => {
        setToast(`${entry.billId} is still safe locally; sync will retry later`);
        window.setTimeout(() => setToast(''), 3500);
      });
    }
  };

  const selectTheme = (nextTheme: ColorTheme) => {
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem('svt-color-theme', nextTheme);
    setSettingsOpen(false);
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <span className="brand-mark">SVT</span>
          <div><strong>Sri Vijay Traders</strong><small>Billing &amp; operations</small></div>
        </div>

        <p className="nav-label">Workspace</p>
        <nav aria-label="Primary navigation">
          {navItems.map((item) => (
            <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => navigate(item.id)}>
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              {item.label}
              {item.id === 'deliveries' && <span className="nav-count">2</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <button className="help-card" onClick={() => setToast('Help centre is ready for your next workflow.') }>
            <span className="help-icon">?</span>
            <span><strong>Need help?</strong><small>View setup guide</small></span>
            <b>›</b>
          </button>
          <div className="user-card">
            <span className="avatar">AM</span>
            <span className="user-identity"><strong>Arun Manager</strong><small>Administrator</small></span>
            <button
              className="settings-button"
              type="button"
              aria-label="Appearance settings"
              aria-haspopup="menu"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((current) => !current)}
            >
              <span aria-hidden="true">⚙</span>
            </button>
            {settingsOpen && (
              <div className="theme-menu" role="menu" aria-label="Appearance">
                <div className="theme-menu-heading"><strong>Appearance</strong><small>Choose your display mode</small></div>
                <button className={theme === 'light' ? 'selected' : ''} role="menuitemradio" aria-checked={theme === 'light'} onClick={() => selectTheme('light')}>
                  <span className="theme-preview light" aria-hidden="true">☀</span>
                  <span><strong>Light</strong><small>Bright workspace</small></span>
                  <b aria-hidden="true">{theme === 'light' ? '✓' : ''}</b>
                </button>
                <button className={theme === 'dark' ? 'selected' : ''} role="menuitemradio" aria-checked={theme === 'dark'} onClick={() => selectTheme('dark')}>
                  <span className="theme-preview dark" aria-hidden="true">☾</span>
                  <span><strong>Dark</strong><small>Comfortable in low light</small></span>
                  <b aria-hidden="true">{theme === 'dark' ? '✓' : ''}</b>
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {menuOpen && <button className="backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}

      <main className="workspace">
        <header className="topbar">
          <button className="menu-button" aria-label="Open navigation" onClick={() => setMenuOpen(true)}>☰</button>
          <div className="location-picker"><span className="location-dot" /> Anna Nagar <span>⌄</span></div>
          <div className="topbar-actions">
            <button className={`sync-state ${isOnline ? '' : 'offline'}`} onClick={() => setIsOnline((current) => !current)} title="Toggle offline simulation"><i /> {isOnline ? 'Online · all changes saved' : 'Offline · sales queue locally'}</button>
            <button className="recovery-button" onClick={() => setRecoveryOpen(true)}><span>↻</span> Recovery {recoveryItems.length + parkedSessions.length > 0 && <b>{recoveryItems.length + parkedSessions.length}</b>}</button>
            <button className="icon-button" aria-label="Notifications">♧<span className="notification-dot" /></button>
          </div>
        </header>

        <div hidden={page !== 'billing'}>
          <BillingPage
            key={`billing-${bills.length}-${billingSession}`}
            active={page === 'billing'}
            products={products}
            cart={cart}
            bills={bills}
            customers={customers}
            restaurants={restaurants}
            initialDraft={resumeDraft}
            parkedSessions={parkedSessions}
            isOnline={isOnline}
            selectedCustomer={selectedCustomer}
            selectedRestaurant={selectedRestaurant}
            setSelectedCustomer={setSelectedCustomer}
            setSelectedRestaurant={setSelectedRestaurant}
            updateCustomer={(id, details) => {
              setCustomers((current) => current.map((customer) => customer.id === id ? { ...customer, ...details } : customer));
              setSelectedCustomer((current) => current?.id === id ? { ...current, ...details } : current);
            }}
            updateRestaurant={(id, details) => {
              setRestaurants((current) => current.map((restaurant) => restaurant.id === id ? { ...restaurant, ...details } : restaurant));
              setSelectedRestaurant((current) => current?.id === id ? { ...current, ...details } : current);
            }}
            addToCart={addToCart}
            setCartQuantity={setCartQuantity}
            setCartPrice={setCartPrice}
            removeFromCart={removeFromCart}
            clearCart={() => setCart([])}
            completeBill={completeBill}
            onPark={parkCurrentSession}
            onResume={resumeParkedSession}
            onCopyBill={copyBillToCart}
          />
        </div>
        {page === 'inventory' && <InventoryPage products={products} setProducts={setProducts} />}
        {page === 'receiving' && <SupplierReceivingPage products={products} setProducts={setProducts} />}
        {page === 'deliveries' && <DeliveriesPage deliveries={deliveries} setDeliveries={setDeliveries} restaurants={restaurants} setRestaurants={setRestaurants} onNewBill={(restaurant) => { setSelectedCustomer(null); setSelectedRestaurant(restaurant); setBillingSession((current) => current + 1); navigate('billing'); }} />}
        {page === 'customers' && (
          <CustomersPage
            customers={customers}
            bills={bills}
            detail={customerDetail}
            setDetail={setCustomerDetail}
            onNewBill={(customer) => { setSelectedRestaurant(null); setSelectedCustomer(customer); setBillingSession((current) => current + 1); navigate('billing'); }}
          />
        )}
        {page === 'bills' && <BillsPage bills={bills} setSelectedBill={setSelectedBill} />}
      </main>

      {selectedBill && <BillDrawer bill={selectedBill} onClose={() => setSelectedBill(null)} onDuplicate={() => { setSelectedBill(null); copyBillToCart(selectedBill); }} onPrint={() => { setFailedPrintIds((current) => current.filter((id) => id !== selectedBill.id)); setToast(`${selectedBill.id} sent to the receipt printer`); window.setTimeout(() => setToast(''), 3000); }} />}
      {recoveryOpen && <RecoveryCenter
        items={recoveryItems}
        parked={parkedSessions}
        onClose={() => setRecoveryOpen(false)}
        onResume={(session) => { setRecoveryOpen(false); resumeParkedSession(session); }}
        onResolve={resolveRecoveryItem}
      />}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </div>
  );
}

function PageTitle({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) {
  return (
    <div className="page-title">
      <div><p>{eyebrow}</p><h1>{title}</h1><span>{description}</span></div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

function BillingPage({
  active,
  products,
  cart,
  bills,
  customers,
  restaurants,
  initialDraft,
  parkedSessions,
  isOnline,
  selectedCustomer,
  selectedRestaurant,
  setSelectedCustomer,
  setSelectedRestaurant,
  updateCustomer,
  updateRestaurant,
  addToCart,
  setCartQuantity,
  setCartPrice,
  removeFromCart,
  clearCart,
  completeBill,
  onPark,
  onResume,
  onCopyBill,
}: {
  active: boolean;
  products: Product[];
  cart: CartLine[];
  bills: Bill[];
  customers: Customer[];
  restaurants: Restaurant[];
  initialDraft: BillingRecipientDraft | null;
  parkedSessions: ParkedBillingSession[];
  isOnline: boolean;
  selectedCustomer: Customer | null;
  selectedRestaurant: Restaurant | null;
  setSelectedCustomer: (customer: Customer | null) => void;
  setSelectedRestaurant: (restaurant: Restaurant | null) => void;
  updateCustomer: (id: number, details: Pick<Customer, 'name' | 'phone' | 'address'>) => void;
  updateRestaurant: (id: number, details: Pick<Restaurant, 'name' | 'contact' | 'phone' | 'email' | 'address' | 'area' | 'gstin' | 'deliverySlot' | 'creditLimit'>) => void;
    addToCart: (product: Product, initialQuantity: number, metadata?: Pick<CartLine, 'enteredExpression' | 'fulfillmentShop' | 'saleMode'>) => number | null;
  setCartQuantity: (lineId: number, quantity: number) => void;
  setCartPrice: (lineId: number, productId: number, price: number) => void;
  removeFromCart: (lineId: number) => void;
  clearCart: () => void;
  completeBill: (details: { name: string; phone: string; address: string; payment: string; delivery: boolean; restaurant?: RestaurantBillingDetails; durationSeconds?: number; paymentPending?: boolean }) => void;
  onPark: (session: Omit<ParkedBillingSession, 'id' | 'createdAt'>) => void;
  onResume: (session: ParkedBillingSession) => void;
  onCopyBill: (bill: Bill, keepCurrentRecipient?: boolean) => void;
}) {
  const [itemQuery, setItemQuery] = useState('');
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [pendingProductFocus, setPendingProductFocus] = useState<number | null>(null);
  const [productSelectionMessage, setProductSelectionMessage] = useState('');
  const [quantityDrafts, setQuantityDrafts] = useState<Record<number, string>>({});
  const [priceDrafts, setPriceDrafts] = useState<Record<number, string>>({});
  const [payment, setPayment] = useState(initialDraft?.payment ?? 'UPI');
  const [delivery, setDelivery] = useState(initialDraft?.delivery ?? false);
  const [customerStep, setCustomerStep] = useState<'choose' | 'new' | 'existing' | 'review' | 'restaurant-new' | 'restaurant-existing' | 'restaurant-review' | 'ready'>('ready');
  const [customerKind, setCustomerKind] = useState<'new' | 'existing' | 'new-restaurant' | 'existing-restaurant' | null>(initialDraft?.kind === 'walk-in' ? null : initialDraft?.kind ?? (selectedRestaurant ? 'existing-restaurant' : selectedCustomer ? 'existing' : null));
  const [customerQuery, setCustomerQuery] = useState(initialDraft?.name ?? selectedRestaurant?.name ?? selectedCustomer?.name ?? '');
  const [restaurantQuery, setRestaurantQuery] = useState(selectedRestaurant?.name ?? '');
  const [visibleCustomerCount, setVisibleCustomerCount] = useState(10);
  const [originalCustomer, setOriginalCustomer] = useState<Customer | null>(selectedCustomer);
  const [originalRestaurant, setOriginalRestaurant] = useState<Restaurant | null>(selectedRestaurant);
  const [name, setName] = useState(initialDraft?.name ?? selectedRestaurant?.name ?? selectedCustomer?.name ?? '');
  const [phone, setPhone] = useState(initialDraft?.phone ?? selectedRestaurant?.phone ?? selectedCustomer?.phone ?? '');
  const [address, setAddress] = useState(initialDraft?.address ?? selectedRestaurant?.address ?? selectedCustomer?.address ?? '');
  const [contact, setContact] = useState(initialDraft?.contact ?? selectedRestaurant?.contact ?? '');
  const [email, setEmail] = useState(initialDraft?.email ?? selectedRestaurant?.email ?? '');
  const [area, setArea] = useState(initialDraft?.area ?? selectedRestaurant?.area ?? '');
  const [gstin, setGstin] = useState(initialDraft?.gstin ?? selectedRestaurant?.gstin ?? '');
  const [deliverySlot, setDeliverySlot] = useState(initialDraft?.deliverySlot ?? selectedRestaurant?.deliverySlot ?? '4–6 PM');
  const [creditLimit, setCreditLimit] = useState(initialDraft?.creditLimit ?? String(selectedRestaurant?.creditLimit ?? 50000));
  const [upiState, setUpiState] = useState<'IDLE' | 'WAITING' | 'CONFIRMED'>('IDLE');
  const [cashTendered, setCashTendered] = useState('');
  const [splitPayment, setSplitPayment] = useState(false);
  const [splitAmount, setSplitAmount] = useState('');
  const [managerOverride, setManagerOverride] = useState(false);
  const [stockRescue, setStockRescue] = useState<{ product: Product; quantity: number; expression?: string; saleMode?: 'RETAIL' | 'BAG' } | null>(null);
  const [externalOrderOpen, setExternalOrderOpen] = useState(false);
  const [externalOrderText, setExternalOrderText] = useState('10kg ponni rice\n₹500 toor dal\n3 x 5kg atta');
  const [externalLines, setExternalLines] = useState<ExternalOrderLine[]>([]);
  const billStartedAt = useRef(Date.now());
  const skuInputRef = useRef<HTMLInputElement>(null);
  const normalizedItemQuery = itemQuery
    .replace(/(?:₹|rs\.?|inr)\s*\d+(?:\.\d+)?/ig, ' ')
    .replace(/\d+(?:\.\d+)?\s*(?:kg|g|grams?)\b/ig, ' ')
    .replace(/\d+(?:\.\d+)?\s*bags?\b/ig, ' ')
    .replace(/\d+(?:\.\d+)?\s*[x×]\s*/ig, ' ')
    .trim()
    .toLowerCase();
  const remainingStockForProduct = (product: Product) => Math.max(0, product.stock - cart.reduce(
    (sum, item) => item.id === product.id ? sum + item.quantity : sum,
    0,
  ));
  const productSuggestions = products
    .filter((product) => `${product.sku} ${product.barcode ?? ''} ${product.name} ${(product.aliases ?? []).join(' ')}`.toLowerCase().includes(normalizedItemQuery))
    .sort((a, b) => Number(remainingStockForProduct(a) === 0) - Number(remainingStockForProduct(b) === 0))
    .slice(0, 6);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = Number((subtotal * 0.05).toFixed(2));
  const totalWeight = cart.reduce((sum, item) => sum + (item.unitKind === 'COUNTED' ? item.quantity * (item.packSizeKg ?? 0) : item.quantity), 0);
  const customerReady = customerStep === 'ready';
  const customerDetailsValid = Boolean(name.trim() && phone.trim());
  const isRestaurant = customerKind === 'new-restaurant' || customerKind === 'existing-restaurant';
  const restaurantDetailsValid = Boolean(name.trim() && contact.trim() && phone.trim() && address.trim());
  const partyDetailsValid = customerKind === null ? payment !== 'Credit' : isRestaurant ? restaurantDetailsValid : customerDetailsValid;
  const filteredCustomers = customers.filter((customer) =>
    !customerQuery.trim() || `${customer.name} ${customer.phone} ${customer.address}`.toLowerCase().includes(customerQuery.trim().toLowerCase()),
  );
  const suggestedCustomers = filteredCustomers.slice(0, visibleCustomerCount);
  const hasMoreCustomers = suggestedCustomers.length < filteredCustomers.length;
  const hasInvalidPrice = cart.some((item) => {
    const draft = priceDrafts[item.lineId];
    if (draft === undefined) return false;
    const price = Number(draft);
    return draft.trim() === '' || !Number.isFinite(price) || price <= 0;
  });
  const filteredRestaurants = restaurants.filter((restaurant) =>
    !restaurantQuery.trim() || `${restaurant.name} ${restaurant.contact} ${restaurant.phone} ${restaurant.area}`.toLowerCase().includes(restaurantQuery.trim().toLowerCase()),
  );
  const guardrailIssues = evaluateGuardrails(cart, selectedRestaurant ? { outstanding: selectedRestaurant.outstanding, creditLimit: selectedRestaurant.creditLimit, status: selectedRestaurant.status } : null, payment);
  const guardrailKey = guardrailIssues.map((issue) => `${issue.code}:${issue.lineIds?.join(',') ?? ''}`).join('|');
  const blockingGuardrails = guardrailIssues.filter((issue) => issue.severity === 'block');
  const total = subtotal + tax;
  const cashChange = Math.max(0, Number(cashTendered || 0) - total);
  const restaurantUsualBill = selectedRestaurant ? bills.find((bill) => bill.phone === selectedRestaurant.phone || bill.customer === selectedRestaurant.name) : undefined;
  const preferredItem = selectedRestaurant?.name === 'Annapoorna Bhavan' ? 'Ponni Boiled Rice' : selectedCustomer?.topItem;
  const quickProducts = [...products]
    .filter((product) => product.stock > 0)
    .sort((a, b) => Number(b.name === preferredItem) - Number(a.name === preferredItem) || b.stock - a.stock)
    .slice(0, 5);

  useEffect(() => {
    if (active && cart.length > 0 && partyDetailsValid) setCustomerStep('ready');
  }, [active, cart.length, partyDetailsValid]);

  useEffect(() => {
    if (!active || customerStep !== 'ready') return;
    const focusFrame = window.requestAnimationFrame(() => skuInputRef.current?.focus());
    return () => window.cancelAnimationFrame(focusFrame);
  }, [active, customerStep]);

  useEffect(() => {
    if (pendingProductFocus === null) return;
    const focusFrame = window.requestAnimationFrame(() => {
      const quantityInput = document.getElementById(`quantity-${pendingProductFocus}`) as HTMLInputElement | null;
      if (!quantityInput) return;
      quantityInput.focus();
      quantityInput.select();
      setPendingProductFocus(null);
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [cart, pendingProductFocus]);

  useEffect(() => setManagerOverride(false), [guardrailKey]);

  const selectProduct = (product: Product, quantity = 1, expression?: string, skipLineEdit = false, saleMode: 'RETAIL' | 'BAG' = 'RETAIL') => {
    const remainingStock = remainingStockForProduct(product);
    if (remainingStock < quantity) {
      if ((product.otherShopStock ?? 0) >= quantity) {
        setStockRescue({ product, quantity, expression, saleMode });
        setProductSelectionMessage(`${product.name} is short locally; ${product.otherShopStock} ${product.unit} is available at the other shop.`);
      } else {
        setProductSelectionMessage(`Only ${remainingStock} ${product.unit} of ${product.name} remains locally.`);
      }
      return;
    }
    const lineId = addToCart(product, Math.min(quantity, remainingStock), { enteredExpression: expression, saleMode });
    if (lineId === null) return;
    setItemQuery('');
    setSuggestionsOpen(false);
    setActiveSuggestion(0);
    if (!skipLineEdit) setPendingProductFocus(lineId);
    else window.requestAnimationFrame(() => skuInputRef.current?.focus());
    const quantityLabel = saleMode === 'BAG' && product.unitKind === 'WEIGHED' ? `${Math.round(quantity / product.bagWeightKg)} bag(s)` : `${quantity} ${product.unitKind === 'COUNTED' ? 'pack(s)' : 'kg'}`;
    setProductSelectionMessage(`${product.name} · ${quantityLabel} added${expression ? ` from “${expression}”` : ''}.`);
  };

  const submitSmartCommand = () => {
    const parsed = parseBillingCommand(itemQuery, products);
    if (parsed.error || parsed.productId === null) {
      setProductSelectionMessage(parsed.error ?? 'Could not understand that command.');
      return false;
    }
    const product = products.find((candidate) => candidate.id === parsed.productId);
    if (!product) return false;
    const bagCount = parsed.quantity / product.bagWeightKg;
    const saleMode = parsed.mode === 'PACK' && product.unitKind === 'WEIGHED' && Math.abs(bagCount - Math.round(bagCount)) < 0.001 ? 'BAG' : 'RETAIL';
    selectProduct(product, parsed.quantity, parsed.enteredExpression, parsed.mode !== 'DEFAULT', saleMode);
    return true;
  };

  const handleSkuKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSuggestionsOpen(true);
      setActiveSuggestion((current) => Math.min(current + 1, Math.max(productSuggestions.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSuggestion((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Escape') {
      setSuggestionsOpen(false);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hasQuantitySyntax = /(?:₹|rs\.?|inr|\d\s*(?:kg|g|bags?|x|×))/i.test(itemQuery);
      if (!hasQuantitySyntax && productSuggestions.length) selectProduct(productSuggestions[activeSuggestion] ?? productSuggestions[0]);
      else submitSmartCommand();
    }
  };

  const updateWeight = (item: CartLine, value: string) => {
    setQuantityDrafts((current) => ({ ...current, [item.lineId]: value }));
    if (value === '') return;
    const nextQuantity = Number(value);
    if (Number.isFinite(nextQuantity) && nextQuantity >= 0) setCartQuantity(item.lineId, nextQuantity);
  };

  const commitWeight = (item: CartLine, moveToNextRow = false) => {
    const draft = quantityDrafts[item.lineId];
    const parsed = draft === undefined ? item.quantity : Number(draft);
    const allocatedToOtherLines = cart.reduce((sum, line) =>
      line.id === item.id && line.lineId !== item.lineId ? sum + line.quantity : sum, 0);
    const availableForLine = Math.max(0, item.stock - allocatedToOtherLines);
    const nextQuantity = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, availableForLine) : item.quantity || Math.min(0.25, availableForLine);
    setCartQuantity(item.lineId, nextQuantity);
    setQuantityDrafts((current) => ({ ...current, [item.lineId]: String(nextQuantity) }));
    if (moveToNextRow) {
      const priceInput = document.getElementById(`price-${item.lineId}`) as HTMLInputElement | null;
      priceInput?.focus();
      priceInput?.select();
    }
  };

  const updatePrice = (item: CartLine, value: string) => {
    setPriceDrafts((current) => ({ ...current, [item.lineId]: value }));
    if (value.trim() === '') return;
    const nextPrice = Number(value);
    if (Number.isFinite(nextPrice) && nextPrice > 0) setCartPrice(item.lineId, item.id, nextPrice);
  };

  const commitPrice = (item: CartLine, moveToNextRow = false) => {
    const draft = priceDrafts[item.lineId];
    const parsed = draft === undefined ? item.price : Number(draft);
    const nextPrice = Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : item.price;
    setCartPrice(item.lineId, item.id, nextPrice);
    setPriceDrafts((current) => ({ ...current, [item.lineId]: String(nextPrice) }));
    if (moveToNextRow) skuInputRef.current?.focus();
  };

  const fillCustomer = (customer: Customer) => {
    setSelectedRestaurant(null);
    setSelectedCustomer(customer);
    setOriginalCustomer(customer);
    setName(customer.name);
    setPhone(customer.phone);
    setAddress(customer.address);
    setCustomerQuery(customer.name);
    setCustomerKind('existing');
    setCustomerStep('review');
  };

  const startNewCustomer = () => {
    setSelectedCustomer(null);
    setSelectedRestaurant(null);
    setOriginalCustomer(null);
    setOriginalRestaurant(null);
    setCustomerKind('new');
    setName('');
    setPhone('');
    setAddress('');
    setCustomerStep('new');
  };

  const startExistingCustomer = () => {
    setCustomerQuery('');
    setVisibleCustomerCount(10);
    setCustomerKind('existing');
    setCustomerStep('existing');
  };

  const fillRestaurant = (restaurant: Restaurant) => {
    setSelectedCustomer(null);
    setSelectedRestaurant(restaurant);
    setOriginalCustomer(null);
    setOriginalRestaurant(restaurant);
    setName(restaurant.name);
    setContact(restaurant.contact);
    setPhone(restaurant.phone);
    setEmail(restaurant.email);
    setAddress(restaurant.address);
    setArea(restaurant.area);
    setGstin(restaurant.gstin);
    setDeliverySlot(restaurant.deliverySlot);
    setCreditLimit(String(restaurant.creditLimit));
    setRestaurantQuery(restaurant.name);
    setCustomerKind('existing-restaurant');
    setCustomerStep('restaurant-review');
  };

  const startNewRestaurant = () => {
    setSelectedCustomer(null);
    setSelectedRestaurant(null);
    setOriginalCustomer(null);
    setOriginalRestaurant(null);
    setCustomerKind('new-restaurant');
    setName('');
    setContact('');
    setPhone('');
    setEmail('');
    setAddress('');
    setArea('');
    setGstin('');
    setDeliverySlot('4–6 PM');
    setCreditLimit('50000');
    setCustomerStep('restaurant-new');
  };

  const startExistingRestaurant = () => {
    setRestaurantQuery('');
    setCustomerKind('existing-restaurant');
    setCustomerStep('restaurant-existing');
  };

  const continueWithNewRestaurant = () => {
    if (!restaurantDetailsValid) return;
    setCustomerStep('ready');
  };

  const continueWithNewCustomer = () => {
    if (!customerDetailsValid) return;
    setSelectedCustomer(null);
    setCustomerStep('ready');
  };

  const saveCustomerChanges = () => {
    if (!originalCustomer || !customerDetailsValid) return;
    const details = { name: name.trim(), phone: phone.trim(), address: address.trim() };
    const updatedCustomer = { ...originalCustomer, ...details };
    updateCustomer(originalCustomer.id, details);
    setSelectedCustomer(updatedCustomer);
    setOriginalCustomer(updatedCustomer);
    setCustomerQuery(updatedCustomer.name);
    setCustomerStep('ready');
  };

  const saveRestaurantChanges = () => {
    if (!originalRestaurant || !restaurantDetailsValid) return;
    const details = { name: name.trim(), contact: contact.trim(), phone: phone.trim(), email: email.trim(), address: address.trim(), area: area.trim(), gstin: gstin.trim(), deliverySlot, creditLimit: Number(creditLimit) || 0 };
    const updatedRestaurant = { ...originalRestaurant, ...details };
    updateRestaurant(originalRestaurant.id, details);
    setSelectedRestaurant(updatedRestaurant);
    setOriginalRestaurant(updatedRestaurant);
    setRestaurantQuery(updatedRestaurant.name);
    setCustomerStep('ready');
  };

  const changeCustomer = () => {
    setSelectedCustomer(null);
    setSelectedRestaurant(null);
    setOriginalCustomer(null);
    setOriginalRestaurant(null);
    setCustomerKind(null);
    setCustomerQuery('');
    setName('');
    setPhone('');
    setAddress('');
    setContact('');
    setEmail('');
    setArea('');
    setGstin('');
    setCustomerStep('choose');
  };

  const useWalkIn = () => {
    setSelectedCustomer(null);
    setSelectedRestaurant(null);
    setOriginalCustomer(null);
    setOriginalRestaurant(null);
    setCustomerKind(null);
    setName('');
    setPhone('');
    setAddress('');
    setCustomerStep('ready');
    window.requestAnimationFrame(() => skuInputRef.current?.focus());
  };

  const recipientDraft = (): BillingRecipientDraft => ({
    kind: customerKind ?? 'walk-in',
    customerId: selectedCustomer?.id,
    restaurantId: selectedRestaurant?.id,
    name,
    phone,
    address,
    contact,
    email,
    area,
    gstin,
    deliverySlot,
    creditLimit,
  });

  const parkBill = () => {
    if (!cart.length) return;
    onPark({
      label: name.trim() || `Walk-in · ${cart.length} items`,
      cart,
      recipient: recipientDraft(),
      payment,
      delivery,
    });
  };

  const createUpiQr = () => {
    setUpiState('WAITING');
    setProductSelectionMessage(`UPI request created for ${money(total)}. Waiting for signed confirmation…`);
    window.setTimeout(() => {
      setUpiState('CONFIRMED');
      setProductSelectionMessage('UPI payment confirmed automatically. Press F8 to finish the bill.');
    }, 1600);
  };

  const attemptCheckout = () => {
    if (!cart.length || hasInvalidPrice || !partyDetailsValid || (delivery && !address.trim())) return;
    if (blockingGuardrails.length && !managerOverride) {
      setProductSelectionMessage('A manager override is required before this bill can be completed.');
      return;
    }
    if (payment === 'Cash' && Number(cashTendered || 0) < total) {
      setProductSelectionMessage('Enter the cash received before completing the bill.');
      return;
    }
    if (payment === 'UPI' && isOnline && upiState !== 'CONFIRMED') {
      if (upiState === 'IDLE') createUpiQr();
      return;
    }
    const effectivePayment = splitPayment
      ? `Cash ${money(Number(splitAmount || 0))} + ${payment}`
      : payment;
    completeBill({
      name,
      phone,
      address,
      payment: effectivePayment,
      delivery,
      restaurant: isRestaurant ? { id: originalRestaurant?.id, contact: contact.trim(), email: email.trim(), area: area.trim(), gstin: gstin.trim(), deliverySlot, creditLimit: Number(creditLimit) || 0 } : undefined,
      durationSeconds: Math.max(1, Math.round((Date.now() - billStartedAt.current) / 1000)),
      paymentPending: payment === 'UPI' && (!isOnline || upiState !== 'CONFIRMED'),
    });
  };

  const analyzeExternalOrder = () => setExternalLines(parseExternalOrder(externalOrderText, products));
  const importExternalOrder = () => {
    const approved = externalLines.filter((line) => line.status === 'MATCHED' && line.productId !== null && line.quantity > 0);
    approved.forEach((line) => {
      const product = products.find((candidate) => candidate.id === line.productId);
      if (product) selectProduct(product, line.quantity, line.sourceText, true);
    });
    setExternalOrderOpen(false);
    setProductSelectionMessage(`${approved.length} approved WhatsApp lines added. Uncertain lines were left out.`);
  };

  useEffect(() => {
    if (!active) return;
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT';
      if (!isTyping && /^[1-5]$/.test(event.key)) {
        const product = quickProducts[Number(event.key) - 1];
        if (product) {
          event.preventDefault();
          selectProduct(product);
        }
      }
      if (event.key === 'F2') {
        event.preventDefault();
        skuInputRef.current?.focus();
      }
      if (event.key === 'F4') {
        event.preventDefault();
        parkBill();
      }
      if (event.key === 'F8') {
        event.preventDefault();
        attemptCheckout();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  });

  return (
    <div className="page billing-page">
      <PageTitle eyebrow="Express point of sale" title="Create a new bill" description="Start with items. Add a recipient only when delivery, GST, wholesale, or credit requires one." actions={<><span className="bill-number">Next · INV-{2049 + Math.max(0, bills.length - initialBills.length)}</span><button className="shortcut-button" onClick={() => skuInputRef.current?.focus()}>F2 &nbsp; Smart entry</button><button className="shortcut-button" disabled={!cart.length} onClick={parkBill}>F4 &nbsp; Park</button></>} />

      <div className="express-status-bar" aria-label="Express billing status">
        <span className="express-badge"><i>⚡</i> Express mode</span>
        <span><b>F2</b> item command</span><span><b>F4</b> park bill</span><span><b>F8</b> checkout</span>
        <span className={isOnline ? 'positive' : 'warning'}>● {isOnline ? 'Live stock & payments' : 'Offline-safe billing'}</span>
      </div>

      {!customerReady && (
        <section className="customer-onboarding">
          {customerStep === 'choose' && (
            <>
              <div className="customer-step-head"><span className="step-icon">◎</span><div><p>Step 1 of 2</p><h2>Who is this bill for?</h2><small>Choose a customer or a restaurant account.</small></div></div>
              <button className="walk-in-choice" onClick={useWalkIn}><span>⚡</span><span><b>Continue as walk-in</b><small>No customer details required. You can add them later.</small></span><i>→</i></button>
              <p className="choice-group-label">Customers</p>
              <div className="customer-choice-grid">
                <button className="customer-choice" onClick={startNewCustomer}><span className="choice-icon">＋</span><span><b>New customer</b><small>Enter name, phone number and address first.</small></span><i>→</i></button>
                <button className="customer-choice" onClick={startExistingCustomer}><span className="choice-icon existing">⌕</span><span><b>Existing customer</b><small>Search, review and edit a saved customer.</small></span><i>→</i></button>
              </div>
              <p className="choice-group-label restaurant-label">Restaurants</p>
              <div className="customer-choice-grid">
                <button className="customer-choice restaurant-choice" onClick={startNewRestaurant}><span className="choice-icon restaurant">＋</span><span><b>Add restaurant</b><small>Create an account with delivery and credit details.</small></span><i>→</i></button>
                <button className="customer-choice restaurant-choice" onClick={startExistingRestaurant}><span className="choice-icon restaurant">⌕</span><span><b>Existing restaurant</b><small>Find a restaurant and use its saved details.</small></span><i>→</i></button>
              </div>
            </>
          )}

          {customerStep === 'new' && (
            <>
              <div className="customer-step-head"><button className="step-back" onClick={() => setCustomerStep('choose')} aria-label="Back to customer type">←</button><div><p>New customer</p><h2>Add customer details</h2><small>These details will be saved when the bill is created.</small></div></div>
              <div className="customer-form-grid">
                <label><span>Customer name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter full name" /></label>
                <label><span>Phone number</span><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+91 98765 43210" /></label>
                <label className="full-field"><span>Address (optional)</span><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Street, area and city" /></label>
              </div>
              <div className="customer-step-actions"><button className="secondary-action" onClick={() => setCustomerStep('choose')}>Back</button><button className="continue-action" disabled={!customerDetailsValid} onClick={continueWithNewCustomer}>Continue to add items <span>→</span></button></div>
            </>
          )}

          {customerStep === 'existing' && (
            <>
              <div className="customer-step-head"><button className="step-back" onClick={() => setCustomerStep('choose')} aria-label="Back to customer type">←</button><div><p>Existing customer</p><h2>Find a customer</h2><small>Search by customer name, phone number or address.</small></div></div>
              <label className="existing-customer-search"><span>⌕</span><input autoFocus value={customerQuery} onChange={(event) => { setCustomerQuery(event.target.value); setVisibleCustomerCount(10); }} placeholder="Search by name, phone number or address…" /></label>
              <div
                className="customer-search-results"
                role="listbox"
                aria-label="Customer list"
                onScroll={(event) => {
                  const list = event.currentTarget;
                  if (hasMoreCustomers && list.scrollHeight - list.scrollTop - list.clientHeight < 32) {
                    setVisibleCustomerCount((current) => Math.min(current + 10, filteredCustomers.length));
                  }
                }}
              >
                {suggestedCustomers.map((customer) => (
                  <button key={customer.id} className="customer-suggestion" role="option" aria-selected="false" onClick={() => fillCustomer(customer)}>
                    <span className="suggestion-avatar">{initials(customer.name)}</span>
                    <span className="suggestion-profile"><b>{customer.name}</b><small>{customer.phone}</small><em>{customer.address}</em></span>
                    <span className="suggestion-meta"><small>{customer.visits} visits</small><b>{money(customer.totalSpent)}</b></span>
                    <i>→</i>
                  </button>
                ))}
                {!suggestedCustomers.length && <div className="customer-search-empty"><span>∅</span><b>No matching customer</b><small>Try another name or phone number.</small></div>}
                {suggestedCustomers.length > 0 && (
                  <div className="customer-list-footer" aria-live="polite">
                    <span>Showing {suggestedCustomers.length} of {filteredCustomers.length} customers</span>
                    <b>{hasMoreCustomers ? 'Scroll for 10 more ↓' : 'All customers loaded ✓'}</b>
                  </div>
                )}
              </div>
            </>
          )}

          {customerStep === 'restaurant-new' && (
            <>
              <div className="customer-step-head"><button className="step-back" onClick={() => setCustomerStep('choose')} aria-label="Back to recipient type">←</button><div><p>New restaurant</p><h2>Add restaurant details</h2><small>The account will be saved when this bill is created.</small></div></div>
              <div className="customer-form-grid restaurant-form-grid">
                <label><span>Restaurant name *</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Annapoorna Bhavan" /></label>
                <label><span>Contact person *</span><input value={contact} onChange={(event) => setContact(event.target.value)} placeholder="Manager or storekeeper" /></label>
                <label><span>Phone number *</span><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+91 98765 43210" /></label>
                <label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="orders@restaurant.in" /></label>
                <label className="full-field"><span>Delivery address *</span><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Street, area and city" /></label>
                <label><span>Area</span><input value={area} onChange={(event) => setArea(event.target.value)} placeholder="Anna Nagar" /></label>
                <label><span>GSTIN</span><input value={gstin} onChange={(event) => setGstin(event.target.value.toUpperCase())} placeholder="33ABCDE1234F1Z5" /></label>
                <label><span>Preferred delivery slot</span><select value={deliverySlot} onChange={(event) => setDeliverySlot(event.target.value)}><option>6–8 AM</option><option>8–10 AM</option><option>10 AM–12 PM</option><option>12–2 PM</option><option>2–4 PM</option><option>4–6 PM</option></select></label>
                <label><span>Credit limit</span><input type="number" min="0" value={creditLimit} onChange={(event) => setCreditLimit(event.target.value)} /></label>
              </div>
              <div className="customer-step-actions"><button className="secondary-action" onClick={() => setCustomerStep('choose')}>Back</button><button className="continue-action" disabled={!restaurantDetailsValid} onClick={continueWithNewRestaurant}>Continue to add items <span>→</span></button></div>
            </>
          )}

          {customerStep === 'restaurant-existing' && (
            <>
              <div className="customer-step-head"><button className="step-back" onClick={() => setCustomerStep('choose')} aria-label="Back to recipient type">←</button><div><p>Existing restaurant</p><h2>Find a restaurant</h2><small>Search by restaurant, contact person, phone number or area.</small></div></div>
              <label className="existing-customer-search"><span>⌕</span><input autoFocus value={restaurantQuery} onChange={(event) => setRestaurantQuery(event.target.value)} placeholder="Search restaurant accounts…" /></label>
              <div className="restaurant-search-results" role="listbox" aria-label="Restaurant list">
                {filteredRestaurants.map((restaurant) => (
                  <button key={restaurant.id} className="customer-suggestion restaurant-suggestion" role="option" aria-selected="false" onClick={() => fillRestaurant(restaurant)}>
                    <span className="suggestion-avatar restaurant-avatar">{initials(restaurant.name)}</span>
                    <span className="suggestion-profile"><b>{restaurant.name}</b><small>{restaurant.contact} · {restaurant.phone}</small><em>{restaurant.address}</em></span>
                    <span className="suggestion-meta"><small>{restaurant.totalOrders} orders</small><b>{money(restaurant.totalSpent)}</b></span>
                    <StatusPill value={restaurant.status} />
                    <i>→</i>
                  </button>
                ))}
                {!filteredRestaurants.length && <div className="customer-search-empty"><span>∅</span><b>No matching restaurant</b><small>Try another restaurant name, contact or area.</small></div>}
              </div>
            </>
          )}

          {customerStep === 'restaurant-review' && originalRestaurant && (
            <>
              <div className="customer-step-head"><button className="step-back" onClick={startExistingRestaurant} aria-label="Back to restaurant search">←</button><div><p>Review restaurant</p><h2>Confirm restaurant details</h2><small>Check the delivery and account information before billing.</small></div></div>
              <div className="customer-review-overview restaurant-review-overview">
                <span className="review-avatar restaurant-avatar">{initials(originalRestaurant.name)}</span>
                <div><b>{originalRestaurant.name}</b><small>{originalRestaurant.contact} · {originalRestaurant.area}</small></div>
                <div className="profile-quick-stats"><span><small>Orders</small><b>{originalRestaurant.totalOrders}</b></span><span><small>Outstanding</small><b>{money(originalRestaurant.outstanding)}</b></span><span><small>Next delivery</small><b>{originalRestaurant.nextDelivery}</b></span></div>
              </div>
              <div className="customer-form-grid restaurant-form-grid">
                <label><span>Restaurant name *</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
                <label><span>Contact person *</span><input value={contact} onChange={(event) => setContact(event.target.value)} /></label>
                <label><span>Phone number *</span><input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
                <label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
                <label className="full-field"><span>Delivery address *</span><input value={address} onChange={(event) => setAddress(event.target.value)} /></label>
                <label><span>Area</span><input value={area} onChange={(event) => setArea(event.target.value)} /></label>
                <label><span>GSTIN</span><input value={gstin} onChange={(event) => setGstin(event.target.value.toUpperCase())} /></label>
                <label><span>Preferred delivery slot</span><select value={deliverySlot} onChange={(event) => setDeliverySlot(event.target.value)}><option>6–8 AM</option><option>8–10 AM</option><option>10 AM–12 PM</option><option>12–2 PM</option><option>2–4 PM</option><option>4–6 PM</option></select></label>
                <label><span>Credit limit</span><input type="number" min="0" value={creditLimit} onChange={(event) => setCreditLimit(event.target.value)} /></label>
              </div>
              <div className="customer-step-actions single-action"><button className="continue-action" disabled={!restaurantDetailsValid} onClick={saveRestaurantChanges}>Save and continue <span>→</span></button></div>
            </>
          )}

          {customerStep === 'review' && originalCustomer && (
            <>
              <div className="customer-step-head"><button className="step-back" onClick={startExistingCustomer} aria-label="Back to customer search">←</button><div><p>Review customer</p><h2>Confirm customer details</h2><small>Edit any information that has changed, or continue as-is.</small></div></div>
              <div className="customer-review-overview">
                <span className="review-avatar">{initials(originalCustomer.name)}</span>
                <div><b>{originalCustomer.name}</b><small>Customer since {originalCustomer.lastVisit === 'Just now' ? 'today' : 'before this visit'}</small></div>
                <div className="profile-quick-stats"><span><small>Visits</small><b>{originalCustomer.visits}</b></span><span><small>Total spent</small><b>{money(originalCustomer.totalSpent)}</b></span><span><small>Top item</small><b>{originalCustomer.topItem}</b></span></div>
              </div>
              <div className="customer-form-grid">
                <label><span>Customer name</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
                <label><span>Phone number</span><input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
                <label className="full-field"><span>Address (optional)</span><input value={address} onChange={(event) => setAddress(event.target.value)} /></label>
              </div>
              <div className="customer-step-actions single-action"><button className="continue-action" disabled={!customerDetailsValid} onClick={saveCustomerChanges}>Save and continue <span>→</span></button></div>
            </>
          )}
        </section>
      )}

      {customerReady && (
        <>
          <section className="selected-customer-banner">
            <span className="review-avatar">{name ? initials(name) : '⚡'}</span>
            <div className="selected-customer-copy"><small>{customerKind === null ? 'Express walk-in' : isRestaurant ? (customerKind === 'new-restaurant' ? 'New restaurant' : 'Restaurant account confirmed') : (customerKind === 'new' ? 'New customer' : 'Existing customer confirmed')}</small><b>{name || 'Walk-in customer'}</b><span>{customerKind === null ? 'Add details only if this order needs delivery or a customer record.' : `${isRestaurant && contact ? `${contact} · ` : ''}${phone}${address ? ` · ${address}` : ' · No address added'}`}</span></div>
            <div className="selected-customer-actions">{customerKind !== null && <button onClick={() => setCustomerStep(customerKind === 'existing' ? 'review' : customerKind === 'new' ? 'new' : customerKind === 'existing-restaurant' ? 'restaurant-review' : 'restaurant-new')}>Edit details</button>}<button onClick={changeCustomer}>{customerKind === null ? 'Add recipient' : 'Change recipient'}</button>{restaurantUsualBill && <button className="usual-order-button" onClick={() => onCopyBill(restaurantUsualBill, true)}>↻ Usual order</button>}</div>
          </section>

          <section className="billing-speed-strip">
            <div className="quick-key-group"><span>Predicted quick keys</span>{quickProducts.map((product, index) => <button key={product.id} onClick={() => selectProduct(product)}><kbd>{index + 1}</kbd><b>{product.short}</b><small>{product.name}</small></button>)}</div>
            <div className="speed-actions"><button onClick={() => setExternalOrderOpen(true)}>◫ WhatsApp order</button>{bills[0] && <button onClick={() => onCopyBill(bills[0])}>↻ Copy {bills[0].id}</button>}{parkedSessions.length > 0 && <button onClick={() => onResume(parkedSessions[0])}>▶ Resume {parkedSessions[0].label}</button>}</div>
          </section>

          <div className="billing-layout table-billing-layout">
            <section className="line-items-panel">
              <header className="line-items-heading">
                <div><p>Smart command bar</p><h2>Type the item and quantity together</h2><span>Try “12kg ponni”, “1 bag ponni”, “₹200 rice”, SKU, barcode, Tamil, or phonetic English.</span></div>
                <span className="keyboard-hint"><kbd>↵</kbd> Add instantly</span>
              </header>

              <div className="line-items-table-wrap">
                <table className="line-items-table">
                  <colgroup><col className="row-col" /><col className="sku-col" /><col className="item-col" /><col className="weight-col" /><col className="price-col" /><col className="amount-col" /><col className="action-col" /></colgroup>
                  <thead><tr><th>#</th><th>SKU / command</th><th>Item name</th><th>Qty / weight</th><th>Unit price</th><th>Price</th><th><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>
                    {cart.map((item, index) => {
                      const allocatedToOtherLines = cart.reduce((sum, line) =>
                        line.id === item.id && line.lineId !== item.lineId ? sum + line.quantity : sum, 0);
                      const availableForLine = Math.max(0, item.stock - allocatedToOtherLines);
                      const draftWeight = quantityDrafts[item.lineId] ?? String(item.quantity);
                      const draftNumber = Number(draftWeight);
                      const exceedsStock = Number.isFinite(draftNumber) && draftNumber > availableForLine;
                      const draftPrice = priceDrafts[item.lineId] ?? String(item.price);
                      const parsedPrice = Number(draftPrice);
                      const invalidPrice = draftPrice.trim() === '' || !Number.isFinite(parsedPrice) || parsedPrice <= 0;
                      return (
                        <tr className="completed-line" key={item.lineId}>
                          <td><span className="table-row-number">{index + 1}</span></td>
                          <td><span className="line-sku">{item.sku}</span></td>
                          <td><div className="line-item-name"><span className="line-item-mark" style={{ '--product-color': item.color } as CSSProperties}>{item.short}</span><span><strong>{item.name}</strong><small>{item.unitKind === 'WEIGHED' ? `${item.bagStock} bags + ${item.retailStockKg} kg retail` : `${item.stock} packs available`}{item.fulfillmentShop ? ` · reserved at ${item.fulfillmentShop}` : ''}</small>{item.enteredExpression && <em>“{item.enteredExpression}” · {item.saleMode === 'BAG' ? 'sealed bag' : 'retail'}</em>}</span></div></td>
                          <td>
                            <label className={`weight-input ${exceedsStock ? 'invalid' : ''}`}>
                              <input
                                id={`quantity-${item.lineId}`}
                                aria-label={`${item.unitKind === 'COUNTED' ? 'Pack quantity' : 'Weight in kilograms'} for ${item.name}, row ${index + 1}`}
                                type="number"
                                inputMode="decimal"
                                min={item.unitKind === 'COUNTED' ? '1' : '0.25'}
                                max={availableForLine}
                                step={item.unitKind === 'COUNTED' ? '1' : '0.25'}
                                value={draftWeight}
                                onChange={(event) => updateWeight(item, event.target.value)}
                                onBlur={() => commitWeight(item)}
                                onKeyDown={(event) => {
                                  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                                    event.preventDefault();
                                    const step = item.unitKind === 'COUNTED' ? 1 : 0.25;
                                    const nextQuantity = stepQuantity(draftWeight, event.key === 'ArrowUp' ? 'up' : 'down', step, step, availableForLine);
                                    updateWeight(item, String(nextQuantity));
                                  }
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    commitWeight(item, true);
                                  }
                                }}
                              />
                              <span>{item.unitKind === 'COUNTED' ? 'pk' : 'kg'}</span>
                            </label>
                            {exceedsStock && <small className="stock-error">Max {availableForLine} across these rows</small>}
                          </td>
                          <td>
                            <label className={`unit-price-input ${invalidPrice ? 'invalid' : ''}`}>
                              <span aria-hidden="true">₹</span>
                              <input
                                id={`price-${item.lineId}`}
                                aria-label={`Unit price for ${item.name}, row ${index + 1}`}
                                type="number"
                                inputMode="decimal"
                                min="0.01"
                                step="0.01"
                                value={draftPrice}
                                onChange={(event) => updatePrice(item, event.target.value)}
                                onBlur={() => commitPrice(item)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    commitPrice(item, true);
                                  }
                                }}
                              />
                            </label>
                            <small className={invalidPrice ? 'price-error' : item.price < item.cost ? 'price-error' : 'price-save-note'}>{invalidPrice ? 'Enter a valid price' : item.price < item.cost ? 'Below cost · override needed' : 'Price locked to this bill'}</small>
                          </td>
                          <td><strong className="line-amount">{money(item.price * item.quantity)}</strong></td>
                          <td><button className="remove-line" aria-label={`Remove ${item.name} from row ${index + 1}`} onClick={() => { removeFromCart(item.lineId); setQuantityDrafts((current) => { const next = { ...current }; delete next[item.lineId]; return next; }); setPriceDrafts((current) => { const next = { ...current }; delete next[item.lineId]; return next; }); }}>×</button></td>
                        </tr>
                      );
                    })}

                    <tr className="entry-line">
                      <td><span className="table-row-number active">{cart.length + 1}</span></td>
                      <td className="sku-entry-cell">
                        <div className="sku-entry-wrap">
                          <span className="sku-search-icon">⌕</span>
                          <input
                            ref={skuInputRef}
                            role="combobox"
                            aria-label="Enter SKU or item name"
                            aria-autocomplete="list"
                            aria-expanded={suggestionsOpen}
                            aria-controls="product-suggestions"
                            aria-activedescendant={suggestionsOpen && productSuggestions[activeSuggestion] ? `product-suggestion-${productSuggestions[activeSuggestion].id}` : undefined}
                            autoComplete="off"
                            value={itemQuery}
                            placeholder="e.g. 500g ponni or scan barcode"
                            onFocus={() => setSuggestionsOpen(true)}
                            onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)}
                            onChange={(event) => { setItemQuery(event.target.value); setActiveSuggestion(0); setSuggestionsOpen(true); }}
                            onKeyDown={handleSkuKeyDown}
                          />
                          {suggestionsOpen && (
                            <div className="product-suggestions" id="product-suggestions" role="listbox">
                              {productSuggestions.map((product, index) => (
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={index === activeSuggestion}
                                  className={index === activeSuggestion ? 'active' : ''}
                                  key={product.id}
                                  id={`product-suggestion-${product.id}`}
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => selectProduct(product)}
                                >
                                  <span className="suggestion-mark" style={{ '--product-color': product.color } as CSSProperties}>{product.short}</span>
                                  <span className="suggestion-main"><b>{product.sku}</b><small>{product.name}</small></span>
                                  <span className="suggestion-stock"><b>{money(product.price)} / {product.unitKind === 'COUNTED' ? 'pack' : 'kg'}</b><small className={remainingStockForProduct(product) ? 'positive' : product.otherShopStock ? 'warning' : 'negative'}>{remainingStockForProduct(product) ? product.unitKind === 'WEIGHED' ? `${product.bagStock} bags · ${product.retailStockKg} kg retail` : `${remainingStockForProduct(product)} local` : product.otherShopStock ? `${product.otherShopStock} at other shop` : 'No stock remaining'}</small></span>
                                </button>
                              ))}
                              {!productSuggestions.length && <div className="no-product-match"><b>No matching item</b><small>Check the SKU or try a different item name.</small></div>}
                              <div className="suggestion-help"><span>↑ ↓ Navigate</span><span>↵ Select</span><span>Esc Close</span></div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td><span className="empty-cell-copy">One command can fill this row</span></td>
                      <td><span className="disabled-cell">Auto</span></td>
                      <td><span className="disabled-cell">Price book</span></td>
                      <td><strong className="disabled-cell">₹0</strong></td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
              <footer className="line-items-footer"><span className={productSelectionMessage ? 'line-item-feedback' : ''} role="status" aria-live="polite">{productSelectionMessage || 'Tip: quantities, rupee amounts, aliases, Tamil names, SKUs, and barcodes all work here.'}</span><button onClick={() => skuInputRef.current?.focus()}>＋ Add another row</button></footer>
              {stockRescue && <div className="stock-rescue"><span>⇄</span><div><b>Stock rescue available</b><small>{stockRescue.product.name} has {stockRescue.product.otherShopStock} {stockRescue.product.unit} at {stockRescue.product.shop === 'Anna Nagar' ? 'Ayyanambakkam' : 'Anna Nagar'}.</small></div><button onClick={() => { const otherShop = stockRescue.product.shop === 'Anna Nagar' ? 'Ayyanambakkam' : 'Anna Nagar'; const lineId = addToCart(stockRescue.product, stockRescue.quantity, { enteredExpression: stockRescue.expression, fulfillmentShop: otherShop, saleMode: stockRescue.saleMode }); if (lineId !== null) { setProductSelectionMessage(`${stockRescue.product.name} reserved at ${otherShop}.`); setStockRescue(null); } }}>Reserve there</button><button className="quiet" onClick={() => setStockRescue(null)}>Dismiss</button></div>}
            </section>

            <aside className="cart-panel checkout-panel">
              <div className="cart-heading"><div><p>Current order</p><h2>{cart.length} {cart.length === 1 ? 'item' : 'items'}</h2></div><div><button disabled={!cart.length} onClick={parkBill}>Park</button><button disabled={!cart.length} onClick={() => { clearCart(); setQuantityDrafts({}); setPriceDrafts({}); }}>Clear</button></div></div>
              <div className="order-overview"><div><span>Items</span><strong>{cart.length}</strong></div><div><span>Total weight</span><strong>{totalWeight.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg</strong></div></div>
              <div className="cart-bottom">
                <label className="delivery-toggle"><span><b>{isRestaurant ? 'Restaurant delivery' : 'Home delivery'}</b><small>Create a delivery job after billing</small></span><input type="checkbox" checked={delivery} onChange={(event) => setDelivery(event.target.checked)} /><i /></label>
                <div className="payment-methods"><span>Payment method</span><div>{['Cash', 'UPI', 'Card', 'Credit'].map((method) => <button key={method} className={payment === method ? 'selected' : ''} onClick={() => { setPayment(method); setUpiState('IDLE'); }}>{method}</button>)}</div></div>
                {payment === 'Cash' && <label className="cash-tendered"><span>Cash received</span><div><b>₹</b><input inputMode="decimal" value={cashTendered} onChange={(event) => setCashTendered(event.target.value)} placeholder={String(Math.ceil(total / 10) * 10)} /></div><small>Change due: <b>{money(cashChange)}</b></small></label>}
                {payment === 'UPI' && <div className={`upi-autopilot ${upiState.toLowerCase()}`}><span className="upi-qr">{upiState === 'CONFIRMED' ? '✓' : '▦'}</span><div><b>{upiState === 'IDLE' ? 'Dynamic UPI ready' : upiState === 'WAITING' ? 'Waiting for confirmation…' : 'Payment confirmed'}</b><small>{upiState === 'IDLE' ? 'F8 creates a one-time QR.' : upiState === 'WAITING' ? 'The cashier can keep this bill open.' : 'Signed callback · RZP-8F2A'}</small></div>{upiState === 'IDLE' && <button onClick={createUpiQr}>Create QR</button>}</div>}
                <label className="split-toggle"><input type="checkbox" checked={splitPayment} onChange={(event) => setSplitPayment(event.target.checked)} /><span>Split payment</span>{splitPayment && <input aria-label="Cash portion" inputMode="decimal" value={splitAmount} onChange={(event) => setSplitAmount(event.target.value)} placeholder="Cash amount" />}</label>
                {guardrailIssues.length > 0 && <div className="guardrail-panel"><div><b>Billing guardrails</b><span>{guardrailIssues.length}</span></div>{guardrailIssues.map((issue, index) => <p className={issue.severity} key={`${issue.code}-${index}`}><i>{issue.severity === 'block' ? '!' : 'i'}</i>{issue.message}</p>)}{blockingGuardrails.length > 0 && <button className={managerOverride ? 'approved' : ''} onClick={() => setManagerOverride(true)}>{managerOverride ? '✓ Manager override recorded' : 'Manager override'}</button>}</div>}
                <div className="totals"><p><span>Subtotal</span><b>{money(subtotal)}</b></p><p><span>GST (5%)</span><b>{money(tax)}</b></p><p className="grand-total"><span>Total</span><b>{money(subtotal + tax)}</b></p></div>
                <button className="primary-action" disabled={!cart.length || cart.some((item) => item.quantity <= 0) || hasInvalidPrice || !partyDetailsValid || (delivery && !address.trim()) || (blockingGuardrails.length > 0 && !managerOverride) || (payment === 'Cash' && Number(cashTendered || 0) < total)} onClick={attemptCheckout}>{payment === 'UPI' && isOnline && upiState !== 'CONFIRMED' ? (upiState === 'WAITING' ? 'Waiting for UPI…' : 'Generate UPI QR') : !isOnline ? 'Create offline bill' : 'Create bill'} <span>{money(subtotal + tax)}</span></button>
                {delivery && !address.trim() && <small className="field-hint">Add a delivery address before creating the bill.</small>}
                {payment === 'Credit' && customerKind === null && <small className="field-hint">Choose a customer or restaurant before using credit.</small>}
                {!isOnline && <small className="offline-hint">Offline Guardian will save this sale locally and sync it exactly once.</small>}
              </div>
            </aside>
          </div>
        </>
      )}
      {externalOrderOpen && (
        <div className="drawer-layer external-order-layer" role="dialog" aria-modal="true" aria-label="Import WhatsApp order">
          <button className="drawer-backdrop" aria-label="Close importer" onClick={() => setExternalOrderOpen(false)} />
          <aside className="external-order-drawer">
            <div className="drawer-head"><div><p>Review-only ingestion</p><h2>WhatsApp to cart</h2></div><button onClick={() => setExternalOrderOpen(false)} aria-label="Close">×</button></div>
            <div className="import-source-tabs"><button className="selected">Aa Text</button><button onClick={() => setProductSelectionMessage('Photo OCR uses the same review queue once a file is attached.')}>▧ Photo / sheet</button><button onClick={() => setProductSelectionMessage('Voice transcription uses the same review queue before cart import.')}>◉ Voice note</button></div>
            <label className="external-order-input"><span>Paste the restaurant order</span><textarea value={externalOrderText} onChange={(event) => setExternalOrderText(event.target.value)} /><small>Nothing changes stock, price, or payment until a cashier approves the matches.</small></label>
            <button className="analyze-order" disabled={!externalOrderText.trim()} onClick={analyzeExternalOrder}>Analyze order</button>
            <div className="external-match-list">
              {externalLines.map((line) => {
                const product = products.find((candidate) => candidate.id === line.productId);
                return <article className={line.status.toLowerCase()} key={line.id}><span className="match-state">{line.status === 'MATCHED' ? '✓' : line.status === 'REVIEW' ? '?' : '!'}</span><div><b>{line.sourceText}</b><small>{product ? `${product.name} · ${line.quantity} ${product.unitKind === 'COUNTED' ? 'pack(s)' : 'kg'}` : line.error}</small></div><span className="confidence">{Math.round(line.confidence * 100)}%</span>{line.status === 'REVIEW' && <button onClick={() => setExternalLines((current) => current.map((candidate) => candidate.id === line.id ? { ...candidate, status: 'MATCHED' } : candidate))}>Approve</button>}</article>;
              })}
              {!externalLines.length && <div className="external-empty"><span>◫</span><b>Paste and analyze an order</b><small>Matches and confidence will appear here.</small></div>}
            </div>
            <div className="external-drawer-actions"><span>{externalLines.filter((line) => line.status === 'MATCHED').length} approved · {externalLines.filter((line) => line.status !== 'MATCHED').length} need attention</span><button disabled={!externalLines.some((line) => line.status === 'MATCHED')} onClick={importExternalOrder}>Add approved lines →</button></div>
          </aside>
        </div>
      )}
      </div>
  );
}

function InventoryPage({ products, setProducts }: { products: Product[]; setProducts: React.Dispatch<React.SetStateAction<Product[]>> }) {
  const [section, setSection] = useState<'overview' | 'add'>('overview');
  const [intakeMode, setIntakeMode] = useState<'choice' | 'new' | 'existing'>('choice');
  const [search, setSearch] = useState('');
  const [shop, setShop] = useState('All shops');
  const [status, setStatus] = useState('All stock');
  const [itemSearch, setItemSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [itemName, setItemName] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('Grains');
  const [intakeShop, setIntakeShop] = useState('Anna Nagar');
  const [bags, setBags] = useState('');
  const [bagWeight, setBagWeight] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [intakeMessage, setIntakeMessage] = useState('');
  const visible = products.filter((product) =>
    `${product.name} ${product.sku}`.toLowerCase().includes(search.toLowerCase()) &&
    (shop === 'All shops' || product.shop === shop) &&
    (status === 'All stock' || stockStatus(product) === status),
  );
  const low = products.filter((product) => stockStatus(product) === 'Low stock').length;
  const out = products.filter((product) => stockStatus(product) === 'Out of stock').length;
  const sealedBags = products.reduce((sum, product) => sum + product.bagStock, 0);
  const retailKg = products.reduce((sum, product) => sum + product.retailStockKg, 0);
  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? null;
  const matchingProducts = products.filter((product) =>
    `${product.name} ${product.sku}`.toLowerCase().includes(itemSearch.trim().toLowerCase()),
  ).slice(0, 6);
  const bagCount = Number(bags);
  const weightPerBag = Number(bagWeight);
  const pricePerBag = Number(purchasePrice);
  const totalWeight = bagCount > 0 && weightPerBag > 0 ? bagCount * weightPerBag : 0;
  const totalCost = bagCount > 0 && pricePerBag > 0 ? bagCount * pricePerBag : 0;
  const validQuantity = bagCount > 0 && Number.isInteger(bagCount) && weightPerBag > 0 && pricePerBag > 0;
  const newSkuExists = products.some((product) => product.sku.toLowerCase() === sku.trim().toLowerCase());
  const bagWeightMismatch = Boolean(selectedProduct && weightPerBag > 0 && Math.abs(selectedProduct.bagWeightKg - weightPerBag) > 0.01);

  const resetIntake = () => {
    setIntakeMode('choice');
    setItemSearch('');
    setSelectedProductId(null);
    setItemName('');
    setSku('');
    setCategory('Grains');
    setBags('');
    setBagWeight('');
    setPurchasePrice('');
  };

  const showIntakeSuccess = (message: string) => {
    setIntakeMessage(message);
    window.setTimeout(() => setIntakeMessage(''), 4500);
  };

  const addExistingStock = () => {
    if (!selectedProduct || !validQuantity || bagWeightMismatch) return;
    setProducts((current) => current.map((product) => product.id === selectedProduct.id ? {
      ...product,
      bagStock: product.bagStock + bagCount,
      stock: product.unitKind === 'WEIGHED' ? Number(((product.bagStock + bagCount) * product.bagWeightKg + product.retailStockKg).toFixed(2)) : product.stock + bagCount,
      cost: Number((product.unitKind === 'WEIGHED' ? pricePerBag / weightPerBag : pricePerBag).toFixed(2)),
      packSizeKg: product.unitKind === 'COUNTED' ? weightPerBag : product.packSizeKg,
    } : product));
    showIntakeSuccess(`${bags} sealed bags of ${selectedProduct.name} added to the Bags column · retail stock unchanged`);
    resetIntake();
  };

  const addNewStock = () => {
    if (!itemName.trim() || !sku.trim() || newSkuExists || !validQuantity) return;
    const normalizedName = itemName.trim();
    const costPerKg = pricePerBag / weightPerBag;
    const newProduct: Product = {
      id: Math.max(0, ...products.map((product) => product.id)) + 1,
      name: normalizedName,
      short: initials(normalizedName) || 'NI',
      sku: sku.trim().toUpperCase(),
      category,
      unit: 'kg',
      unitKind: 'WEIGHED',
      price: Number(costPerKg.toFixed(2)),
      cost: Number(costPerKg.toFixed(2)),
      stock: Number(totalWeight.toFixed(2)),
      bagStock: bagCount,
      retailStockKg: 0,
      bagWeightKg: weightPerBag,
      reorder: Math.max(10, Math.round(totalWeight * 0.2)),
      color: '#d7bd75',
      shop: intakeShop,
    };
    setProducts((current) => [newProduct, ...current]);
    showIntakeSuccess(`${normalizedName} created · ${bags} sealed bags added and retail starts at 0 kg`);
    resetIntake();
  };

  return (
    <div className="page">
      <div className="subpage-tabs inventory-tabs" role="tablist" aria-label="Inventory sections">
        <button role="tab" aria-selected={section === 'overview'} className={section === 'overview' ? 'selected' : ''} onClick={() => setSection('overview')}><span>□</span> Inventory overview <b>{products.length}</b></button>
        <button role="tab" aria-selected={section === 'add'} className={section === 'add' ? 'selected' : ''} onClick={() => setSection('add')}><span>＋</span> Add inventory</button>
      </div>
      {section === 'add' ? (
        <>
          <PageTitle eyebrow="Stock intake" title="Add inventory" description="Record a new delivery and keep your stock accurate." actions={<button className="secondary-action" onClick={() => setSection('overview')}>← Back to inventory</button>} />
          {intakeMessage && <div className="inventory-success" role="status"><span>✓</span><div><strong>Inventory updated</strong><small>{intakeMessage}</small></div></div>}
          {intakeMode === 'choice' ? (
            <section className="inventory-intake-card intake-choice-panel">
              <div className="intake-card-heading"><span className="step-icon">＋</span><div><p>Choose an option</p><h2>What are you adding?</h2><small>Create a product for the first time or add stock to an item already in your catalog.</small></div></div>
              <div className="intake-choice-grid">
                <button className="intake-choice" onClick={() => setIntakeMode('new')}><span className="choice-icon">◇</span><span><b>Add new item</b><small>Create a new product and add its first delivery to inventory.</small></span><i>→</i></button>
                <button className="intake-choice" onClick={() => setIntakeMode('existing')}><span className="choice-icon existing">⌕</span><span><b>Add existing item</b><small>Find an item by SKU or name and increase its current stock.</small></span><i>→</i></button>
              </div>
            </section>
          ) : (
            <section className="inventory-intake-card">
              <div className="intake-card-heading"><button className="step-back" onClick={resetIntake} aria-label="Back to inventory options">←</button><div><p>{intakeMode === 'new' ? 'New catalog item' : 'Existing catalog item'}</p><h2>{intakeMode === 'new' ? 'Add a new item' : 'Add stock to an existing item'}</h2><small>{intakeMode === 'new' ? 'Enter the item details and this delivery information.' : 'Search by SKU or item name, then record what arrived.'}</small></div></div>
              <div className="inventory-intake-layout">
                <div className="intake-fields">
                  {intakeMode === 'existing' ? (
                    <div className="existing-item-picker">
                      <label><span>Find item by SKU or name</span><div className="existing-item-search"><b>⌕</b><input value={itemSearch} onChange={(event) => { setItemSearch(event.target.value); setSelectedProductId(null); }} placeholder="Example: RIC-PON-01 or Ponni Rice" autoFocus /></div></label>
                      {itemSearch && !selectedProduct && <div className="existing-item-results">{matchingProducts.length ? matchingProducts.map((product) => <button key={product.id} onClick={() => { setSelectedProductId(product.id); setItemSearch(`${product.name} · ${product.sku}`); setIntakeShop(product.shop); setBagWeight(String(product.bagWeightKg)); }}><span className="mini-product" style={{ '--product-color': product.color } as CSSProperties}>{product.short}</span><span><strong>{product.name}</strong><small>{product.sku} · {product.shop}</small></span><i>{product.bagStock} bags · {product.retailStockKg} kg retail</i></button>) : <div className="picker-empty">No item matches that SKU or name.</div>}</div>}
                      {selectedProduct && <div className="selected-inventory-item"><span className="mini-product" style={{ '--product-color': selectedProduct.color } as CSSProperties}>{selectedProduct.short}</span><div><small>Selected item</small><strong>{selectedProduct.name}</strong><span>{selectedProduct.sku} · {selectedProduct.bagStock} sealed bags · {selectedProduct.retailStockKg} kg retail</span></div><button onClick={() => { setSelectedProductId(null); setItemSearch(''); setBagWeight(''); }}>Change</button></div>}
                    </div>
                  ) : (
                    <div className="new-item-grid">
                      <label><span>Item name</span><input value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="Example: Sona Masoori Rice" autoFocus /></label>
                      <label><span>SKU</span><input value={sku} onChange={(event) => setSku(event.target.value)} placeholder="Example: RIC-SON-01" />{newSkuExists && <small className="field-error">This SKU already exists. Add it as an existing item instead.</small>}</label>
                      <label><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option>Grains</option><option>Pulses</option><option>Flour</option><option>Spices</option><option>Oils</option><option>Sweeteners</option><option>Other</option></select></label>
                      <label><span>Receiving shop</span><select value={intakeShop} onChange={(event) => setIntakeShop(event.target.value)}><option>Anna Nagar</option><option>Ayyanambakkam</option></select></label>
                    </div>
                  )}
                  <div className="delivery-fields">
                    <p>Delivery details</p>
                    <div>
                      <label><span>Number of bags</span><div className="number-field"><input type="number" min="1" step="1" inputMode="numeric" value={bags} onChange={(event) => setBags(event.target.value)} placeholder="0" /><b>bags</b></div></label>
                      <label><span>Weight of each bag</span><div className="number-field"><input type="number" min="0.01" step="0.01" inputMode="decimal" value={bagWeight} onChange={(event) => setBagWeight(event.target.value)} placeholder="0.00" /><b>kg</b></div>{bagWeightMismatch && <small className="field-error">This item uses {selectedProduct?.bagWeightKg} kg bags. Use the same bag weight.</small>}</label>
                      <label><span>Purchase price per bag</span><div className="number-field price-field"><b>₹</b><input type="number" min="0.01" step="0.01" inputMode="decimal" value={purchasePrice} onChange={(event) => setPurchasePrice(event.target.value)} placeholder="0.00" /></div></label>
                    </div>
                  </div>
                </div>
                <aside className="intake-summary">
                  <div className="summary-icon">▥</div><p>Delivery summary</p>
                  <dl><div><dt>Bags received</dt><dd>{bagCount > 0 ? bagCount : '—'}</dd></div><div><dt>Weight per bag</dt><dd>{weightPerBag > 0 ? `${weightPerBag.toLocaleString('en-IN')} kg` : '—'}</dd></div><div className="summary-emphasis"><dt>Total weight</dt><dd>{totalWeight > 0 ? `${totalWeight.toLocaleString('en-IN')} kg` : '—'}</dd></div><div><dt>Price per bag</dt><dd>{pricePerBag > 0 ? money(pricePerBag) : '—'}</dd></div><div className="summary-total"><dt>Total purchase cost</dt><dd>{totalCost > 0 ? money(totalCost) : '—'}</dd></div></dl>
                  <small>Purchase cost is recorded from the price paid for each bag.</small>
                  <button className="save-intake" disabled={!validQuantity || bagWeightMismatch || (intakeMode === 'existing' ? !selectedProduct : !itemName.trim() || !sku.trim() || newSkuExists)} onClick={intakeMode === 'existing' ? addExistingStock : addNewStock}>Add to inventory <span>→</span></button>
                </aside>
              </div>
            </section>
          )}
        </>
      ) : (
      <>
      <PageTitle eyebrow="Stock control" title="Inventory" description="Live stock position across both shops." actions={<><button className="secondary-action">↥ Export report</button><button className="primary-small" onClick={() => setSection('add')}>＋ Add inventory</button></>} />
      <div className="metric-grid">
        <MetricCard label="Total products" value={String(products.length)} note="Across 6 categories" tone="green" icon="□" />
        <MetricCard label="Sealed bags" value={String(sealedBags)} note="Available for bag sales" tone="blue" icon="▥" />
        <MetricCard label="Retail display" value={`${retailKg} kg`} note="Open stock for kilo sales" tone="amber" icon="◒" />
        <MetricCard label="Needs attention" value={String(low + out)} note={`${out} out of stock`} tone="red" icon="!" />
      </div>
      <section className="data-card">
        <div className="data-toolbar">
          <label className="search-field compact"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product or SKU" /></label>
          <div className="filters"><select value={shop} onChange={(event) => setShop(event.target.value)}><option>All shops</option><option>Anna Nagar</option><option>Ayyanambakkam</option></select><select value={status} onChange={(event) => setStatus(event.target.value)}><option>All stock</option><option>In stock</option><option>Low stock</option><option>Out of stock</option></select></div>
        </div>
        <div className="table-wrap">
          <table className="inventory-table"><thead><tr><th>Product</th><th>SKU</th><th>Shop</th><th>Bags</th><th>Retail</th><th>Bag weight</th><th>Total available</th><th>Value</th><th>Status</th></tr></thead>
            <tbody>{visible.map((product) => { const productStatus = stockStatus(product); const percentage = Math.min(100, (product.stock / Math.max(product.reorder * 3, 1)) * 100); return (
              <tr key={product.id}><td><div className="product-cell"><span className="mini-product" style={{ '--product-color': product.color } as CSSProperties}>{product.short}</span><div><strong>{product.name}</strong><small>{product.category} · {product.unit}</small></div></div></td><td><span className="mono">{product.sku}</span></td><td>{product.shop}</td><td><div className="split-stock-cell bags-stock"><strong>{product.bagStock}</strong><small>sealed bags</small></div></td><td><div className={`split-stock-cell retail-stock ${product.retailStockKg > 0 ? 'open' : ''}`}><strong>{product.unitKind === 'WEIGHED' ? product.retailStockKg : '—'}</strong><small>{product.unitKind === 'WEIGHED' ? 'kg open' : 'not sold loose'}</small></div></td><td><strong>{product.bagWeightKg} kg</strong><small> / bag</small></td><td><div className="total-stock-cell"><strong>{product.stock} {product.unitKind === 'COUNTED' ? 'packs' : 'kg'}</strong><div className="stock-bar"><i style={{ width: `${percentage}%` }} className={productStatus === 'In stock' ? '' : productStatus === 'Low stock' ? 'low' : 'out'} /></div></div></td><td>{money(product.stock * product.price)}</td><td><StatusPill value={productStatus} /></td></tr>
            ); })}</tbody>
          </table>
        </div>
        <div className="table-footer"><span>Showing {visible.length} of {products.length} products</span><span>Updated just now</span></div>
      </section>
      </>
      )}
    </div>
  );
}

function DeliveriesPage({ deliveries, setDeliveries, restaurants, setRestaurants, onNewBill }: { deliveries: Delivery[]; setDeliveries: React.Dispatch<React.SetStateAction<Delivery[]>>; restaurants: Restaurant[]; setRestaurants: React.Dispatch<React.SetStateAction<Restaurant[]>>; onNewBill: (restaurant: Restaurant) => void }) {
  const [section, setSection] = useState<'orders' | 'restaurants'>('orders');
  const [status, setStatus] = useState('All');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('Today');
  const visible = deliveries.filter((delivery) =>
    (status === 'All' || delivery.status === status) &&
    `${delivery.customer} ${delivery.id} ${delivery.phone}`.toLowerCase().includes(search.toLowerCase()),
  );
  const changeStatus = (id: string, next: DeliveryStatus) => setDeliveries((current) => current.map((delivery) => delivery.id === id ? { ...delivery, status: next, updated: 'Just now' } : delivery));

  return (
    <div className="page">
      <div className="subpage-tabs" role="tablist" aria-label="Delivery sections">
        <button role="tab" aria-selected={section === 'orders'} className={section === 'orders' ? 'selected' : ''} onClick={() => setSection('orders')}><span>⌁</span> Delivery orders <b>{deliveries.length}</b></button>
        <button role="tab" aria-selected={section === 'restaurants'} className={section === 'restaurants' ? 'selected' : ''} onClick={() => setSection('restaurants')}><span>♨</span> Restaurants <b>{restaurants.length}</b></button>
      </div>
      {section === 'restaurants' ? (
        <RestaurantsPage restaurants={restaurants} setRestaurants={setRestaurants} deliveries={deliveries} onNewBill={onNewBill} />
      ) : (
      <>
        <PageTitle eyebrow="Order fulfillment" title="Delivery orders" description="Track pending, active and completed deliveries." actions={<button className="primary-small">＋ Add delivery</button>} />
        <div className="metric-grid delivery-metrics">
        <MetricCard label="Pending" value={String(deliveries.filter((item) => item.status === 'Pending').length)} note="Awaiting assignment" tone="amber" icon="◷" />
        <MetricCard label="On the way" value={String(deliveries.filter((item) => item.status === 'Out for delivery').length)} note="With delivery partner" tone="blue" icon="⌁" />
        <MetricCard label="Delivered" value={String(deliveries.filter((item) => item.status === 'Delivered').length)} note="96% on-time rate" tone="green" icon="✓" />
        <MetricCard label="Needs attention" value={String(deliveries.filter((item) => item.status === 'Failed').length)} note="Failed attempt" tone="red" icon="!" />
        </div>
        <section className="data-card">
        <div className="filter-header">
          <div className="segmented">{['Today', 'This week', 'This month'].map((item) => <button className={date === item ? 'selected' : ''} key={item} onClick={() => setDate(item)}>{item}</button>)}</div>
          <label className="search-field compact"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search delivery" /></label>
        </div>
        <div className="status-tabs">{['All', 'Pending', 'Out for delivery', 'Delivered', 'Failed'].map((item) => <button key={item} className={status === item ? 'selected' : ''} onClick={() => setStatus(item)}>{item}<span>{item === 'All' ? deliveries.length : deliveries.filter((delivery) => delivery.status === item).length}</span></button>)}</div>
        <div className="delivery-list">
          {visible.map((delivery) => (
            <article className="delivery-row" key={delivery.id}>
              <div className="delivery-id"><span className={`delivery-icon ${delivery.status.toLowerCase().replaceAll(' ', '-')}`}>{delivery.status === 'Delivered' ? '✓' : delivery.status === 'Failed' ? '!' : '⌁'}</span><div><strong>{delivery.id}</strong><small>{delivery.billId}</small></div></div>
              <div className="delivery-customer"><strong>{delivery.customer}</strong><small>{delivery.phone}</small></div>
              <div className="delivery-address"><strong>{delivery.address}</strong><small>{delivery.slot}</small></div>
              <div><StatusPill value={delivery.status} /><small className="updated">Updated {delivery.updated}</small></div>
              <div className="driver"><span className="avatar small">{delivery.driver === 'Unassigned' ? '—' : initials(delivery.driver)}</span><div><small>Driver</small><strong>{delivery.driver}</strong></div></div>
              <select aria-label={`Update ${delivery.id} status`} value={delivery.status} onChange={(event) => changeStatus(delivery.id, event.target.value as DeliveryStatus)}><option>Pending</option><option>Out for delivery</option><option>Delivered</option><option>Failed</option></select>
            </article>
          ))}
        </div>
        <div className="table-footer"><span>{visible.length} deliveries · {date}</span><span>Last synced just now</span></div>
        </section>
      </>
      )}
    </div>
  );
}

function RestaurantsPage({ restaurants, setRestaurants, deliveries, onNewBill }: { restaurants: Restaurant[]; setRestaurants: React.Dispatch<React.SetStateAction<Restaurant[]>>; deliveries: Delivery[]; onNewBill: (restaurant: Restaurant) => void }) {
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<Restaurant | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', contact: '', phone: '', email: '', address: '', area: '', gstin: '', deliverySlot: '4–6 PM', creditLimit: '50000' });
  const visible = restaurants.filter((restaurant) => `${restaurant.name} ${restaurant.contact} ${restaurant.phone} ${restaurant.area}`.toLowerCase().includes(search.toLowerCase()));
  const totalOutstanding = restaurants.reduce((sum, restaurant) => sum + restaurant.outstanding, 0);
  const updateDraft = (key: keyof typeof draft, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  const saveRestaurant = () => {
    if (!draft.name.trim() || !draft.contact.trim() || !draft.phone.trim() || !draft.address.trim()) return;
    const restaurant: Restaurant = {
      id: Date.now(), name: draft.name.trim(), contact: draft.contact.trim(), phone: draft.phone.trim(), email: draft.email.trim(), address: draft.address.trim(), area: draft.area.trim(), gstin: draft.gstin.trim().toUpperCase(), deliverySlot: draft.deliverySlot, creditLimit: Number(draft.creditLimit) || 0,
      outstanding: 0, totalOrders: 0, totalSpent: 0, lastOrder: 'No orders yet', nextDelivery: 'Not scheduled', status: 'Active', notes: 'New restaurant account — add delivery notes after the first order.',
    };
    setRestaurants((current) => [restaurant, ...current]);
    setDraft({ name: '', contact: '', phone: '', email: '', address: '', area: '', gstin: '', deliverySlot: '4–6 PM', creditLimit: '50000' });
    setAdding(false);
    setDetail(restaurant);
  };

  if (detail) {
    const restaurantDeliveries = deliveries.filter((delivery) => delivery.customer === detail.name);
    const creditAvailable = Math.max(0, detail.creditLimit - detail.outstanding);
    const setAccountStatus = (status: RestaurantStatus) => {
      const updated = { ...detail, status };
      setRestaurants((current) => current.map((restaurant) => restaurant.id === detail.id ? updated : restaurant));
      setDetail(updated);
    };
    return (
      <>
        <button className="back-button" onClick={() => setDetail(null)}>‹ Back to restaurants</button>
        <div className="restaurant-profile-head">
          <span className="profile-avatar restaurant-profile-avatar">{initials(detail.name)}</span>
          <div><p>Restaurant account</p><h1>{detail.name}</h1><span>{detail.contact} · {detail.phone} · {detail.area}</span></div>
          <StatusPill value={detail.status} />
          <button className="primary-small" onClick={() => onNewBill(detail)}>＋ Create bill</button>
        </div>
        <div className="profile-metrics restaurant-profile-metrics"><div><span>Lifetime sales</span><strong>{money(detail.totalSpent)}</strong></div><div><span>Total orders</span><strong>{detail.totalOrders}</strong></div><div><span>Outstanding</span><strong className={detail.outstanding ? 'negative' : 'positive'}>{money(detail.outstanding)}</strong></div><div><span>Credit available</span><strong>{money(creditAvailable)}</strong></div></div>
        <div className="restaurant-detail-grid">
          <section className="data-card padded restaurant-account-card">
            <div className="section-title"><div><p>Account details</p><h2>Restaurant information</h2></div><select aria-label="Account status" value={detail.status} onChange={(event) => setAccountStatus(event.target.value as RestaurantStatus)}><option>Active</option><option>On hold</option></select></div>
            <dl className="detail-list"><div><dt>Contact person</dt><dd>{detail.contact}</dd></div><div><dt>Phone</dt><dd>{detail.phone}</dd></div><div><dt>Email</dt><dd>{detail.email || 'Not added'}</dd></div><div><dt>GSTIN</dt><dd className="mono">{detail.gstin || 'Not added'}</dd></div><div className="wide"><dt>Delivery address</dt><dd>{detail.address}</dd></div><div><dt>Credit limit</dt><dd>{money(detail.creditLimit)}</dd></div></dl>
          </section>
          <section className="data-card padded restaurant-delivery-card">
            <div className="section-title"><div><p>Delivery tracking</p><h2>Schedule &amp; instructions</h2></div><span>{restaurantDeliveries.length} linked jobs</span></div>
            <div className="delivery-schedule"><span className="schedule-icon">⌁</span><div><small>Next delivery</small><strong>{detail.nextDelivery}</strong><p>Preferred daily slot · {detail.deliverySlot}</p></div></div>
            <div className="instruction-note"><span>i</span><p><b>Delivery instructions</b>{detail.notes}</p></div>
            <div className="linked-deliveries">{restaurantDeliveries.length ? restaurantDeliveries.map((delivery) => <button key={delivery.id}><span><b>{delivery.id}</b><small>{delivery.slot} · {delivery.driver}</small></span><StatusPill value={delivery.status} /></button>) : <div className="empty-linked-deliveries"><b>No delivery jobs yet</b><small>Create a bill with restaurant delivery enabled.</small></div>}</div>
          </section>
        </div>
      </>
    );
  }

  if (adding) {
    return (
      <>
        <button className="back-button" onClick={() => setAdding(false)}>‹ Back to restaurants</button>
        <PageTitle eyebrow="Restaurant accounts" title="Add restaurant" description="Create a billing, credit and delivery profile." />
        <section className="data-card padded add-restaurant-card">
          <div className="customer-form-grid restaurant-form-grid">
            <label><span>Restaurant name *</span><input autoFocus value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} /></label><label><span>Contact person *</span><input value={draft.contact} onChange={(event) => updateDraft('contact', event.target.value)} /></label>
            <label><span>Phone number *</span><input value={draft.phone} onChange={(event) => updateDraft('phone', event.target.value)} /></label><label><span>Email</span><input type="email" value={draft.email} onChange={(event) => updateDraft('email', event.target.value)} /></label>
            <label className="full-field"><span>Delivery address *</span><input value={draft.address} onChange={(event) => updateDraft('address', event.target.value)} /></label><label><span>Area</span><input value={draft.area} onChange={(event) => updateDraft('area', event.target.value)} /></label>
            <label><span>GSTIN</span><input value={draft.gstin} onChange={(event) => updateDraft('gstin', event.target.value.toUpperCase())} /></label><label><span>Delivery slot</span><select value={draft.deliverySlot} onChange={(event) => updateDraft('deliverySlot', event.target.value)}><option>6–8 AM</option><option>8–10 AM</option><option>10 AM–12 PM</option><option>12–2 PM</option><option>2–4 PM</option><option>4–6 PM</option></select></label>
            <label><span>Credit limit</span><input type="number" min="0" value={draft.creditLimit} onChange={(event) => updateDraft('creditLimit', event.target.value)} /></label>
          </div>
          <div className="customer-step-actions"><button className="secondary-action" onClick={() => setAdding(false)}>Cancel</button><button className="continue-action" disabled={!draft.name.trim() || !draft.contact.trim() || !draft.phone.trim() || !draft.address.trim()} onClick={saveRestaurant}>Save restaurant <span>→</span></button></div>
        </section>
      </>
    );
  }

  return (
    <>
      <PageTitle eyebrow="Delivery network" title="Restaurants" description="Track restaurant details, credit and upcoming deliveries." actions={<button className="primary-small" onClick={() => setAdding(true)}>＋ Add restaurant</button>} />
      <div className="metric-grid restaurant-metrics"><MetricCard label="Active restaurants" value={String(restaurants.filter((restaurant) => restaurant.status === 'Active').length)} note="Ready for orders" tone="green" icon="♨" /><MetricCard label="Upcoming deliveries" value={String(restaurants.filter((restaurant) => restaurant.nextDelivery !== 'On hold' && restaurant.nextDelivery !== 'Not scheduled').length)} note="Scheduled accounts" tone="blue" icon="⌁" /><MetricCard label="Outstanding credit" value={money(totalOutstanding)} note="Across all accounts" tone="amber" icon="₹" /><MetricCard label="On hold" value={String(restaurants.filter((restaurant) => restaurant.status === 'On hold').length)} note="Needs attention" tone="red" icon="!" /></div>
      <section className="data-card">
        <div className="data-toolbar"><label className="search-field compact wide"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search restaurant, contact, phone or area" /></label><div className="restaurant-view-note"><span>●</span> Live account details</div></div>
        <div className="table-wrap"><table><thead><tr><th>Restaurant</th><th>Contact</th><th>Delivery</th><th>Orders</th><th>Lifetime sales</th><th>Outstanding</th><th>Status</th><th /></tr></thead><tbody>{visible.map((restaurant) => <tr key={restaurant.id} className="clickable-row" onClick={() => setDetail(restaurant)}><td><div className="customer-name"><span className="avatar restaurant-avatar">{initials(restaurant.name)}</span><div><strong>{restaurant.name}</strong><small className="address-line">{restaurant.area} · {restaurant.gstin || 'No GSTIN'}</small></div></div></td><td><strong>{restaurant.contact}</strong><small className="address-line">{restaurant.phone}</small></td><td><strong>{restaurant.nextDelivery}</strong><small className="address-line">Preferred · {restaurant.deliverySlot}</small></td><td>{restaurant.totalOrders}</td><td><strong>{money(restaurant.totalSpent)}</strong></td><td><strong className={restaurant.outstanding ? 'negative' : 'positive'}>{money(restaurant.outstanding)}</strong></td><td><StatusPill value={restaurant.status} /></td><td><button aria-label={`Open ${restaurant.name}`}>›</button></td></tr>)}</tbody></table></div>
        <div className="table-footer"><span>Showing {visible.length} of {restaurants.length} restaurants</span><span>Open a restaurant to track full details</span></div>
      </section>
    </>
  );
}

function CustomersPage({ customers, bills, detail, setDetail, onNewBill }: { customers: Customer[]; bills: Bill[]; detail: Customer | null; setDetail: (customer: Customer | null) => void; onNewBill: (customer: Customer) => void }) {
  const [search, setSearch] = useState('');
  const visible = customers.filter((customer) => `${customer.name} ${customer.phone}`.toLowerCase().includes(search.toLowerCase()));

  if (detail) {
    const customerBills = bills.filter((bill) => bill.phone === detail.phone);
    const purchaseCounts = new Map<string, number>();
    customerBills.forEach((bill) => bill.items.forEach((item) => purchaseCounts.set(item.name, (purchaseCounts.get(item.name) ?? 0) + item.quantity)));
    const topItems = [...purchaseCounts.entries()].sort((a, b) => b[1] - a[1]);
    return (
      <div className="page">
        <button className="back-button" onClick={() => setDetail(null)}>‹ Back to customers</button>
        <div className="customer-profile-head">
          <span className="profile-avatar">{initials(detail.name)}</span>
          <div><p>Customer profile</p><h1>{detail.name}</h1><span>{detail.phone} · {detail.address}</span></div>
          <button className="primary-small" onClick={() => onNewBill(detail)}>＋ Create bill</button>
        </div>
        <div className="profile-metrics"><div><span>Lifetime spend</span><strong>{money(detail.totalSpent)}</strong></div><div><span>Total visits</span><strong>{detail.visits}</strong></div><div><span>Average bill</span><strong>{money(Math.round(detail.totalSpent / detail.visits))}</strong></div><div><span>Last purchase</span><strong>{detail.lastVisit}</strong></div></div>
        <div className="customer-detail-grid">
          <section className="data-card padded"><div className="section-title"><div><p>Purchase patterns</p><h2>Most purchased items</h2></div><span>By quantity</span></div>
            <div className="top-items">{(topItems.length ? topItems : [[detail.topItem, 8], ['Crystal Salt', 4], ['Gingelly Oil', 3]] as Array<[string, number]>).slice(0, 4).map(([item, count], index) => <div key={item}><span className="rank">{index + 1}</span><div><strong>{item}</strong><small>{count} units purchased</small></div><div className="rank-bar"><i style={{ width: `${Math.max(20, 100 - index * 23)}%` }} /></div></div>)}</div>
          </section>
          <section className="data-card padded"><div className="section-title"><div><p>Recent activity</p><h2>Purchased bills</h2></div><span>{customerBills.length || 3} bills</span></div>
            <div className="mini-bill-list">{(customerBills.length ? customerBills : initialBills.slice(0, 3)).slice(0, 4).map((bill) => <div key={bill.id}><span className="bill-file">▤</span><div><strong>{bill.id}</strong><small>{bill.date} · {bill.items.length} items</small></div><strong>{money(bill.amount)}</strong><StatusPill value={bill.status} /></div>)}</div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <PageTitle eyebrow="Customer records" title="Customers" description="Contact details and complete purchase history." actions={<button className="primary-small">＋ Add customer</button>} />
      <div className="metric-grid customer-metrics">
        <MetricCard label="Total customers" value={String(customers.length)} note="4 added this month" tone="green" icon="◎" />
        <MetricCard label="Returning customers" value="68%" note="Up 4.2% this month" tone="blue" icon="↻" />
        <MetricCard label="Average spend" value="₹1,284" note="Per customer" tone="amber" icon="₹" />
      </div>
      <section className="data-card">
        <div className="data-toolbar"><label className="search-field compact wide"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or phone number" /></label><div className="filters"><select><option>All customers</option><option>Recent customers</option><option>High value</option></select></div></div>
        <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Contact</th><th>Last purchase</th><th>Visits</th><th>Top item</th><th>Total spent</th><th /></tr></thead><tbody>
          {visible.map((customer) => <tr key={customer.id} className="clickable-row" onClick={() => setDetail(customer)}><td><div className="customer-name"><span className="avatar">{initials(customer.name)}</span><strong>{customer.name}</strong></div></td><td><strong>{customer.phone}</strong><small className="address-line">{customer.address}</small></td><td>{customer.lastVisit}</td><td>{customer.visits}</td><td>{customer.topItem}</td><td><strong>{money(customer.totalSpent)}</strong></td><td><button aria-label={`Open ${customer.name}`}>›</button></td></tr>)}
        </tbody></table></div>
        <div className="table-footer"><span>Showing {visible.length} of {customers.length} customers</span><span>Customer data is captured during billing</span></div>
      </section>
    </div>
  );
}

function BillsPage({ bills, setSelectedBill }: { bills: Bill[]; setSelectedBill: (bill: Bill) => void }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All statuses');
  const [payment, setPayment] = useState('All payments');
  const [date, setDate] = useState('This week');
  const visible = bills.filter((bill) =>
    `${bill.id} ${bill.customer} ${bill.phone}`.toLowerCase().includes(search.toLowerCase()) &&
    (status === 'All statuses' || bill.status === status) &&
    (payment === 'All payments' || bill.payment === payment),
  );
  const total = bills.filter((bill) => bill.status === 'Paid').reduce((sum, bill) => sum + bill.amount, 0);

  return (
    <div className="page">
      <PageTitle eyebrow="Sales records" title="All bills" description="Find, review and track every bill created." actions={<button className="secondary-action">↥ Export bills</button>} />
      <div className="bill-summary"><div><p>Collected sales</p><strong>{money(total)}</strong><span>↗ 12.8% from last week</span></div><div className="summary-divider" /><div><p>Bills created</p><strong>{bills.length}</strong><span>{bills.filter((bill) => bill.status === 'Paid').length} paid</span></div><div className="summary-divider" /><div><p>Average bill value</p><strong>{money(Math.round(bills.reduce((sum, bill) => sum + bill.amount, 0) / bills.length))}</strong><span>Across both shops</span></div><div className="sales-bars" aria-label="Weekly sales trend">{[35, 58, 44, 76, 62, 90, 72].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div></div>
      <section className="data-card">
        <div className="data-toolbar bill-filters"><label className="search-field compact"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Bill number, customer or phone" /></label><div className="filters"><select value={date} onChange={(event) => setDate(event.target.value)}><option>Today</option><option>This week</option><option>This month</option></select><select value={payment} onChange={(event) => setPayment(event.target.value)}><option>All payments</option><option>Cash</option><option>UPI</option><option>Card</option><option>Credit</option></select><select value={status} onChange={(event) => setStatus(event.target.value)}><option>All statuses</option><option>Paid</option><option>Pending</option><option>Refunded</option></select></div></div>
        <div className="table-wrap"><table><thead><tr><th>Bill number</th><th>Customer</th><th>Date & time</th><th>Shop</th><th>Items</th><th>Payment</th><th>Amount</th><th>Status</th><th /></tr></thead><tbody>
          {visible.map((bill) => <tr key={bill.id} className="clickable-row" onClick={() => setSelectedBill(bill)}><td><strong className="bill-id">{bill.id}</strong></td><td><strong>{bill.customer}</strong><small className="address-line">{bill.phone}</small></td><td>{bill.date}<small className="address-line">{bill.time}</small></td><td>{bill.shop}</td><td>{bill.items.reduce((sum, item) => sum + item.quantity, 0)}</td><td>{bill.payment}</td><td><strong>{money(bill.amount)}</strong></td><td><StatusPill value={bill.status} /></td><td><button aria-label={`Open ${bill.id}`}>›</button></td></tr>)}
        </tbody></table></div>
        <div className="table-footer"><span>{visible.length} bills · {date}</span><span>Total shown: {money(visible.reduce((sum, bill) => sum + bill.amount, 0))}</span></div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, note, tone, icon }: { label: string; value: string; note: string; tone: string; icon: string }) {
  return <article className="metric-card"><span className={`metric-icon ${tone}`}>{icon}</span><div><p>{label}</p><strong>{value}</strong><small>{note}</small></div></article>;
}

function StatusPill({ value }: { value: string }) {
  const key = value.toLowerCase().replaceAll(' ', '-');
  return <span className={`status-pill ${key}`}><i />{value}</span>;
}

function BillDrawer({ bill, onClose, onDuplicate, onPrint }: { bill: Bill; onClose: () => void; onDuplicate: () => void; onPrint: () => void }) {
  const subtotal = Math.round(bill.amount / 1.05);
  return (
    <div className="drawer-layer" role="dialog" aria-modal="true" aria-label={`Bill ${bill.id}`}>
      <button className="drawer-backdrop" aria-label="Close bill" onClick={onClose} />
      <aside className="bill-drawer">
        <div className="drawer-head"><div><p>Bill details</p><h2>{bill.id}</h2></div><button onClick={onClose} aria-label="Close">×</button></div>
        <div className="receipt-brand"><span className="brand-mark">SVT</span><div><strong>Sri Vijay Traders</strong><small>{bill.shop} · Chennai</small></div></div>
        <div className="receipt-info"><div><span>Billed to</span><strong>{bill.customer}</strong><small>{bill.phone}</small></div><div><span>Issued</span><strong>{bill.date}</strong><small>{bill.time}</small></div></div>
        <div className="receipt-lines"><div className="receipt-row header"><span>Item</span><span>Qty</span><span>Amount</span></div>{bill.items.map((item) => <div className="receipt-row" key={item.name}><span><strong>{item.name}</strong><small>{money(item.price)} each</small></span><span>{item.quantity}</span><strong>{money(item.price * item.quantity)}</strong></div>)}</div>
        <div className="receipt-totals"><p><span>Subtotal</span><b>{money(subtotal)}</b></p><p><span>GST (5%)</span><b>{money(bill.amount - subtotal)}</b></p><p><span>Total</span><b>{money(bill.amount)}</b></p></div>
        <div className="receipt-payment"><div><span>Payment</span><strong>{bill.payment}</strong><small>{bill.syncState === 'SYNC_REQUIRED' ? 'Queued locally' : bill.durationSeconds ? `Completed in ${bill.durationSeconds}s` : 'Synced'}</small></div><StatusPill value={bill.status} /></div>
        <div className="drawer-actions"><button onClick={onPrint}>Print bill</button><button onClick={onDuplicate}>Duplicate bill</button><button>Share receipt</button></div>
      </aside>
    </div>
  );
}

function RecoveryCenter({ items, parked, onClose, onResume, onResolve }: { items: RecoveryItem[]; parked: ParkedBillingSession[]; onClose: () => void; onResume: (session: ParkedBillingSession) => void; onResolve: (item: RecoveryItem) => void }) {
  return (
    <div className="drawer-layer" role="dialog" aria-modal="true" aria-label="Cashier recovery center">
      <button className="drawer-backdrop" aria-label="Close recovery center" onClick={onClose} />
      <aside className="recovery-drawer">
        <div className="drawer-head"><div><p>Cashier safety net</p><h2>Recovery center</h2></div><button onClick={onClose} aria-label="Close">×</button></div>
        <div className="recovery-summary"><div><strong>{parked.length}</strong><span>Parked bills</span></div><div><strong>{items.filter((item) => item.kind === 'PAYMENT').length}</strong><span>Payments</span></div><div><strong>{items.filter((item) => item.kind === 'SYNC').length}</strong><span>Sync queue</span></div></div>
        <section className="recovery-section"><div className="section-title"><div><p>Resume work</p><h2>Parked bills</h2></div></div>{parked.length ? parked.map((session) => <article className="recovery-row" key={session.id}><span className="recovery-kind blue">Ⅱ</span><div><b>{session.label}</b><small>{session.cart.length} lines · {new Date(session.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</small></div><button onClick={() => onResume(session)}>Resume</button></article>) : <p className="recovery-empty">No parked bills.</p>}</section>
        <section className="recovery-section"><div className="section-title"><div><p>Needs attention</p><h2>Payments, prints &amp; sync</h2></div></div>{items.length ? items.map((item) => <article className="recovery-row" key={item.id}><span className={`recovery-kind ${item.tone}`}>{item.kind === 'PAYMENT' ? '₹' : item.kind === 'PRINT' ? '▤' : '↻'}</span><div><b>{item.title}</b><small>{item.detail}</small></div><button onClick={() => onResolve(item)}>{item.kind === 'PRINT' ? 'Retry' : item.kind === 'SYNC' ? 'Sync now' : 'Reconcile'}</button></article>) : <p className="recovery-empty">Everything is reconciled and synchronized.</p>}</section>
      </aside>
    </div>
  );
}
