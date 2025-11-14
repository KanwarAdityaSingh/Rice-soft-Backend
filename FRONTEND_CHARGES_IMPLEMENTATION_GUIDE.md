# Frontend Changes Required for Charges Implementation

## ✅ Backend Implementation Status

**YES, all charges and calculations are fully implemented in the backend:**

### 1. Purchase Amount Calculation (Automatic)
The backend automatically calculates purchase amounts using the following formula:

```
Step 1: Base Amount = Sum of all inward slip lot amounts (received_weight × rate)
Step 2: Amount After Discount = Base Amount - Cash Discount (fixed amount from sauda)
Step 3: Amount With Commission = Amount After Discount + (Amount After Discount × Broker Commission %)
Step 4: Amount With Transportation = Amount With Commission + Transportation Cost (only for 'xgodown' sauda type)
Step 5: Final Amount = Amount With Transportation + (Amount With Transportation × IGST %)
```

**Location:** `src/utils/purchase-calculations.ts`

### 2. Payment Advice Charges (Flexible)
- Charges are stored in `payment_advice_charges` table
- Each charge has: `charge_name`, `charge_value`, `charge_type`
- Net Payable = Payment Advice Amount - Sum of all charges
- Charges are automatically calculated and returned in API responses

**Location:** `src/dao/payment-advice-charge.dao.ts`

---

## 📋 Required Frontend Changes

### 1. Purchase Creation/Display

#### A. Show Calculation Breakdown
When displaying or creating a purchase, show the calculation breakdown:

```typescript
// Example UI Structure:
Purchase Amount Breakdown:
├─ Base Amount (from Inward Slip Lots): ₹X,XX,XXX
├─ Cash Discount: -₹XX,XXX
├─ Amount After Discount: ₹X,XX,XXX
├─ Broker Commission (X%): +₹X,XXX
├─ Amount With Commission: ₹X,XX,XXX
├─ Transportation Cost: +₹XX,XXX (only if sauda_type = 'xgodown')
├─ Amount With Transportation: ₹X,XX,XXX
├─ IGST (X%): +₹X,XXX
└─ Final Total Amount: ₹X,XX,XXX
```

**API Endpoint:** `GET /api/v1/purchases/:id`
- The response includes `total_amount` (already calculated)
- You can also call the calculation utility if needed

#### B. Display Sauda Details
Show relevant sauda fields that affect calculations:
- `cash_discount` (amount, not percentage)
- `broker_commission` (percentage)
- `transportation_cost` (only for 'xgodown' type)
- `sauda_type` ('xgodown' or 'for')

**API Endpoint:** `GET /api/v1/saudas/:id`

---

### 2. Payment Advice Creation/Display

#### A. Display Charges Section
Show all charges with ability to add/remove:

```typescript
// Example UI Structure:
Payment Advice Details:
├─ Amount: ₹X,XX,XXX
├─ Charges:
│  ├─ CD 2.0%: ₹X,XXX
│  ├─ GADI DALA PAID: ₹XXX
│  ├─ RTGS Charges: ₹XXX
│  ├─ KANTA CHARGES: ₹XXX
│  └─ [Add Charge Button]
└─ Net Payable: ₹X,XX,XXX (Amount - Total Charges)
```

**API Endpoints:**
- `GET /api/v1/payment-advices/:id` - Returns charges array and net_payable
- `POST /api/v1/payment-advices/:id/charges` - Add a charge
- `DELETE /api/v1/payment-advices/:id/charges/:chargeId` - Remove a charge

#### B. Add/Edit Charges Form
Create a form to add charges:

```typescript
interface ChargeForm {
  charge_name: string;      // e.g., "CD 2.0%", "RTGS Charges"
  charge_value: number;     // Amount in ₹
  charge_type?: 'fixed' | 'percentage';  // Optional
}
```

**API Endpoint:** `POST /api/v1/payment-advices/:id/charges`
```json
{
  "charge_name": "CD 2.0%",
  "charge_value": 5000,
  "charge_type": "fixed"
}
```

#### C. Real-time Net Payable Calculation
- When charges are added/removed, automatically recalculate `net_payable`
- Display updated `net_payable` immediately
- Backend automatically calculates: `net_payable = amount - sum(charges)`

**API Endpoint:** `GET /api/v1/payment-advices/:id/net-payable`
- Returns current net payable amount

---

### 3. UI Components to Create

#### Component 1: Purchase Amount Breakdown Card
```tsx
<PurchaseAmountBreakdown
  baseAmount={purchase.baseAmount}
  cashDiscount={sauda.cash_discount}
  brokerCommission={sauda.broker_commission}
  transportationCost={sauda.transportation_cost}
  igstPercentage={purchase.igst_percentage}
  finalAmount={purchase.total_amount}
/>
```

#### Component 2: Payment Advice Charges Manager
```tsx
<PaymentAdviceCharges
  paymentAdviceId={paymentAdvice.id}
  amount={paymentAdvice.amount}
  charges={paymentAdvice.charges}
  netPayable={paymentAdvice.net_payable}
  onAddCharge={(charge) => addCharge(charge)}
  onRemoveCharge={(chargeId) => removeCharge(chargeId)}
/>
```

#### Component 3: Charge Form Modal
```tsx
<ChargeFormModal
  open={isOpen}
  onClose={() => setIsOpen(false)}
  onSubmit={(charge) => {
    // POST /api/v1/payment-advices/:id/charges
    addCharge(charge);
  }}
/>
```

---

### 4. API Integration Points

#### Purchase Flow:
1. **Get Purchase with Calculation:**
   ```typescript
   GET /api/v1/purchases/:id
   // Response includes: total_amount (already calculated)
   ```

2. **Get Sauda Details:**
   ```typescript
   GET /api/v1/saudas/:id
   // Response includes: cash_discount, broker_commission, transportation_cost, sauda_type
   ```

#### Payment Advice Flow:
1. **Get Payment Advice with Charges:**
   ```typescript
   GET /api/v1/payment-advices/:id
   // Response includes:
   // - amount: number
   // - charges: Array<{id, charge_name, charge_value, charge_type}>
   // - net_payable: number (automatically calculated)
   ```

2. **Add Charge:**
   ```typescript
   POST /api/v1/payment-advices/:id/charges
   Body: { charge_name: string, charge_value: number, charge_type?: string }
   ```

3. **Remove Charge:**
   ```typescript
   DELETE /api/v1/payment-advices/:id/charges/:chargeId
   ```

4. **Get Net Payable:**
   ```typescript
   GET /api/v1/payment-advices/:id/net-payable
   // Returns: { net_payable: number }
   ```

---

### 5. Key Points for Frontend

#### ✅ What Backend Handles Automatically:
- Purchase amount calculation (all steps)
- Net payable calculation (amount - charges)
- Recalculation when inward slip passes are added/removed
- Recalculation when charges are added/removed

#### 📝 What Frontend Needs to Handle:
- Display calculation breakdown (read-only, for transparency)
- UI for adding/removing charges
- Real-time display of net payable updates
- Form validation for charge values
- Show/hide transportation cost based on sauda_type

#### 🎨 UI/UX Recommendations:
1. **Calculation Breakdown:**
   - Show as collapsible accordion or expandable section
   - Use color coding: green for additions, red for subtractions
   - Show percentages clearly (e.g., "Broker Commission (2.5%)")

2. **Charges Management:**
   - List charges in a table with edit/delete actions
   - Show running total of charges
   - Highlight net payable prominently
   - Allow bulk import of common charges

3. **Validation:**
   - Ensure charge_value is positive number
   - Warn if net_payable becomes negative
   - Validate charge_name is not empty

---

### 6. Example API Response Structure

#### Purchase Response:
```json
{
  "id": "uuid",
  "total_amount": 342887.21,
  "total_weight": 7450,
  "igst_amount": 6062.83,
  "igst_percentage": 1.8,
  "sauda_id": "uuid"
}
```

#### Payment Advice Response:
```json
{
  "id": "uuid",
  "amount": 342887.21,
  "charges": [
    {
      "id": "uuid",
      "charge_name": "CD 2.0%",
      "charge_value": 6857.74,
      "charge_type": "fixed"
    },
    {
      "id": "uuid",
      "charge_name": "RTGS Charges",
      "charge_value": 200,
      "charge_type": "fixed"
    }
  ],
  "net_payable": 335829.47
}
```

---

## 🚀 Quick Start Checklist

- [ ] Create Purchase Amount Breakdown component
- [ ] Create Payment Advice Charges Manager component
- [ ] Create Charge Form Modal component
- [ ] Integrate charge add/remove API calls
- [ ] Display net_payable in payment advice views
- [ ] Add validation for charge inputs
- [ ] Show calculation breakdown in purchase details
- [ ] Handle real-time updates when charges change
- [ ] Add loading states for API calls
- [ ] Add error handling for charge operations

---

## 📚 Additional Notes

1. **Cash Discount:** Now stored as a fixed amount (not percentage) in the database
2. **Transportation Cost:** Only applies to 'xgodown' type saudas
3. **Broker Commission:** Applied as a percentage on the amount after cash discount
4. **IGST:** Applied on the final amount (after all other adjustments)
5. **Charges:** All charges are subtracted from payment advice amount to get net payable

All calculations are handled server-side, so the frontend only needs to display the results and provide UI for managing charges.

