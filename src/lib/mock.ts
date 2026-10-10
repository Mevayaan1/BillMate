// Preview-only fake backend (npm run dev:mock). Never used in production builds:
// `api.ts` only picks it when VITE_MOCK is set, so the bundler drops it otherwise.
import { calcTotals } from "./billing";
import type { Category, Invoice, InvoiceItem, Party, Payment, Product, Settings, Variant } from "./types";

const uid = () => Math.random().toString(36).slice(2, 10);
const daysAgo = (n: number, h = 11) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(h, 20, 0, 0);
  return d.toISOString();
};

const settings: Settings = {
  id: 1, shop_name: "Sharma General Store", address: "12 Main Bazaar, Jaipur, Rajasthan", phone: "98290 12345",
  gstin: "08ABCDE1234F1Z5", state_code: "08", logo_url: null, invoice_prefix: "INV", next_invoice_no: 6,
  prices_include_tax: true, gst_enabled: true, footer_note: "Thank you! Visit again.", setup_done: true,
};

const categories: Category[] = [
  { id: "c1", name: "Grocery" }, { id: "c2", name: "Clothing" }, { id: "c3", name: "Stationery" },
];

const v = (id: string, product_id: string, label: string, sale: number, cost: number, barcode: string | null, low = 5): Variant => ({
  id, product_id, label, sku: null, barcode, cost_price: cost, sale_price: sale, mrp: null, low_stock_limit: low, active: true,
});

const products: Product[] = [
  { id: "p1", name: "Basmati Rice 5kg", category_id: "c1", hsn: "1006", gst_rate: 5, unit: "pcs", has_variants: false, active: true, variants: [v("v1", "p1", "Default", 525, 460, "8901001")] },
  { id: "p2", name: "Notebook A4", category_id: "c3", hsn: "4820", gst_rate: 12, unit: "pcs", has_variants: false, active: true, variants: [v("v2", "p2", "Default", 56, 40, "8901002", 10)] },
  {
    id: "p3", name: "Cotton T-Shirt", category_id: "c2", hsn: "6109", gst_rate: 5, unit: "pcs", has_variants: true, active: true,
    variants: [v("v3", "p3", "M / Blue", 399, 250, "8901003"), v("v4", "p3", "L / Blue", 399, 250, "8901004"), v("v5", "p3", "XL / Black", 449, 290, "8901005")],
  },
  { id: "p4", name: "Sugar 1kg", category_id: "c1", hsn: "1701", gst_rate: 5, unit: "kg", has_variants: false, active: true, variants: [v("v6", "p4", "Default", 48, 42, "8901006", 10)] },
  { id: "p5", name: "Ball Pen (Blue)", category_id: "c3", hsn: "9608", gst_rate: 18, unit: "pcs", has_variants: false, active: true, variants: [v("v7", "p5", "Default", 10, 6, "8901007", 20)] },
];

const stock: Record<string, number> = { v1: 14, v2: 6, v3: 12, v4: 3, v5: 0, v6: 40, v7: 150 };

const parties: Party[] = [
  { id: "u1", type: "customer", name: "Ravi Kumar", phone: "9876543210", gstin: "", state_code: "08", address: "Vaishali Nagar" },
  { id: "u2", type: "customer", name: "Meena Textiles", phone: "9811122233", gstin: "27AAAPL1234C1ZV", state_code: "27", address: "Mumbai" },
  { id: "u3", type: "customer", name: "Suresh Verma", phone: "9922334455", gstin: "", state_code: "08", address: "" },
];

const invoices: Invoice[] = [];
const payments: Payment[] = [];

function seedInvoice(no: number, days: number, party: string | null, name: string, items: [string, number][], mode: Invoice["payment_mode"], paid?: number) {
  const lines = items.map(([vid, qty]) => {
    const p = products.find((x) => x.variants.some((y) => y.id === vid))!;
    const variant = p.variants.find((y) => y.id === vid)!;
    return { p, variant, qty };
  });
  const calc = calcTotals(lines.map((l) => ({ qty: l.qty, unitPrice: l.variant.sale_price, discount: 0, gstRate: l.p.gst_rate })), { gstEnabled: true, pricesIncludeTax: true });
  const id = "i" + no;
  const paidAmt = mode === "credit" ? paid ?? 0 : calc.grand;
  invoices.push({
    id, invoice_no: `INV-${String(no).padStart(5, "0")}`, date: daysAgo(days), party_id: party, customer_name: name, place_of_supply: "",
    taxable_total: calc.taxable, cgst_total: calc.cgst, sgst_total: calc.sgst, igst_total: 0, discount_total: 0, round_off: calc.roundOff,
    grand_total: calc.grand, paid: paidAmt, payment_mode: mode, status: "final", note: "",
    invoice_items: lines.map((l): InvoiceItem => ({
      id: uid(), name: l.p.has_variants ? `${l.p.name} (${l.variant.label})` : l.p.name, hsn: l.p.hsn, unit: l.p.unit, qty: l.qty,
      unit_price: l.variant.sale_price, discount: 0, gst_rate: l.p.gst_rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, line_total: l.qty * l.variant.sale_price,
    })),
  });
}
seedInvoice(1, 6, null, "", [["v1", 1], ["v6", 2]], "cash");
seedInvoice(2, 4, "u1", "Ravi Kumar", [["v3", 2]], "credit", 300);
seedInvoice(3, 2, "u3", "Suresh Verma", [["v1", 2], ["v2", 5]], "credit", 0);
seedInvoice(4, 1, null, "", [["v7", 10]], "upi");
seedInvoice(5, 0, "u1", "Ravi Kumar", [["v4", 1], ["v7", 4]], "cash");
payments.push({ id: "pay1", invoice_id: "i2", party_id: "u1", amount: 300, mode: "cash", date: daysAgo(4) });

const wait = <T,>(x: T) => new Promise<T>((r) => setTimeout(() => r(structuredClone(x)), 120));

export const mockApi = {
  getSettings: () => wait(settings),
  saveSettings: async (patch: Partial<Settings>) => { Object.assign(settings, patch); },
  getCategories: () => wait(categories),
  addCategory: async (name: string) => { const c = { id: uid(), name }; categories.push(c); return c; },
  getProducts: () => wait(products.filter((p) => p.active)),
  saveProduct: async (
    p: Omit<Product, "id" | "variants" | "active"> & { id?: string },
    variants: (Omit<Variant, "id" | "product_id" | "active"> & { id?: string })[],
  ) => {
    let prod = products.find((x) => x.id === p.id);
    if (!prod) { prod = { ...p, id: uid(), active: true, variants: [] } as Product; products.push(prod); }
    else Object.assign(prod, p);
    for (const x of variants) {
      const ex = prod.variants.find((y) => y.id === x.id);
      if (ex) Object.assign(ex, x);
      else { const nv = { ...x, id: uid(), product_id: prod.id, active: true } as Variant; prod.variants.push(nv); stock[nv.id] = 0; }
    }
    return prod.id;
  },
  archiveProduct: async (id: string) => { const p = products.find((x) => x.id === id); if (p) p.active = false; },
  getStock: () => wait(stock),
  adjustStock: async (variantId: string, qty: number) => { stock[variantId] = (stock[variantId] ?? 0) + qty; },
  getParties: () => wait(parties),
  addParty: async (p: Omit<Party, "id">) => { const np = { ...p, id: uid() }; parties.push(np); return np; },
  updateParty: async (id: string, p: Partial<Omit<Party, "id">>) => { Object.assign(parties.find((x) => x.id === id)!, p); },
  getBalances: async () => {
    const out: Record<string, number> = {};
    for (const i of invoices) if (i.party_id && i.status === "final") out[i.party_id] = (out[i.party_id] ?? 0) + i.grand_total - i.paid;
    return out;
  },
  getPartyInvoices: (id: string) => wait(invoices.filter((i) => i.party_id === id)),
  getPartyPayments: (id: string) => wait(payments.filter((p) => p.party_id === id)),
  recordPayment: async (partyId: string, amount: number, mode: string) => {
    let left = amount;
    for (const i of invoices.filter((x) => x.party_id === partyId && x.status === "final" && x.grand_total > x.paid)) {
      const take = Math.min(left, i.grand_total - i.paid);
      i.paid += take; left -= take;
      payments.unshift({ id: uid(), invoice_id: i.id, party_id: partyId, amount: take, mode, date: new Date().toISOString() });
      if (left <= 0) break;
    }
  },
  createInvoice: async (payload: any) => {
    const lines = payload.items.map((it: any) => {
      const p = products.find((x) => x.variants.some((y) => y.id === it.variant_id))!;
      return { p, variant: p.variants.find((y) => y.id === it.variant_id)!, ...it };
    });
    for (const l of lines) if ((stock[l.variant_id] ?? 0) < l.qty) throw new Error(`Insufficient stock for ${l.p.name}`);
    const calc = calcTotals(lines.map((l: any) => ({ qty: l.qty, unitPrice: l.unit_price, discount: l.discount, gstRate: l.p.gst_rate })), { gstEnabled: settings.gst_enabled, pricesIncludeTax: settings.prices_include_tax });
    const id = uid();
    const no = settings.next_invoice_no++;
    for (const l of lines) stock[l.variant_id] -= l.qty;
    const paid = payload.payment_mode === "credit" ? payload.paid ?? 0 : calc.grand;
    invoices.unshift({
      id, invoice_no: `INV-${String(no).padStart(5, "0")}`, date: new Date().toISOString(), party_id: payload.party_id ?? null, customer_name: payload.customer_name ?? "",
      place_of_supply: payload.place_of_supply ?? "", taxable_total: calc.taxable, cgst_total: calc.cgst, sgst_total: calc.sgst, igst_total: calc.igst,
      discount_total: calc.discount, round_off: calc.roundOff, grand_total: calc.grand, paid, payment_mode: payload.payment_mode, status: "final", note: "",
      invoice_items: lines.map((l: any): InvoiceItem => ({
        id: uid(), name: l.p.has_variants ? `${l.p.name} (${l.variant.label})` : l.p.name, hsn: l.p.hsn, unit: l.p.unit, qty: l.qty, unit_price: l.unit_price,
        discount: l.discount, gst_rate: l.p.gst_rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, line_total: l.qty * l.unit_price - l.discount,
      })),
    });
    return id;
  },
  cancelInvoice: async (id: string) => {
    const i = invoices.find((x) => x.id === id)!;
    i.status = "cancelled";
    for (const it of i.invoice_items ?? []) {
      const variant = products.flatMap((p) => p.variants).find((x) => it.name.startsWith(products.find((p) => p.id === x.product_id)!.name));
      if (variant) stock[variant.id] += it.qty;
    }
  },
  getInvoices: () => wait(invoices),
  getInvoice: (id: string) => wait(invoices.find((i) => i.id === id)!),
  createPurchase: async (payload: any) => { for (const it of payload.items) stock[it.variant_id] = (stock[it.variant_id] ?? 0) + it.qty; return uid(); },
};
