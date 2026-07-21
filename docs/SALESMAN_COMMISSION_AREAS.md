# Salesman Commission + Assigned Areas (Frontend Integration)

Phase 1: commission types + areas on salesman master; snapshot on sales sauda.  
Phase 2: commission ledger on dispatch/credit-note confirm; report + approve/pay APIs.

## Commission types

`GET /api/v1/salesmen/commission-types`

## Salesman master

Create/update accepts:

- `commission_types`: multi-select of the 5 codes (no rates on master)
- `assigned_areas`: replace-set of `{ state, district, city, territory }`
- `allocated_sales_party_ids`: replace-set of party UUIDs

Get-by-id returns `assigned_areas` + `customer_allocations`.

## Sales sauda attach

Only for `movement_type: sale`. Snapshot:

- `salesman_commission_type`
- `salesman_commission_config` (shape depends on type)
- `salesman_commission_preview` (computed, not stored)

Forbidden on `godown_transfer`.

### Config shapes

| Type | config |
|------|--------|
| `per_kg` | `{ "rate_per_kg": 0.2 }` |
| `percent_of_sale` | `{ "percent": 1 }` |
| `fixed_per_transaction` | `{ "amount": 500 }` |
| `by_rice_quality` | `{ "rates": [{ "rice_type": "basmati", "rate_per_kg": 0.6 }] }` |
| `by_customer` | `{ "basis": "per_kg"|"percent_of_sale", "value": 0.4 }` |

## Phase 2 — Ledger (automatic)

| Event | Effect |
|-------|--------|
| Invoice dispatch confirm (sale + snapshot) | `accrual`, status `pending` |
| Credit note confirm | `reversal` (negative), status `pending` |
| `fixed_per_transaction` | Once per sauda (first confirm); no auto reverse on return |
| Godown transfer | No entries |

### Approve / pay

```
GET  /api/v1/salesmen/commission-entries?salesman_id=&status=&from=&to=
GET  /api/v1/salesmen/commission-entries/:id
POST /api/v1/salesmen/commission-entries/:id/approve
POST /api/v1/salesmen/commission-entries/:id/mark-paid
```

Flow: `pending` → `approved` → `paid` (mark-paid allowed from pending too).

## Phase 2 — Reports

| Report | Endpoint | Query |
|--------|----------|-------|
| Monthly | `GET /salesmen/reports/monthly` | `salesman_id`, `from`, `to` |
| Returns | `GET /salesmen/reports/returns` | `salesman_id`, `from`, `to` |
| Commission | `GET /salesmen/reports/commission` | `salesman_id`, `status`, `from`, `to`, `view=transaction|monthly` |
| Outstanding | `GET /salesmen/reports/outstanding` | `salesman_id` |

Outstanding v1: `due_date = dispatch_date + payment_terms`; full invoice amount; ageing buckets `current`, `1-30`, `31-60`, `61-90`, `90+`.

## Migrations

1. `185_salesman_commission_and_areas.sql`
2. `186_salesman_commission_entries.sql`