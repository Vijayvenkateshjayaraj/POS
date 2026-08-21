# POS, Inventory, Billing, Delivery, and Role-Based UI Requirements

## 1. Core Role-Based Access Requirement

The application interface must be based on the signed-in user’s role, regardless of whether the application is opened on a:

- Shop computer
- Mobile phone
- Tablet
- Other authorized device

The device must not determine the user’s permissions.

For example:

- An owner signing in on a phone or computer should see the Owner interface.
- A manager signing in on a phone or computer should see the Manager interface.
- A worker signing in on a phone or shop computer should see only the Billing and Delivery modules.
- Shop computers will usually be used by owners or managers, but the application must still verify the signed-in account before displaying features.

The user’s role must control:

- Dashboard
- Navigation menu
- Pages that can be opened
- Information that can be viewed
- Actions that can be performed
- Approval and settlement permissions
- Reports and financial information

Permissions must be enforced by the backend APIs as well as the user interface. Hiding a page or button is not sufficient security.

The interface should also be responsive so that the same role-based features work properly on computers, phones, and tablets.

The kiosk is an exception because it is a dedicated customer-facing device. It should use a restricted Kiosk mode that only provides customer ordering and payment functionality.

---

# 2. User Roles and Permissions

## 2.1 Owner

The owner should have access to every page and feature in the application from any authorized device.

The Owner dashboard should display:

- Number and value of sales
- Sales for today, this week, this month, and this year
- Cash sales
- UPI transactions
- Card transactions
- Current estimated cash-drawer balance
- Total number of bills
- In-person and delivery sales
- Current inventory value
- Low-stock products
- Out-of-stock products
- Supplier bills and outstanding balances
- Customer returns, refunds, and exchanges
- Assigned and pending deliveries
- Completed and failed deliveries
- Pending cash-on-delivery collections
- Amount currently held by each delivery person
- Pending delivery settlements
- Employee and delivery-person activities

The owner should be able to filter dashboard information by:

- Date
- Shop location
- Employee
- Payment method
- Billing source
- In-person or delivery purchase

## 2.2 Manager

The manager should have access to all operational pages from any authorized device.

The manager should be able to:

- Create and review bills
- Manage inventory
- Receive supplier stock
- Track supplier payments
- View the cash-drawer balance
- View low-stock and out-of-stock products
- Process returns, refunds, and exchanges
- Assign deliveries
- Issue change cash to delivery personnel
- Monitor delivery activities
- Verify cash received from workers and delivery personnel
- Complete delivery settlements
- View operational reports

## 2.3 Worker or Delivery Person

A worker or delivery person should only have access to:

- Billing
- Delivery

This restriction applies even when the worker signs in on a shop computer.

The worker should not be able to access:

- Complete inventory management
- Supplier purchases
- All business bills
- Owner or manager dashboards
- Business-wide financial reports
- Application settings
- Other employees’ settlements or activities

From the Billing page, the worker should be able to:

- Create cash bills
- View bills created by them
- View whether the related cash has been settled with the cashier

From the Delivery page, the worker should be able to:

- View deliveries assigned to them
- View customer and delivery information
- Mark delivery and customer-payment statuses
- View change cash received from the cashier
- View cash collected from customers
- View the amount currently owed to the shop
- View completed and pending settlements

## 2.4 Kiosk

The kiosk should operate using a restricted Kiosk mode.

The kiosk should only allow customers to:

- Browse products
- Add products to the cart
- Create an order
- Select card or UPI payment
- Complete payment through the attached Razorpay terminal
- Receive or print the bill

The kiosk must not provide access to internal pages such as inventory, reports, deliveries, supplier purchases, or all bills.

## 2.5 Permission Summary

| Feature | Owner | Manager | Worker/Delivery Person | Kiosk |
|---|---:|---:|---:|---:|
| Business dashboard | Yes | Operational dashboard | No | No |
| Billing | Yes | Yes | Yes | Self-service only |
| Cash billing | Yes | Yes | Yes | No |
| Card and UPI billing | Yes | Yes | No | Yes |
| Inventory management | Yes | Yes | No | No |
| Supplier stock receiving | Yes | Yes | No | No |
| Supplier payment tracking | Yes | Yes | No | No |
| All Bills | Yes | Yes | Own bills only | Current bill only |
| Returns and exchanges | Yes | Yes | No | No |
| Refund approval | Yes | Yes | No | No |
| Delivery assignment | Yes | Yes | No | No |
| Delivery activity | All employees | All employees | Own deliveries only | No |
| Cash settlement | Yes | Yes | View own settlement | No |
| Reports | All reports | Operational reports | No | No |
| Settings and user access | Yes | If permitted | No | No |

---

# 3. Billing

## 3.1 Kiosk Billing

Customers should be able to create their own orders and bills using the kiosk.

The kiosk should accept only:

- Credit or debit card
- UPI

The payment must be processed through the Razorpay payment terminal attached to the kiosk.

Cash payments must not be available at the kiosk.

The bill should be created only after the system receives a successful payment confirmation. Failed or cancelled payments should not be marked as paid.

## 3.2 Owner or Manager Billing

When an owner or manager creates a bill using the shop computer, the following payment methods should be available:

- Cash
- Credit or debit card
- UPI, including Google Pay

Card and UPI payments should be processed using the wireless Razorpay terminal available in the shop.

If an owner or manager signs in from another device, the UI should still follow their role. However, card and UPI options should only be enabled when that device can communicate with the appropriate payment terminal.

The system should record the payment result and prevent a failed card or UPI payment from being marked as paid.

## 3.3 Worker Billing

A worker should be able to create only cash bills, regardless of whether the worker signs in from a phone or computer.

Every worker-created bill should immediately appear in the owner’s or manager’s billing and cash-collection log.

The system should record:

- Bill number
- Bill amount
- Customer details
- Worker who created the bill
- Device used
- Date and time
- Cash-received status
- Cash-settlement status

After the worker gives the collected cash to the cashier, the owner or manager should:

1. Open the worker’s pending cash record.
2. Verify the cash received.
3. Mark the bill or group of bills as settled.

Customer payment and employee settlement must be tracked separately. A customer may have paid the worker even though the worker has not yet handed the money to the cashier.

---

# 4. Inventory Management

## 4.1 Whole-Bag and Retail Loose-Stock Inventory

The inventory system should manage both:

- Unopened whole bags
- Opened bags used for retail sales by weight

When a whole bag is opened:

1. The whole-bag quantity should be reduced.
2. The full weight of the opened bag should be added to loose-stock inventory.
3. Every retail sale should reduce the available loose-stock weight.

The system should maintain a history of:

- Bag opened
- Bag size
- Quantity transferred to loose stock
- User who opened the bag
- Date and time

## 4.2 Returned Stock

The system should allow authorized users to record stock returned by customers.

The return record should include:

- Original bill number
- Product
- Returned quantity or weight
- Reason for return
- Product condition
- User who processed the return
- Date and time
- Inventory decision

The inventory decision should be one of the following:

- Add back to sellable inventory
- Add to damaged or non-sellable inventory
- Discard
- Return to supplier

Only products that are suitable for resale should be added back to available inventory.

## 4.3 Supplier Stock-Receiving Page

The Inventory module should have a separate Supplier Stock Receiving page.

An owner or manager should be able to enter the supplier and bill information at the top of the page and add the delivered items as individual rows.

Each supplier bill should record:

- Supplier name
- Supplier bill number
- Bill date
- Stock-delivery date
- Product
- Package size or weight
- Number of bags or units received
- Purchase price
- Line total
- Tax or additional charges, when applicable
- Total supplier bill amount
- Amount paid
- Outstanding balance
- Payment due date
- Payment status

When adding an item, the user should be able to:

- Search the existing product list
- Select a matching product
- Enter the received quantity and purchase price
- Create a new product when no suitable product exists

Supplier payment statuses should include:

- Unpaid
- Partially paid
- Paid

Some supplier bills may be paid immediately, while others may be paid after several weeks or a month. The system should maintain the full payment history until the supplier bill is completely settled.

---

# 5. All Bills

The All Bills page should display every bill generated through:

- Shop computer
- Mobile phone
- Kiosk

The page should be accessible to owners and managers from any authorized device.

Each bill should include:

- Bill number
- Bill date and time
- Bill amount
- Shop location
- Customer type
- Customer name, when available
- Customer phone number, when available
- Purchase type: in-person or delivery
- Payment method: cash, UPI, or card
- Payment status
- Billing source: kiosk or signed-in user
- Device type: computer, phone, tablet, or kiosk
- User who created the bill
- Delivery person, when applicable
- Return status
- Refund status
- Exchange status
- Employee cash-settlement status, when applicable
- Delivery cash-settlement status, when applicable

Customer types should include:

- Walk-in customer
- Registered customer

Payment statuses should clearly distinguish between:

- Pending
- Paid
- Partially paid
- Payment failed
- Refunded
- Partially refunded

The original bill must never be deleted or overwritten. Returns, refunds, exchanges, and payment corrections should be stored as linked transactions so that the full history remains available.

---

# 6. Returns, Refunds, and Exchanges

Owners and managers should be able to process returns, refunds, and exchanges from any authorized device.

The process should support both:

- In-person purchases
- Delivery purchases

A customer may return:

- A completely unused product
- The remaining quantity of a partially used product

For a partially used product:

1. The user should select the item from the original bill.
2. The returned weight should be entered.
3. The system should calculate the return value using the price per kilogram recorded on the original bill.
4. The calculated value should be deducted from the replacement product’s price.

The system should handle the difference as follows:

- If both values are equal, no additional payment or refund is required.
- If the replacement product costs more, the customer should pay the difference.
- If the replacement product costs less, the customer should receive a refund or store credit, depending on the option selected by the owner or manager.

Example:

- Returned product value: ₹800
- Replacement product price: ₹1,000
- Amount payable by the customer: ₹200

The return or exchange should remain connected to the original bill.

For every return or exchange, the system should record:

- Original product and quantity
- Returned weight
- Calculated return value
- Replacement product
- Price difference
- Additional payment or refund
- Inventory treatment
- Reason
- User who processed it
- Date and time

Electronic refunds should be recorded against the original payment transaction. Cash refunds should be recorded as money removed from the cash drawer.

---

# 7. Delivery Management

## 7.1 Delivery Assignment

The Delivery module should have an assignment page where owners or managers can:

- View unassigned delivery bills
- Assign bills to a worker or delivery person
- Assign multiple bills to the same person
- Group bills into a delivery trip
- Reassign a delivery when necessary
- View the total value of assigned bills

Once assigned, the deliveries should immediately appear in the delivery person’s account, whether they are signed in on a phone or computer.

## 7.2 Delivery Information

Each delivery should include:

- Bill number
- Customer name
- Customer phone number
- Delivery address
- Bill amount
- Payment method
- Customer-payment status
- Assigned delivery person
- Delivery status
- Assigned date and time
- Delivered date and time
- Change cash issued
- Cash collected
- Settlement status
- Non-payment or failed-delivery reason

## 7.3 Delivery Person’s Actions

For each assigned delivery, the delivery person should be able to update the status as:

- Delivered and paid
- Delivered but not paid
- Delivery failed
- Customer unavailable
- Customer rejected the order
- Returned to shop

When the delivery person selects **Delivered and paid**:

- The customer-payment status should change to Paid.
- The bill amount should be added to the delivery person’s cash ledger.
- The amount should be included in the money the delivery person owes to the shop.
- The owner or manager should be able to see the update immediately.

When the delivery person selects **Delivered but not paid**:

- The bill must remain unpaid.
- The amount must not be added to the delivery person’s cash ledger.
- The owner or manager should be notified.
- The delivery person must enter a reason.

The delivery person’s wallet should be treated as a cash ledger showing money held on behalf of the shop. It should not be treated as a bank account or digital-payment wallet.

## 7.4 Change Cash Issued to Delivery Personnel

Before a delivery trip, the cashier may give the delivery person cash for providing change to customers.

The system should record:

- Amount of change cash issued
- Delivery person
- Cashier who issued it
- Related trip
- Date and time
- Settlement status

The change cash should be added to the delivery person’s cash responsibility.

The expected settlement should be calculated as:

> Expected settlement = Initial change cash + Total value of paid cash-on-delivery bills

Unpaid bills should not be included.

Example:

- Initial change cash: ₹500
- Paid cash-on-delivery bills: ₹4,000
- Unpaid bills: ₹1,000
- Expected settlement: ₹4,500

## 7.5 Delivery Cash Settlement

The delivery person should be allowed to settle the collected money:

- At the end of each delivery trip, or
- At the end of the working day

The settlement page should display:

- Delivery person
- Assigned trips
- Assigned bills
- Paid bills
- Unpaid bills
- Failed or returned deliveries
- Total value of paid cash bills
- Initial change cash
- Expected settlement amount
- Actual cash submitted
- Shortage or excess
- Settlement date and time
- Owner or manager who verified the money

The owner or manager should be able to:

- Settle an individual bill
- Settle an entire trip
- Settle all eligible bills for the day

The system must prevent the same bill or change amount from being settled more than once.

Delivery-related bills should distinguish between:

- Unpaid by customer
- Paid by customer but not settled with shop
- Fully settled with shop

---

# 8. Cash-Drawer Tracking

The system should track the estimated amount of cash available in the shop’s cash drawer.

The cash-drawer balance should consider:

- Opening cash balance
- Cash sales
- Cash received from workers
- Cash received from delivery personnel
- Change cash issued
- Customer cash refunds
- Supplier cash payments
- Other authorized cash additions or removals

Every cash movement should record:

- Amount
- Transaction type
- Related bill or settlement
- User
- Date and time
- Reason, when applicable

Only owners and managers should be able to verify or adjust the cash-drawer balance.

---

# 9. Activity and Audit Log

The system should maintain an audit log for all important activities, including:

- User sign-in
- Bill creation
- Payment confirmation
- Payment failure
- Inventory adjustment
- Opening a whole bag
- Supplier stock receiving
- Supplier payment
- Return, refund, or exchange
- Delivery assignment
- Delivery-status update
- Customer-payment update
- Change cash issuance
- Worker cash settlement
- Delivery cash settlement
- Cash-drawer adjustment
- Role or permission change

Each audit entry should record:

- User
- User role
- Action performed
- Related record
- Previous value, when applicable
- New value, when applicable
- Device type
- Shop location
- Date and time

Owners should be able to view all activities. Managers should be able to view operational activities according to their permissions. Workers should only be able to view their own bills, deliveries, and settlements.
