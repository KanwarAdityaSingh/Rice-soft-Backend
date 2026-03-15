# Sales Module – Comprehensive Test Report

**Date:** 2026-03-15  
**Tester:** Automated script (`src/scripts/test-sales-flow.ts`)  
**Credentials:** username `admin`, password `admin123`  
**API base:** `http://localhost:3000/api/v1`

---

## 1. Test Summary

| Step | API / Action | Result |
|------|--------------|--------|
| 1 | `POST /auth/loginUser` | ✅ 200 – token received |
| 2 | `GET /products`, `/vendors/getAllVendors`, `/inventory/finished-goods`, `/transporters`, `/vehicles` | ✅ 200 – data loaded |
| 3 | `POST /sales-saudas` (draft) | ✅ 201 – Sales Sauda created |
| 4 | `POST /sales-saudas/:id/finalize` | ✅ 200 – Order SO-001 |
| 5 | `POST /invoice-dispatches` | ✅ 201 – Invoice Dispatch created |
| 6 | `POST /invoice-dispatches/:id/confirm` | ✅ 200 – FGI deducted |
| 7 | `POST /invoice-dispatches/:id/e-invoice` | ✅ 200 – stub IRN |
| 8 | `POST /invoice-dispatches/:id/e-way-bill` | ✅ 200 – stub EWB |
| 9 | `GET /inventory-ledger?source_type=sales_dispatch` | ✅ 200 – 1 entry |
| 10 | `POST /credit-notes` | ✅ 201 – Credit Note created |
| 11 | `POST /credit-notes/:id/confirm` | ✅ 200 – inventory restored by 5 kg |

**Overall:** All steps passed. Sales flow from Sales Sauda → Invoice Dispatch → Confirm (inventory deduction) → E-Invoice stub → E-Way Bill stub → Inventory Ledger → Credit Note → Confirm (inventory restore) is working end-to-end.

---

## 2. Existing Data Used

- **Products:** 5
- **Vendors (customers):** 5 (used first vendor with type seller/both, or first vendor)
- **Finished goods inventory rows:** 11 (8 rows for the product used)
- **Transporters:** 1
- **Vehicles:** 5

**Product used:** `product_id = d5485f29-c91e-4f9c-97bc-d7eed8215392`  
**Customer (party):** ADHRA AMRIT AGRO PRODUCTS LLP (from linked Sales Sauda vendor)  
**Available FGI for product before test:** 2,555 kg

---

## 3. What Was Tested (APIs and Behaviour)

### 3.1 Authentication
- Login with `admin` / `admin123` returns JWT in `data.data.token`.
- All subsequent requests use `Authorization: Bearer <token>`.

### 3.2 Sales Sauda
- **Create (draft):** `POST /sales-saudas` with `customer_id`, `sauda_date`, `notes`, `lines[]` (product_id, quantity, quantity_unit, rate). Returns 201 and sauda with `status: draft`.
- **Finalize:** `POST /sales-saudas/:id/finalize` moves sauda to `order` and assigns `order_number` (e.g. SO-001). No inventory change.

### 3.3 Invoice Dispatch
- **Create:** `POST /invoice-dispatches` with `sales_sauda_id`, `internal_invoice_number`, `dispatch_date`, optional `transporter_id`, `vehicle_id`, `distance_km`, `route_description`. Lines come from the Sales Sauda. Party name is resolved from the Sales Sauda’s customer (vendor). Returns 201, status `draft`.
- **Confirm:** `POST /invoice-dispatches/:id/confirm`:
  - Allocates FGI (FIFO) for each dispatch line.
  - Deducts finished goods inventory.
  - Writes `inventory_ledger` rows with `source_type = sales_dispatch`, `quantity_change` negative, `reference_type = invoice_dispatch`.
  - FGI before: 2,555 kg → after: 2,545 kg (reduced by 10 kg).

### 3.4 E-Invoice (placeholder)
- **Endpoint:** `POST /invoice-dispatches/:id/e-invoice` (no body).
- **Behaviour:** Stub generates and stores a placeholder IRN (e.g. `IRN-STUB-<dispatchId>-<timestamp>`). No external API call. Idempotent (existing e_invoice for dispatch is reused).

### 3.5 E-Way Bill (placeholder)
- **Endpoint:** `POST /invoice-dispatches/:id/e-way-bill` with body: `vehicle_number`, `distance_km`, `route`, `transporter_id`.
- **Behaviour:** Stub generates and stores a placeholder e-way bill number. No external API call.

### 3.6 Inventory Ledger
- **GET /inventory-ledger** with `source_type=sales_dispatch` returns ledger rows for sales dispatches.
- **Sample entry:** `quantity_change: -10`, `stock_before: 180`, `stock_after: 170`, `reference_type: invoice_dispatch`, `reference_id: <dispatch_id>`, `batch_id`, `packaging_id` present. One row per allocation (e.g. one line in this test).

### 3.7 Credit Note
- **Create:** `POST /credit-notes` with `invoice_dispatch_id`, `sales_sauda_id`, `credit_note_number`, `credit_note_date`, `reason`, `lines[]` (invoice_dispatch_line_id, product_id, quantity_returned). Returns 201.
- **Confirm:** `POST /credit-notes/:id/confirm`:
  - Uses allocation info where possible to restore FGI to same batch/packaging; otherwise restores to same product.
  - Writes inventory ledger with positive quantity (credit/return).
  - Test returned 5 kg; inventory increased by 5 kg.

---

## 4. The Story (Narrative of the Test Run)

1. **Login**  
   User `admin` logged in and received a JWT.

2. **Data**  
   The system had 5 products, 5 vendors, 11 finished goods inventory rows (8 for the chosen product), 1 transporter, and 5 vehicles. The test picked the first product and the first suitable customer vendor. For that product, total available FGI was **2,555 kg**.

3. **Sale (order)**  
   - A **Sales Sauda** was created in **draft** with one line: **10 kg** of that product at **₹50/kg**.  
   - The sauda was **finalized**, turning it into a **Sales Order** with number **SO-001**.

4. **Dispatch and inventory**  
   - An **Invoice Dispatch** was created against that order, with internal invoice number like `INV-TEST-<timestamp>`, **dispatch date** = today, **transporter** and **vehicle** from existing data, **distance 100 km**, route “Test route: Warehouse to Customer”.  
   - **Party name** on the dispatch was **ADHRA AMRIT AGRO PRODUCTS LLP** (customer from the Sales Sauda).  
   - **Confirm** was called: the system allocated 10 kg from FGI (FIFO), deducted it, and wrote one **inventory ledger** entry (e.g. stock_before 180 → stock_after 170 for that batch/packaging).  
   - **Finished goods inventory** for the product went from **2,555 kg → 2,545 kg** (reduced by **10 kg**).

5. **E-Invoice and E-Way Bill (placeholders)**  
   - **E-Invoice** stub was called; it generated and stored a placeholder **IRN** (e.g. `IRN-STUB-8437714f-1773592652808`).  
   - **E-Way Bill** stub was called with vehicle number, distance, route, transporter; it generated and stored a placeholder **e-way bill number** (e.g. `EWB-1773592652811-5rqwal`).  
   No external APIs were called.

6. **Return (credit note)**  
   - A **Credit Note** was created against the same Invoice Dispatch for a **5 kg return** on the first dispatch line, with reason “Test return from automated script”.  
   - **Credit Note confirm** was called: the system **restored 5 kg** to FGI and wrote the corresponding **inventory ledger** entry.  
   Net effect: **10 kg sold, 5 kg returned** → net inventory change for that product: **−5 kg** (2,555 → 2,545 after dispatch, then +5 after credit note = 2,550 kg).

7. **Transport**  
   The test used the **first transporter** and **first vehicle** from the database for the Invoice Dispatch and E-Way Bill stub. So transporters and vehicles were included in the flow; real E-Way Bill integration would use these for the actual API payload.

---

## 5. What Is Required for Real External Integration

These are the gaps to fill when you add real external APIs (e.g. MasterIndia or similar):

### 5.1 E-Invoice (GSP/IRN)
- **Credentials / config:** GSTIN, GSP credentials (or direct NIC/portal credentials as per your provider), environment (sandbox/production).
- **Inputs to send:** Invoice payload (seller, buyer, line items, taxes, totals) built from Invoice Dispatch + Sales Sauda + product/vendor master. E-Invoice schema (e.g. IRN request JSON) as per government/GSP spec.
- **Outputs to persist:** IRN, signed QR code / payload, acknowledgment from portal. Already have `e_invoices` table and stub; replace stub with real API call and map response to `e_invoices` (and optionally attach PDF/JSON to document storage if you have it).
- **Idempotency:** Current design: one e_invoice per invoice_dispatch; reuse if already generated. Keep this behaviour when integrating.

### 5.2 E-Way Bill
- **Credentials / config:** E-Way Bill portal credentials (or GSP that provides EWB), environment.
- **Inputs:** Vehicle number, transporter ID (or transporter GSTIN), distance, route, invoice/IRN details, consignor/consignee, goods description, HSN, quantity, value. Build from Invoice Dispatch + E-Invoice (IRN) + transporter/vehicle.
- **Outputs:** EWB number, validity, optional QR. Already have `e_way_bills` table and stub; replace stub with real API and persist EWB number and validity.
- **Optional:** E-Way Bill for **credit note / return** movement (separate API flow when you support return e-way).

### 5.3 E-Credit Note (if required)
- **When:** If you need to report credit notes to the e-invoice/e-way ecosystem.
- **Inputs:** Credit note payload (linked to original IRN, reverse charge/tax details). Build from Credit Note + original Invoice Dispatch + E-Invoice.
- **Outputs:** Credit note reference number / acknowledgment. May require a new table or extension of `credit_notes` to store external reference.

### 5.4 Not Covered by This Test
- **E-Invoice / E-Way cancellation or amendment** (e.g. cancel EWB, amend e-invoice) – implement when business requires.
- **Out-of-system returns** (returns without a prior dispatch line) – current Credit Note flow is tied to `invoice_dispatch_line_id`; extend if you need “manual” returns.
- **Multi-vehicle / part-load e-way** – current design is one vehicle per dispatch; extend if you need multiple vehicles per invoice.

---

## 6. Files and Artifacts

- **Test script:** `src/scripts/test-sales-flow.ts`  
  Run: `npx ts-node src/scripts/test-sales-flow.ts` (server must be running on port 3000; override with `API_BASE` if needed).
- **Report (text):** `test-sales-flow-report.txt` – same run log as above, written after a successful run.
- **Migrations:** All sales-related migrations (092–097) are applied; no migration run was needed during this test.

---

## 7. Conclusion

The sales flow is working end-to-end: **Sales Sauda (draft → order) → Invoice Dispatch (create → confirm) → inventory deduction and ledger → E-Invoice stub → E-Way Bill stub → Credit Note (create → confirm) → inventory restore.**  
Placeholder implementations for E-Invoice and E-Way Bill are included in the test; real integration only requires replacing those stubs with actual API calls and the config/credentials listed in Section 5.
