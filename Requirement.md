# Unified POS, Inventory, Billing, Payment, Cash, and Delivery Requirements

## 1. Purpose and Core Design Principles

This application will support two or more shop locations, shop computers, mobile devices, customer kiosks, thermal printers, Razorpay payments, inventory, supplier purchases, deliveries, returns, and cash settlement.

The following rules are mandatory throughout the system:

1. Access is determined by the signed-in user's role and assigned shop locations, not by the device being used.
2. Delivery status, customer-payment status, cash-custody status, worker settlement, printing, refund, and Razorpay bank settlement are separate records and must never be represented by one combined status.
3. The person who creates a bill is not automatically the person who collected or currently holds the money.
4. A manager or owner who approves a transaction is not automatically recorded as the cash holder.
5. Physical cash and electronic payments must follow separate workflows.
6. Every money movement must create an append-only ledger transaction. Existing money records must not be edited or deleted.
7. A bill must count as sales revenue only once, regardless of how many payment attempts, collections, handovers, refunds, or duplicate payments occur.
8. Important operations must be idempotent so a retry, duplicate webhook, device reconnect, or repeated button press cannot create the same bill, payment, inventory movement, print job, or settlement twice.
9. Currency amounts must be stored as integer paise, not floating-point numbers. Rounding rules must be consistent and recorded on the bill.
10. Backend authorization is mandatory. Hiding a page or button in the interface is not sufficient security.

---

## 2. Role-Based and Shop-Based Access

### 2.1 Interface on Every Device

The same role rules apply whether the user signs in from a:

- Shop computer
- Mobile phone
- Tablet
- Other authorized device

Examples:

- An owner signing in on a phone or computer sees the Owner interface.
- A manager sees the Manager interface for their assigned shops.
- A worker or delivery person sees only Billing and Delivery functions, even on a shop computer.
- A kiosk operates under a restricted, customer-facing Kiosk role.

The application must be responsive on computers, phones, tablets, and kiosks.

### 2.2 Shop-Location Access

Every user, bill, payment, payment attempt, cash account, cash drawer, cash session, ledger transaction, inventory movement, delivery, supplier purchase, printer, and print job must be connected to a shop location where applicable.

- The owner can access all shop locations.
- A manager can access only assigned locations, unless the owner assigns additional locations.
- A worker or delivery person can access only their assigned shop and their own permitted activities.
- Each kiosk is permanently assigned to one shop.
- Each physical cash drawer and printer is assigned to one shop.
- Cross-shop inventory or cash movements must use explicit transfer workflows.

### 2.3 Account and Device Security

- Employees must use individual accounts; shared employee accounts should not be allowed.
- Lost or unauthorized devices must be revocable without disabling the employee's account everywhere.
- High-risk actions may require PIN or password re-entry.
- The backend must record the signed-in user, role, shop, device/session, date, and time for sensitive actions.

---

## 3. User Roles

### 3.1 Owner

The owner has access to every authorized feature from any device.

The Owner dashboard should display:

- Sales for today, this week, this month, and this year
- Number and value of bills
- Cash, UPI, and card payment totals
- Reported cash awaiting confirmation
- Cash physically held by each worker or delivery person
- Cash in each drawer
- Pending and partially completed cash handovers
- Expected and actual drawer balances
- Razorpay payments awaiting reconciliation
- Expected and actual Razorpay bank settlements
- In-person and delivery sales
- Inventory value
- Low-stock and out-of-stock products
- Supplier outstanding balances
- Returns, refunds, exchanges, voids, shortages, and write-offs
- Pending deliveries and delivery-person activity
- Sales, payment, cash, delivery, and inventory information by shop

The owner should be able to filter by:

- Date and time
- Shop location
- Employee
- Cash holder
- Payment method
- Billing source
- In-person or delivery sale
- Payment, delivery, settlement, refund, and reconciliation status

### 3.2 Manager

A manager has operational access for assigned shops and can:

- Create and review bills
- Accept cash, card, and UPI payments
- Confirm reported cash collections
- Operate an assigned cash drawer
- Open and close cash sessions
- Receive cash handovers from workers and delivery personnel
- Issue and receive change cash
- Manage inventory and supplier receiving
- Track and record supplier payments
- Process authorized returns, refunds, exchanges, and bill voids
- Assign and monitor deliveries
- Complete delivery settlements
- View low-stock and out-of-stock items
- View operational reports for assigned shops

Owner-only settings, including user-role administration and unrestricted access to all shops, remain restricted.

### 3.3 Worker or Delivery Person

A worker or delivery person has access only to Billing and Delivery functions.

The worker or delivery person may:

- Create cash bills
- Create UPI bills and initiate a business UPI payment request
- Display a bill-specific Razorpay UPI QR code or approved payment link
- See whether Razorpay has verified the UPI payment
- Record cash physically collected from a customer
- View bills created by them
- View assigned deliveries and trips
- Update delivery outcomes
- View change cash received and returned
- View cash currently held for the shop
- View outstanding amounts owed to the shop
- Create a cash-handover request
- View their completed, partial, and pending settlements
- View print status for their own bills

The worker or delivery person may not:

- Accept card payments unless a separate future permission and approved terminal are provided
- Mark a UPI payment successful based on a screenshot, SMS, verbal confirmation, or the customer's phone
- Manually change the main bill to `Paid`
- Use a personal UPI ID or personal bank account to collect business payments
- Access full inventory management, supplier purchases, business-wide bills, financial reports, other employees' activities, settings, or user management
- Approve refunds, price overrides, voids, cash corrections, shortages, or settlement corrections

### 3.4 Kiosk

The kiosk provides only:

- Product browsing
- Cart
- Customer order creation
- Card payment
- UPI payment
- Receipt or order-slip printing

The kiosk must not expose internal business pages or cash payment options.

### 3.5 Permission Summary

| Feature | Owner | Manager | Worker/Delivery | Kiosk |
| --- | --- | --- | --- | --- |
| Business dashboard | All shops | Assigned shops | No | No |
| Billing | Yes | Yes | Own bills | Self-service only |
| Cash payment collection | Yes | Yes | Yes | No |
| UPI payment initiation | Yes | Yes | Yes | Yes |
| Manual UPI success confirmation | No normal manual override | No normal manual override | No | No |
| Card payment | Yes | Yes | No | Yes |
| Inventory management | Yes | Yes | No | No |
| Supplier purchases | Yes | Yes | No | No |
| All business bills | Yes | Assigned shops | Own bills only | Current order only |
| Returns and exchanges | Yes | As permitted | No | No |
| Refund approval | Yes | As permitted | No | No |
| Delivery assignment | Yes | Yes | No | No |
| Delivery activity | All | Assigned shops | Own only | No |
| Cash collection recording | Yes | Yes | Own collections | No |
| Cash settlement verification | Yes | Yes | Submit/view own | No |
| Reports | All | Operational | No | No |
| User and role management | Yes | No | No | No |

---

## 4. Bill Lifecycle and Billing Rules

### 4.1 Bill Lifecycle

A bill should move through controlled states such as:

- Draft
- Offline draft
- Posted
- Voided
- Returned or partially returned

The bill record is separate from its payment, delivery, print, refund, and settlement records.

Rules:

- A final bill number is generated by the backend only when the bill is successfully posted.
- A posted bill number is immutable and unique within the configured numbering scope.
- Bills must never be deleted.
- An incorrect posted bill must be voided by an authorized owner or manager with a reason.
- A void, return, or exchange must create linked reversing records; it must not rewrite the original history.
- Inventory must be reduced, restored, or transferred exactly once through idempotent inventory transactions.
- A bill's financial totals must be immutable after posting. Corrections require a void, return, credit, or replacement bill.

### 4.2 Kiosk Billing

Customers can create orders on the kiosk and pay using:

- Credit or debit card
- UPI

Payments must use the approved Razorpay integration assigned to that kiosk or shop. Cash is not available.

The bill becomes paid only when the backend verifies the successful electronic payment. If payment is pending or fails, the kiosk must not produce a final paid receipt.

### 4.3 Owner or Manager Billing

Owners and managers can create bills using:

- Cash
- Credit or debit card
- UPI, including supported UPI apps
- Approved split payments

Card and terminal-based UPI options should be enabled only when the device can communicate with the appropriate approved terminal. A manager or owner using a phone may still accept UPI through a bill-specific approved Razorpay flow when available.

### 4.4 Worker Billing: Cash

When a worker creates a cash bill:

1. The bill is saved in the backend.
2. A unique final bill number is generated after successful posting.
3. The bill is linked to the worker and shop.
4. The bill appears on the assigned shop computer.
5. A print job is created if printing is required.
6. The system separately asks who physically collected the cash.

Possible cases:

- **Manager or drawer collects the cash:** the drawer receives the cash, the worker's cash balance remains zero, and the authorized manager confirms the cash payment.
- **Worker collects the cash:** the worker's physical-cash account increases, the bill displays `Cash reported — awaiting confirmation`, and worker settlement remains pending.
- **No cash collected:** the payment remains pending; no cash ledger entry is created.

The manager's confirmation and the physical handover are separate actions. A manager can confirm that a customer paid while the worker still holds the cash; this must not move the cash into the drawer. Cash moves only when a handover is actually recorded and accepted.

### 4.5 Worker or Delivery UPI Billing

Workers and delivery personnel are allowed to accept business UPI payments through the application.

Recommended flow:

1. The worker posts the bill or selects an assigned delivery bill.
2. The backend creates a payment attempt for the exact unpaid amount or selected partial amount.
3. The backend requests a bill-specific Razorpay dynamic QR code or approved payment link.
4. The worker displays it to the customer or shares it through an approved channel.
5. The customer pays the business Razorpay account using a supported UPI app.
6. The worker's screen shows `Payment processing` until the backend verifies the payment.
7. After verified successful or captured payment, the backend creates a confirmed electronic payment allocation against the bill.
8. If confirmed allocations equal the amount due, the backend changes the bill payment status to `Paid` automatically.

UPI rules:

- The worker cannot manually mark UPI as successful.
- A screenshot, SMS, customer claim, bank-app animation, or sound-box message is not sufficient system confirmation.
- UPI money never enters the worker's physical-cash ledger.
- UPI money enters a Razorpay clearing account and later a bank-settlement record.
- A manager does not need to approve a correctly verified UPI payment.
- A fixed-amount, single-use QR is preferred for a single bill payment because it reduces amount-entry and matching errors.
- If split payment is used, create a separate payment attempt for the exact UPI portion or remaining balance.
- A common static QR should not be used in the first version because it makes automatic bill matching and duplicate-payment handling harder.
- When a bill is paid through another method, voided, or expires, any still-open bill-specific QR or payment request should be closed where the Razorpay product permits it.
- Worker UPI collection requires connectivity. If the application cannot reach the backend or verify Razorpay, it must remain pending and must not be treated as paid.
- If the UPI payment succeeds after the worker has left the screen, the late verified result must still be attached to the correct bill and shown to the manager and worker.

### 4.6 Split and Partial Payments

The system may support:

- Part cash and part UPI
- Part cash and part card
- Deposit followed by final payment
- Customer credit or pay-later only if explicitly enabled by the owner

Each portion must be a separate payment allocation with its own source, collector or gateway attempt, amount, status, and timestamp.

Example for a ₹2,000 bill:

- ₹1,000 cash reported by a worker
- ₹1,000 UPI verified by Razorpay

The backend derives the bill as fully paid only after confirmed allocations equal ₹2,000. Until the cash portion is confirmed by an authorized manager or owner, the bill must clearly show that the UPI portion is confirmed and the cash portion is awaiting confirmation.

Customer credit should be disabled by default. If enabled later, it requires a customer account, credit limit, due date, approval, receipts, and an accounts-receivable balance.

### 4.7 Bill Price and Cost History

Every bill line permanently stores:

- Product and variant name
- Quantity or weight
- Unit of measure
- Selling price used
- Discount and approver, if applicable
- Tax, if applicable
- Rounding adjustment
- Final line amount
- Product cost or receipt-cost reference used for reporting

Changing current product prices or costs must never alter old bills.

---

## 5. Payment Records and Computed Bill Status

### 5.1 Separate Financial Records

The data model must keep separate records for:

- Bill
- Payment allocation to a bill
- Electronic payment attempt
- Verified successful electronic payment
- Reported cash collection
- Confirmed cash payment
- Cash handover and handover allocation
- Refund
- Chargeback or dispute
- Razorpay settlement batch
- Actual bank deposit and reconciliation

### 5.2 Main Bill Payment Status

The backend should calculate the bill's payment status from confirmed payment allocations. Managers confirm or reverse cash collections; they should not freely type or overwrite a status value.

| Bill payment status | Meaning |
| --- | --- |
| Pending | No confirmed payment allocation covers the amount due |
| Partially paid | Confirmed allocations are greater than zero but less than the amount due |
| Paid | Confirmed allocations equal the amount due |
| Overpaid / duplicate payment | Confirmed money received exceeds the amount due and requires resolution |
| Partially refunded | Part of the confirmed paid amount has been refunded |
| Refunded | The refundable paid amount has been fully refunded |
| Voided with financial action pending | Bill is voided but a required cash reversal or electronic refund remains incomplete |

`Cash reported — awaiting confirmation` should be an additional collection flag, not a substitute for the computed payment status.

### 5.3 Electronic Payment Attempts

A bill may have multiple attempts, including:

- Failed UPI attempt
- Timed-out card attempt
- Successful retry
- Late success or capture of an earlier attempt
- Duplicate successful payment

Each attempt records:

- Internal attempt ID
- Internal idempotency key
- Bill ID
- Amount and currency
- Payment method
- Razorpay order, QR, payment, or terminal identifiers as applicable
- Attempt status
- Failure reason, when available
- Creation and update timestamps
- Raw provider reference or safely retained event reference for audit

Suggested internal attempt states include:

- Created
- Customer action pending
- Authorized
- Confirmed or captured
- Failed
- Timed out or status unknown
- Late success
- Reversed

`Authorized` alone must not be treated as paid. A verified captured or otherwise definitive successful state is required according to the selected Razorpay product.

If two attempts succeed, the bill's sales amount remains unchanged. The extra payment is recorded as an overpayment or duplicate requiring refund or approved allocation.

---

## 6. Physical Cash Custody and Append-Only Money Ledger

### 6.1 Cash Custody Accounts

The system must identify where physical cash is currently held. Examples include:

- Worker or delivery-person cash account
- Physical cash drawer
- Manager-held cash account, only when the manager physically holds it outside a drawer
- Cash in transit between shops
- Cash in transit to the bank

Approval alone must not change custody.

### 6.2 Append-Only, Balanced Transactions

Every money movement creates a permanent ledger transaction with balanced source and destination entries. Do not independently edit balances.

Examples:

- Customer gives ₹1,000 to a delivery person: customer payment source to delivery-person cash custody, ₹1,000.
- Delivery person hands ₹1,000 to a drawer: delivery-person custody decreases ₹1,000 and drawer custody increases ₹1,000.
- Drawer issues ₹500 change cash: drawer decreases ₹500 and delivery-person custody increases ₹500.
- Drawer refunds ₹250: drawer decreases ₹250 and customer-refund destination increases ₹250.
- Drawer deposits ₹10,000 into the bank: drawer decreases, then cash-in-transit increases; after bank confirmation, cash-in-transit decreases and bank increases.

Supported ledger transaction types include:

- Cash received from customer
- Cash confirmation or reversal
- Worker-to-drawer handover
- Drawer-to-worker change issue
- Change returned
- Customer cash refund
- Supplier cash payment
- Owner cash addition or withdrawal
- Cash moved between shops
- Cash deposited into bank
- Delivery expense, only if enabled and approved
- Drawer correction
- Shortage or excess write-off
- Reversal of an incorrect ledger transaction

Existing entries must not be edited or deleted. Corrections use a reversing transaction linked to the original, with reason, approver, and timestamp.

### 6.3 Required Cash Record Fields

Every cash collection or movement must record:

- Amount
- Cash tendered by the customer, when applicable
- Change returned to the customer, when applicable
- Net cash retained and amount allocated to the bill
- Currency
- Customer, supplier, or counterparty when applicable
- Collected by
- Received from
- Received by
- Current holder or drawer after posting
- Shop
- Bill, trip, cash session, supplier bill, refund, or transfer reference
- Created by and confirmed by
- Date and time
- Settlement status
- Idempotency key
- Reversal reference, if corrected

### 6.4 Cash Confirmation

When a worker reports collecting cash:

- The system creates an unconfirmed cash-payment allocation and a physical-custody ledger entry for the worker.
- The bill displays `Cash reported — awaiting confirmation`.
- An owner or manager reviews and confirms or disputes the reported collection.
- Confirmation identifies the approving user but does not move cash.
- After confirmation, the backend recalculates the bill payment status.

If the manager physically receives the money at the same time, the system also creates a separate handover to the drawer or manager-held cash account.

---

## 7. Cash Handovers, Worker Settlement, and Change Cash

### 7.1 Partial Handovers

If a worker owes ₹1,500 and submits ₹1,400:

- The receiving drawer increases by the actual ₹1,400.
- The worker's physical-cash balance decreases by ₹1,400.
- ₹100 remains outstanding.
- The full ₹1,500 must not be marked settled.
- The receiving manager or owner is recorded.
- The remaining ₹100 is cleared only by another handover, approved reversal, or shortage write-off.

Each handover must be allocated to specific eligible items, such as:

- Customer cash collections
- Bills
- Change-cash issues
- Previously outstanding amounts
- Approved expenses or adjustments

The system must prevent one collection or change issue from being settled twice.

For better control, the giver submits the handover and the receiver accepts the actual counted amount. A discrepancy requires a reason and remains visible.

### 7.2 Change Cash

The manager or owner may issue change cash before or during a delivery trip.

Record:

- Amount issued
- Delivery person
- Issuer
- Source drawer and cash session
- Trip
- Date and time
- Amount returned or handed over
- Remaining unreturned amount
- Settlement status

The delivery person's current amount due is:

> Unreturned change cash + unsettled confirmed cash collections

The calculation must account for:

- Initial change cash
- Additional change cash
- Change already returned
- Cash already handed over during the trip
- Partially settled bills
- Approved delivery expenses, if enabled
- Approved shortage or excess adjustments

Prepaid, card, and UPI payments must never enter the delivery person's physical-cash liability.

### 7.3 Settlement Scope

An owner or manager may settle:

- One eligible collection
- One handover
- One delivery trip
- All eligible items for a day

The settlement screen should display:

- Worker or delivery person
- Cash collections and related bills
- Verified UPI and prepaid bills, shown for information but excluded from cash due
- Unpaid bills
- Failed and returned deliveries
- Change issued and returned
- Expected cash due
- Actual cash counted and accepted
- Remaining outstanding balance
- Shortage or excess
- Settlement date
- Receiving drawer and cash session
- Verifying manager or owner

Customer-payment status and worker-settlement status remain separate. A customer may have paid in full while the worker still owes cash to the shop.

---

## 8. Daily Cash-Drawer Management

Each physical drawer has its own cash session. Only one active cash session may exist per physical drawer.

At opening, an owner or manager records:

- Physical drawer
- Shop
- Opening amount
- User opening the drawer
- Date and time

During the session, the drawer ledger tracks:

- Cash sales collected directly into the drawer
- Worker and delivery handovers actually received
- Change cash issued and returned
- Customer cash refunds
- Supplier cash payments
- Cash transfers
- Bank deposits
- Authorized additions and removals

Expected closing cash must be computed from actual drawer ledger movements, not from bill statuses.

At closing, record:

- Expected cash
- Actual counted cash
- Shortage or excess
- Explanation
- Closing user and time

Rules:

- Drawer cash cannot normally be accepted without an open session. An authorized manager must open a session first or use a controlled after-hours receipt process.
- A payment received after closure must enter a new active session or a documented after-hours custody account; it must not be inserted into the closed session.
- A closed session is immutable and must not be reopened and edited.
- Later corrections use append-only adjustments approved by an owner or manager.
- If the drawer lacks enough cash for a refund, the refund remains pending or uses another approved payment source. The drawer must not become fictitiously negative.
- A manager shift change requires a counted handover and new custody acknowledgment.

---

## 9. Delivery Management

### 9.1 Assignment and Trips

Owners and managers can:

- View unassigned delivery bills
- Assign or reassign deliveries
- Group bills into a trip
- View trip routes and total bill value
- View expected cash-on-delivery exposure separately from prepaid or UPI payments
- Issue change cash

Assigned deliveries appear immediately in the delivery person's account.

### 9.2 Keep Delivery Outcome and Payment Collection Separate

The backend must store two independent fields.

**Delivery outcome:**

- Assigned
- Out for delivery
- Delivered
- Partially delivered, if enabled
- Customer unavailable
- Customer rejected order
- Delivery failed
- Returned to shop

**Payment collection action:**

- No collection required — already prepaid
- Cash collected
- Start UPI payment
- UPI verified by backend
- Mixed payment recorded
- No payment collected

The interface may show convenient combined choices, but it must write the two underlying records separately.

Recommended visible delivery choices include:

- **Delivered — prepaid:** enabled only when the bill already has sufficient verified payment.
- **Delivered — cash collected:** records the cash collector and custody; the bill shows awaiting confirmation until a manager or owner confirms the cash allocation.
- **Delivered — UPI verified:** enabled only after the backend has verified the UPI payment allocation.
- **Delivered — payment pending:** delivery succeeds but unpaid balance remains; a reason is required.
- **Delivery failed or returned:** no successful delivery; payment and inventory consequences are handled separately.

A worker cannot select `UPI verified` manually. It is a system-derived option.

`Delivered — payment pending` creates an outstanding customer balance and an immediate manager notification. It requires a reason, follow-up owner, and due date. If customer credit is disabled, this remains an exception requiring manager resolution rather than an ordinary pay-later facility.

### 9.3 Returned and Partially Delivered Goods

- Marking a delivery `Returned to shop` must not automatically add inventory back before the shop confirms physical receipt and condition.
- The receiving manager records whether goods return to sellable, damaged, supplier-return, or discard inventory.
- Partial delivery or item refusal, if enabled, creates a delivery adjustment and return/credit workflow. It must not silently edit the original bill.
- Inventory and refunds must each occur exactly once.

---

## 10. Inventory Management

### 10.1 Product Variants and Receipt History

Different package sizes must be separate product variants, for example:

- 5 kg
- 10 kg
- 26 kg
- 30 kg

Older and newer sizes can coexist and remain independently selectable. The user may choose the variant to sell; FIFO selection is not mandatory.

Each supplier-receipt line must retain its own internal receipt identity, quantity, unit cost, and date for costing and audit. A user-facing batch number is not required.

### 10.2 Whole-Bag and Loose Inventory

The system separately manages:

- Unopened whole bags
- Opened loose stock sold by weight

When a bag is opened:

1. Whole-bag quantity decreases.
2. The bag's configured weight is added to loose stock.
3. Loose sales reduce loose-stock weight.
4. The system records the user, source variant/receipt, shop, and time.

### 10.3 Inventory Transaction Ledger

Stock should be calculated from append-only inventory transactions, including:

- Supplier receipt
- Sale
- Bill void reversal
- Customer return
- Bag opened into loose stock
- Transfer sent and received
- Damage or spoilage
- Count correction
- Supplier return

Corrections require reversing transactions and reasons. Inventory records must not be silently overwritten.

### 10.4 Supplier Stock Receiving

The receiving page should show supplier and bill information at the top and a fast table for multiple product rows.

Each supplier bill includes:

- Supplier
- Supplier bill number
- Bill and delivery dates
- Products and variants received
- Package size or weight
- Bags or units
- Purchase price and tax, if applicable
- Total bill amount
- Amount paid
- Outstanding balance
- Due date
- Payment status

Users can search and select an existing product/variant or create a missing one without leaving the table.

Supplier payment statuses include:

- Unpaid
- Partially paid
- Paid

Each supplier payment is a separate payment record. Cash supplier payments also create drawer ledger transactions.

### 10.5 Customer Returns

Each return records:

- Original bill and line
- Product and variant
- Returned quantity or weight
- Reason and condition
- Processing user
- Date and time
- Inventory decision

Inventory decisions include:

- Return to sellable inventory
- Add to damaged inventory
- Return to supplier
- Discard

Only physically received, resale-suitable goods return to available inventory.

### 10.6 Transfers Between Shops

Each transfer records:

- Product and variant
- Quantity or weight
- Sending and receiving shops
- Creating and receiving users
- Sent and received dates
- Status: Created, In transit, Received, Cancelled

The sending shop decreases when the transfer is dispatched. The receiving shop increases only when physical receipt is confirmed. Cancelling or correcting a dispatched transfer requires a reversing movement.

### 10.7 Stock Adjustments

Authorized users can record:

- Damage
- Spoilage
- Weight difference
- Missing stock
- Count correction
- Other approved reason

Every adjustment requires a reason, approver where configured, and audit record.

---

## 11. Printing and Shop-Computer Queue

If a worker creates a bill on a device without a printer:

1. The backend posts the bill.
2. The bill appears on the assigned shop computer.
3. A unique print job is created for that shop's printer.
4. A local printing service receives the job.
5. The printer prints the document.
6. The local service reports the result to the backend.

Print statuses include:

- Pending
- Printing
- Printed
- Failed
- Reprint requested
- Reprinted

Rules:

- A print failure must never lose or roll back the bill.
- Offline printers or shop computers leave the print job pending for retry.
- A unique print-job idempotency key prevents repeated printing.
- Manual reprints must say `Reprint` or `Copy` and appear in the audit log.
- The worker sees whether the bill was saved, sent, pending, printed, or failed.
- A document printed before full payment confirmation must clearly say `Payment pending`, `Cash awaiting confirmation`, or `Order slip`; it must not be presented as a final paid receipt.

---

## 12. All Bills and Status Visibility

The All Bills page includes bills from shop computers, phones, tablets, and kiosks.

Display:

- Bill number, date, and time
- Shop
- Customer or Walk-in Customer
- Customer phone when available
- Bill amount, paid amount, and amount due
- In-person or delivery sale
- Billing source and device type
- Creator
- Cash collector
- Current cash holder
- Cash confirmer
- Payment method or split methods
- Payment-attempt summary
- Customer-payment status
- Cash-confirmation flag
- Worker/delivery settlement status
- Delivery outcome and delivery person
- Print status
- Return, exchange, void, and refund status
- Razorpay and bank-reconciliation status when authorized

Status families remain independent:

| Status family | Example values |
| --- | --- |
| Bill | Draft, Offline draft, Posted, Voided |
| Customer payment | Pending, Partially paid, Paid, Overpaid, Partially refunded, Refunded |
| Cash confirmation | Not applicable, Awaiting confirmation, Confirmed, Disputed, Reversed |
| Delivery | Unassigned, Assigned, Out for delivery, Delivered, Failed, Returned |
| Worker settlement | Not applicable, Pending, Partially settled, Settled, Shortage pending |
| Printing | Pending, Printing, Printed, Failed, Reprinted |
| Refund | Not requested, Initiated, Processing, Partially refunded, Refunded, Failed |
| Gateway reconciliation | Not applicable, Pending, Matched, Exception |
| Bank settlement | Not applicable, Expected, Transfer processed, Bank matched, Mismatch |

---

## 13. Returns, Refunds, Exchanges, and Voids

### 13.1 Returns and Exchanges

Returns and exchanges may support:

- In-person purchases
- Delivery purchases
- Unused goods
- Partially used goods

For a partially used product:

1. Select the original bill line.
2. Enter returned weight.
3. Calculate return value using the original recorded unit price and documented rounding rule.
4. Create a return or credit record.

For an exchange:

1. Create a return or credit record linked to the original bill.
2. Create a new replacement bill.
3. Apply the approved credit to the new bill.
4. Collect or refund the difference.

Do not modify the original bill to represent the replacement sale.

### 13.2 Electronic Refunds

- Refund to the original electronic payment where required and supported.
- Create a refund record before calling Razorpay.
- Do not mark it completed merely because the request was accepted.
- Update the final result from verified webhook/API information.
- Support partial refunds and multiple refund attempts without exceeding the refundable balance.

Internal UI states may include:

- Refund initiated
- Refund processing
- Partially refunded
- Refunded
- Reversed
- Refund failed

These internal states must be mapped to the definitive states returned by the selected Razorpay API; provider status and internal business status should both be retained.

### 13.3 Cash Refunds

- A cash refund creates a cash-out transaction from the actual drawer or cash holder.
- It must reference an open cash session when paid from a drawer.
- If sufficient cash is unavailable, the refund remains pending or uses another owner-approved method.
- Inventory return and cash refund are separate, idempotent actions.

### 13.4 Voiding Paid Bills

Voiding a paid bill does not erase its payment.

- Card or UPI requires a linked refund or reversal workflow.
- Cash in a drawer requires a cash-out transaction if returned to the customer.
- Cash still held by a worker requires a linked reversal or release of worker liability, based on what physically happened.
- Inventory is restored exactly once after the applicable physical-return rule.
- The original bill, payment attempts, allocations, and ledger history remain visible.
- The approving manager or owner and reason are recorded.
- The bill may remain `Voided with financial action pending` until required refunds or cash reversals complete.

---

## 14. Razorpay Processing and Bank Reconciliation

### 14.1 Payment Verification

- Create a unique internal payment attempt before contacting Razorpay.
- Retain Razorpay order, QR, payment, refund, and settlement identifiers as applicable.
- Verify client-return signatures where applicable.
- Verify webhook signatures using the raw request body.
- Store the Razorpay webhook event ID and process each event only once.
- Handle duplicate and out-of-order events.
- Do not trust client-side success alone.
- For a time-sensitive screen, the backend may fetch the payment/order status if the webhook has not yet arrived.
- Support late authorization or late success without attaching it to the wrong bill.
- Do not treat `Authorized` as paid; use the definitive successful/captured state for the selected product.

Manual electronic-payment status changes should not be part of normal operations. If reconciliation discovers a genuine external payment that was not linked, an owner or specifically authorized manager may create a documented reconciliation adjustment. This must preserve the provider's real status and must not fabricate a Razorpay success event.

### 14.2 Duplicate Electronic Payments

If multiple payment attempts succeed:

- Allocate only the amount due to the bill.
- Mark the additional amount as an overpayment or duplicate.
- Do not increase sales revenue.
- Notify an owner or manager.
- Refund or reallocate only through an authorized, audited workflow.

### 14.3 Razorpay Settlement and Bank Reconciliation

A successful customer payment and a bank deposit are separate events.

Track:

- Customer payment amount
- Payment method
- Razorpay fee
- Tax on fee
- Refunds
- Chargebacks or disputes
- Settlement batch ID
- Settlement period
- Expected net deposit
- Settlement processed date
- UTR or bank reference
- Actual bank credit
- Actual bank date
- Reconciliation status and difference

A Razorpay settlement event indicating a transfer was processed should move the record to `Transfer processed`, not immediately to `Bank matched`. Bank matching requires the actual bank credit or imported bank statement entry.

---

## 15. Offline and Failure Handling

### 15.1 Worker Phone Offline

A bill created offline remains an `Offline draft` with a client-generated synchronization ID.

Until it reaches the backend:

- It has no final bill number.
- It does not enter official sales totals.
- It does not trigger shop-computer printing.
- It does not permanently reduce inventory.
- It clearly displays `Not synchronized`.
- Cash reportedly collected offline remains pending local data and must not affect official balances.
- UPI cannot be treated as accepted or verified offline.

After reconnection, the backend:

1. Checks the synchronization ID for duplicates.
2. Creates the official bill only once.
3. Assigns the final bill number.
4. Creates related cash collection records if supplied.
5. Updates inventory exactly once.
6. Creates the shop print job.
7. Returns confirmation to the worker's device.

If stock or price changed while offline, the backend must return a clear conflict for authorized resolution rather than silently posting incorrect data.

### 15.2 Shop Computer or Printer Offline

- The posted bill remains stored in the backend.
- The print job remains pending.
- Printing resumes after reconnect.
- The owner or manager can retry safely.
- Printing failure never changes payment or inventory records.

### 15.3 Razorpay or Terminal Unavailable

- Card or UPI must not be marked successful.
- Show a clear pending, failed, or unknown state.
- Allow safe retry using a new payment attempt with idempotency protection.
- Do not charge the same attempt twice.
- If the final result is unknown, verify through the backend before asking the customer to pay again.
- Handle a late success as a real payment and detect any resulting overpayment.

---

## 16. Approvals and Audit Trail

Owner or manager permission is required for:

- Cash collection confirmation or dispute
- Refund or exchange approval
- Price override
- Discount above the allowed limit
- Bill voiding
- Inventory adjustment
- Cash-drawer adjustment
- Supplier-payment correction
- Delivery-settlement correction
- Shortage or excess write-off
- Linking an unmatched electronic payment
- Closed-session correction

For especially risky actions, the owner may enable a maker-checker rule so the person creating the correction cannot approve it.

The audit trail records:

- User and role
- Shop
- Action
- Related bill, payment attempt, collection, handover, refund, inventory record, trip, cash session, or settlement
- Previous and new business state where relevant
- Reason
- Device/session
- Date and time
- Approval user
- Reversal reference

Audit coverage includes:

- Bill creation and voiding
- Printing and reprinting
- Cash collection reporting and confirmation
- UPI/card payment attempts and verification
- Refunds and duplicate-payment resolution
- Returns and exchanges
- Inventory receipts, sales, transfers, openings, and adjustments
- Supplier payments
- Delivery assignments and outcomes
- Worker handovers and change cash
- Cash-drawer and bank-deposit movements
- Razorpay and bank reconciliation
- Role and permission changes

Owners see all activities. Managers see authorized operational activities for assigned shops. Workers see only their own permitted bills, deliveries, collections, and settlements.

---

## 17. Required Acceptance Scenarios

The system is not complete until these cases work without double counting:

1. A worker creates a bill, but the manager collects cash directly; the worker balance stays zero.
2. A delivery person collects cash, the manager confirms the payment, but the worker has not handed it over; the bill is paid and worker settlement remains pending.
3. A worker hands over only part of the cash; only the actual amount moves into the drawer and the remainder stays outstanding.
4. A worker accepts UPI at delivery; Razorpay verifies it, the bill becomes paid, and the worker cash ledger remains unchanged.
5. UPI fails, the customer retries, and only the successful attempt is allocated.
6. A timed-out attempt succeeds late after a retry also succeeds; sales count once and the extra payment is flagged for refund.
7. A bill is paid partly in cash and partly by UPI; each portion is independently recorded and the total determines payment status.
8. Change cash is issued, partially returned, and partially offset by collected COD cash without double settlement.
9. A worker creates the same offline bill sync request twice; only one official bill, inventory movement, and print job are created.
10. A printer is offline; the bill remains valid and prints once after reconnection.
11. A paid bill is voided; its refund/reversal, inventory restoration, and audit history occur exactly once.
12. Goods marked returned by a driver do not re-enter sellable inventory until physically received and inspected.
13. Cash arrives after drawer closure; it enters a new session or after-hours custody process, not the closed session.
14. The drawer lacks money for a cash refund; the system leaves it pending instead of creating impossible drawer cash.
15. Razorpay reports a settlement as processed, but the bank credit differs; the record stays unmatched until resolved.

---

## 18. Recommended Defaults for the First Version

To keep the first version controlled and understandable:

- Allow workers and delivery personnel to accept cash and bill-specific Razorpay UPI only; do not allow card payments for them.
- Use fixed-amount, bill-specific UPI payment attempts rather than a common static QR.
- Disable customer credit/pay-later initially.
- Disable employee-paid delivery expenses initially; add them later with approval and receipt evidence if needed.
- Use one physical cash drawer per shop initially, while keeping the data model capable of supporting more.
- Do not allow negative drawer balances or negative inventory without an explicit owner-approved exception.
- Derive bill payment status from confirmed allocations; do not provide a general-purpose `Mark paid` button.
- Require owner or manager confirmation for cash, while UPI/card confirmation remains provider-driven.
- Keep invoice, credit-note, refund, and tax rules configurable and have the final GST setup reviewed by the business's accountant before production use.

---

## 19. Razorpay Implementation Notes

The following official Razorpay behavior supports these requirements:

- Captured payments and paid orders are distinct from merely authorized payments: https://razorpay.com/docs/webhooks/payments/
- Webhooks can be duplicated and can arrive out of order; signatures and unique event IDs should be used: https://razorpay.com/docs/webhooks/best-practices/ and https://razorpay.com/docs/webhooks/validate-test/
- Razorpay supports UPI QR creation and real-time notifications; fixed-amount, single-payment QR codes can be used for bill-specific collection, subject to account enablement: https://razorpay.com/docs/payments/qr-codes/ and https://razorpay.com/docs/payments/qr-codes/create/
- Razorpay refund provider states include pending, processed, and failed: https://razorpay.com/docs/api/refunds/entity/
- Settlement events include fees, tax, and UTR data, but a processed transfer still needs bank-credit reconciliation: https://razorpay.com/docs/webhooks/settlements/
