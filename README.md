# BillMate

Simple GST billing and inventory for a single shop. React + Vite + Tailwind + Supabase.

## Setup

1. Create a new Supabase project.
2. In the SQL editor, run `supabase/migrations/0001_init.sql`.
3. Authentication > Users > add the owner (email + password).
   Then Authentication > Providers > Email > turn OFF "Allow new users to sign up".
4. `cp .env.example .env` and fill in the project URL and publishable key.
5. `npm install` then `npm run dev`.
6. Sign in, open Settings, fill in the shop details, then add products.

## How it works

- Every product has at least one variant row. Simple products use one hidden "Default" variant.
- Stock is an append-only ledger (`stock_ledger`); current levels come from the `stock_levels` view.
- `create_invoice`, `cancel_invoice` and `create_purchase` are Postgres functions, so invoice
  numbering, GST split, and stock changes happen in one transaction.
- Invoice lines snapshot name, HSN, price and tax, so later edits don't change old bills.
- Printing: 80 mm receipt or A4 invoice from the invoice page (browser print dialog).

## Not in v1

Returns/credit notes, supplier and customer ledgers, GST filing reports, barcode label printing,
offline mode, multiple users.

## Tests

```
npm test
```

- `tests/billing.test.ts`: unit tests for the GST/rounding calculator used by the billing screen.
- `tests/db.test.ts`: runs the real SQL migrations in an in-memory Postgres (PGlite) and tests
  invoice numbering, GST split, stock, cancellation, purchases and the udhaar ledger. It also checks
  that the client-side calculator matches the database function. No Supabase data is touched.
