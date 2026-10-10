import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { calcTotals } from "../src/lib/billing";

// Runs the real migrations against a throwaway in-memory Postgres. Nothing here touches Supabase.
const mig = (f: string) => readFileSync(path.join(__dirname, "../supabase/migrations", f), "utf8");

let db: PGlite;

// Starting Postgres is slow, so do it once and wipe the data between tests.
beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role authenticated;");
  // pgcrypto is only needed on Supabase; PG13+ has gen_random_uuid() built in.
  await db.exec(mig("0001_init.sql").replace(/create extension if not exists pgcrypto;/i, ""));
  await db.exec(mig("0002_customer_ledger.sql"));
}, 120_000);

beforeEach(async () => {
  await db.exec(`
    truncate payments, invoice_items, invoices, purchase_items, purchases, stock_ledger,
             variants, products, categories, parties, settings restart identity cascade;
    insert into settings (id, shop_name, state_code, gst_enabled, prices_include_tax, invoice_prefix)
      values (1, 'Test Shop', '08', true, true, 'INV');
  `);
});

async function product(opts: { name?: string; gst?: number; price?: number; stock?: number; variantLabel?: string; hasVariants?: boolean } = {}) {
  const p = await db.query<{ id: string }>(
    `insert into products (name, gst_rate, has_variants) values ($1,$2,$3) returning id`,
    [opts.name ?? "Widget", opts.gst ?? 5, opts.hasVariants ?? false],
  );
  const v = await db.query<{ id: string }>(
    `insert into variants (product_id, label, sale_price) values ($1,$2,$3) returning id`,
    [p.rows[0].id, opts.variantLabel ?? "Default", opts.price ?? 105],
  );
  const id = v.rows[0].id;
  if (opts.stock) await db.query(`insert into stock_ledger (variant_id, qty, reason) values ($1,$2,'opening')`, [id, opts.stock]);
  return id;
}

async function party(name = "Ravi", state = "08") {
  const r = await db.query<{ id: string }>(`insert into parties (name, state_code) values ($1,$2) returning id`, [name, state]);
  return r.rows[0].id;
}

async function stockOf(variantId: string) {
  const r = await db.query<{ qty: string }>(`select qty from stock_levels where variant_id=$1`, [variantId]);
  return Number(r.rows[0].qty);
}

async function invoice(payload: Record<string, unknown>) {
  const r = await db.query<{ create_invoice: string }>(`select create_invoice($1::jsonb)`, [JSON.stringify(payload)]);
  const id = r.rows[0].create_invoice;
  const inv = await db.query<Record<string, any>>(`select * from invoices where id=$1`, [id]);
  return inv.rows[0];
}

const line = (variant_id: string, qty = 1, unit_price = 105, discount = 0) => ({ variant_id, qty, unit_price, discount });

describe("create_invoice", () => {
  it("allocates sequential invoice numbers", async () => {
    const v = await product({ stock: 10 });
    const a = await invoice({ items: [line(v)] });
    const b = await invoice({ items: [line(v)] });
    expect([a.invoice_no, b.invoice_no]).toEqual(["INV-00001", "INV-00002"]);
  });

  it("computes inclusive GST with a CGST/SGST split", async () => {
    const v = await product({ stock: 5, gst: 5 });
    const inv = await invoice({ items: [line(v, 1, 105)] });
    expect(Number(inv.taxable_total)).toBe(100);
    expect(Number(inv.cgst_total)).toBe(2.5);
    expect(Number(inv.sgst_total)).toBe(2.5);
    expect(Number(inv.igst_total)).toBe(0);
    expect(Number(inv.grand_total)).toBe(105);
  });

  it("uses IGST when the customer is in another state", async () => {
    const v = await product({ stock: 5, gst: 18 });
    const inv = await invoice({ place_of_supply: "27", items: [line(v, 1, 118)] });
    expect(Number(inv.igst_total)).toBe(18);
    expect(Number(inv.cgst_total)).toBe(0);
  });

  it("adds tax on top when prices exclude GST", async () => {
    await db.query(`update settings set prices_include_tax=false`);
    const v = await product({ stock: 5, gst: 18 });
    const inv = await invoice({ items: [line(v, 2, 100)] });
    expect(Number(inv.taxable_total)).toBe(200);
    expect(Number(inv.grand_total)).toBe(236);
  });

  it("charges no tax when GST is switched off", async () => {
    await db.query(`update settings set gst_enabled=false`);
    const v = await product({ stock: 5, gst: 18 });
    const inv = await invoice({ items: [line(v, 1, 100)] });
    expect(Number(inv.grand_total)).toBe(100);
    expect(Number(inv.cgst_total) + Number(inv.sgst_total) + Number(inv.igst_total)).toBe(0);
  });

  it("rounds the total and records the round-off", async () => {
    const v = await product({ stock: 5, gst: 0 });
    const inv = await invoice({ items: [line(v, 1, 99.6)] });
    expect(Number(inv.grand_total)).toBe(100);
    expect(Number(inv.round_off)).toBeCloseTo(0.4, 2);
  });

  it("reduces stock when a bill is saved", async () => {
    const v = await product({ stock: 10 });
    await invoice({ items: [line(v, 3)] });
    expect(await stockOf(v)).toBe(7);
  });

  it("rejects a sale that exceeds stock and leaves nothing behind", async () => {
    const v = await product({ stock: 2 });
    await expect(invoice({ items: [line(v, 3)] })).rejects.toThrow(/Insufficient stock/);
    expect(await stockOf(v)).toBe(2);
    const n = await db.query<{ c: string }>(`select count(*) c from invoices`);
    expect(Number(n.rows[0].c)).toBe(0);
    const s = await db.query<{ next_invoice_no: string }>(`select next_invoice_no from settings`);
    expect(Number(s.rows[0].next_invoice_no)).toBe(1); // number not burned
  });

  it("rejects an empty invoice", async () => {
    await expect(invoice({ items: [] })).rejects.toThrow(/no items/);
  });

  it("snapshots product name, HSN and price onto invoice lines", async () => {
    const v = await product({ name: "Shirt", stock: 5, hasVariants: true, variantLabel: "M / Red" });
    const inv = await invoice({ items: [line(v, 1, 105)] });
    await db.query(`update products set name='Renamed'`);
    const items = await db.query<Record<string, any>>(`select * from invoice_items where invoice_id=$1`, [inv.id]);
    expect(items.rows[0].name).toBe("Shirt (M / Red)");
    expect(Number(items.rows[0].unit_price)).toBe(105);
  });

  it("marks cash/UPI sales fully paid", async () => {
    const v = await product({ stock: 5 });
    const inv = await invoice({ payment_mode: "upi", items: [line(v)] });
    expect(Number(inv.paid)).toBe(Number(inv.grand_total));
  });

  it("records only the amount paid for a credit sale", async () => {
    const v = await product({ stock: 5 });
    const inv = await invoice({ payment_mode: "credit", paid: 40, items: [line(v)] });
    expect(Number(inv.paid)).toBe(40);
    expect(Number(inv.grand_total) - Number(inv.paid)).toBe(65);
  });

  it("matches the client-side calcTotals preview", async () => {
    const v1 = await product({ name: "A", stock: 50, gst: 5 });
    const v2 = await product({ name: "B", stock: 50, gst: 18 });
    const v3 = await product({ name: "C", stock: 50, gst: 12 });
    const cases = [
      { lines: [[v1, 3, 52.5, 0, 5]], inter: false },
      { lines: [[v1, 1, 99.99, 5, 5], [v2, 2, 33.33, 0, 18]], inter: false },
      { lines: [[v2, 7, 17.9, 3.5, 18], [v3, 4, 249, 10, 12]], inter: true },
      { lines: [[v3, 1, 1, 0, 12]], inter: false },
    ] as const;
    for (const incl of [true, false]) {
      await db.query(`update settings set prices_include_tax=$1`, [incl]);
      for (const c of cases) {
        const inv = await invoice({
          place_of_supply: c.inter ? "27" : "",
          items: c.lines.map(([id, q, p, d]) => line(id, q, p, d)),
        });
        const t = calcTotals(
          c.lines.map(([, qty, unitPrice, discount, gstRate]) => ({ qty, unitPrice, discount, gstRate })),
          { gstEnabled: true, pricesIncludeTax: incl, interState: c.inter },
        );
        expect(Number(inv.grand_total), `grand (incl=${incl})`).toBe(t.grand);
        expect(Number(inv.taxable_total), "taxable").toBeCloseTo(t.taxable, 2);
        expect(Number(inv.cgst_total), "cgst").toBeCloseTo(t.cgst, 2);
        expect(Number(inv.sgst_total), "sgst").toBeCloseTo(t.sgst, 2);
        expect(Number(inv.igst_total), "igst").toBeCloseTo(t.igst, 2);
      }
    }
  });
});

describe("cancel_invoice", () => {
  it("restores stock and marks the invoice cancelled", async () => {
    const v = await product({ stock: 10 });
    const inv = await invoice({ items: [line(v, 4)] });
    expect(await stockOf(v)).toBe(6);
    await db.query(`select cancel_invoice($1)`, [inv.id]);
    expect(await stockOf(v)).toBe(10);
    const r = await db.query<{ status: string }>(`select status from invoices where id=$1`, [inv.id]);
    expect(r.rows[0].status).toBe("cancelled");
  });

  it("refuses to cancel twice", async () => {
    const v = await product({ stock: 10 });
    const inv = await invoice({ items: [line(v)] });
    await db.query(`select cancel_invoice($1)`, [inv.id]);
    await expect(db.query(`select cancel_invoice($1)`, [inv.id])).rejects.toThrow(/already cancelled/);
    expect(await stockOf(v)).toBe(10); // not restored twice
  });
});

describe("create_purchase", () => {
  it("adds stock, totals the bill and updates cost price", async () => {
    const v = await product({ stock: 0 });
    await db.query(`select create_purchase($1::jsonb)`, [
      JSON.stringify({ bill_ref: "S-1", items: [{ variant_id: v, qty: 12, cost_price: 40 }] }),
    ]);
    expect(await stockOf(v)).toBe(12);
    const p = await db.query<{ total: string }>(`select total from purchases`);
    expect(Number(p.rows[0].total)).toBe(480);
    const c = await db.query<{ cost_price: string }>(`select cost_price from variants where id=$1`, [v]);
    expect(Number(c.rows[0].cost_price)).toBe(40);
  });

  it("rejects an empty purchase", async () => {
    await expect(db.query(`select create_purchase($1::jsonb)`, [JSON.stringify({ items: [] })])).rejects.toThrow(/no items/);
  });
});

describe("customer ledger (record_payment)", () => {
  const due = async (partyId: string) => {
    const r = await db.query<{ d: string }>(
      `select coalesce(sum(grand_total - paid),0) d from invoices where party_id=$1 and status='final'`,
      [partyId],
    );
    return Number(r.rows[0].d);
  };

  it("settles the oldest bills first", async () => {
    const v = await product({ stock: 20, gst: 0 });
    const c = await party();
    const a = await invoice({ party_id: c, payment_mode: "credit", paid: 0, items: [line(v, 1, 100)] });
    const b = await invoice({ party_id: c, payment_mode: "credit", paid: 0, items: [line(v, 1, 200)] });
    expect(await due(c)).toBe(300);

    await db.query(`select record_payment($1, 150, 'cash')`, [c]);
    const rows = await db.query<{ invoice_no: string; paid: string }>(`select invoice_no, paid from invoices order by invoice_no`);
    expect(Number(rows.rows[0].paid)).toBe(100); // oldest fully paid
    expect(Number(rows.rows[1].paid)).toBe(50); // remainder to the next
    expect(await due(c)).toBe(150);
    expect(a.invoice_no < b.invoice_no).toBe(true);
  });

  it("logs each allocation in payments", async () => {
    const v = await product({ stock: 20, gst: 0 });
    const c = await party();
    await invoice({ party_id: c, payment_mode: "credit", paid: 0, items: [line(v, 1, 100)] });
    await invoice({ party_id: c, payment_mode: "credit", paid: 0, items: [line(v, 1, 200)] });
    await db.query(`select record_payment($1, 300, 'upi')`, [c]);
    const p = await db.query<{ amount: string; mode: string }>(`select amount, mode from payments where party_id=$1 order by amount`, [c]);
    expect(p.rows.map((r) => Number(r.amount))).toEqual([100, 200]);
    expect(p.rows.every((r) => r.mode === "upi")).toBe(true);
    expect(await due(c)).toBe(0);
  });

  it("rejects an amount larger than the balance", async () => {
    const v = await product({ stock: 5, gst: 0 });
    const c = await party();
    await invoice({ party_id: c, payment_mode: "credit", paid: 0, items: [line(v, 1, 100)] });
    await expect(db.query(`select record_payment($1, 101, 'cash')`, [c])).rejects.toThrow(/exceeds outstanding/);
    expect(await due(c)).toBe(100);
  });

  it("rejects zero or negative amounts", async () => {
    const c = await party();
    await expect(db.query(`select record_payment($1, 0, 'cash')`, [c])).rejects.toThrow(/positive/);
    await expect(db.query(`select record_payment($1, -5, 'cash')`, [c])).rejects.toThrow(/positive/);
  });

  it("ignores cancelled invoices", async () => {
    const v = await product({ stock: 5, gst: 0 });
    const c = await party();
    const a = await invoice({ party_id: c, payment_mode: "credit", paid: 0, items: [line(v, 1, 100)] });
    await invoice({ party_id: c, payment_mode: "credit", paid: 0, items: [line(v, 1, 50)] });
    await db.query(`select cancel_invoice($1)`, [a.id]);
    expect(await due(c)).toBe(50);
    await expect(db.query(`select record_payment($1, 100, 'cash')`, [c])).rejects.toThrow(/exceeds outstanding/);
  });

  it("keeps customers separate", async () => {
    const v = await product({ stock: 5, gst: 0 });
    const c1 = await party("A");
    const c2 = await party("B");
    await invoice({ party_id: c1, payment_mode: "credit", paid: 0, items: [line(v, 1, 100)] });
    await invoice({ party_id: c2, payment_mode: "credit", paid: 0, items: [line(v, 1, 70)] });
    await db.query(`select record_payment($1, 100, 'cash')`, [c1]);
    expect(await due(c1)).toBe(0);
    expect(await due(c2)).toBe(70);
  });
});
