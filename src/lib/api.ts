import { supabase } from "./supabase";
import { mockApi } from "./mock";
import type { Category, Invoice, Party, Payment, Product, Settings, Variant } from "./types";

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

const realApi = {
  async getSettings(): Promise<Settings> {
    return check(await supabase.from("settings").select("*").eq("id", 1).single());
  },
  async saveSettings(patch: Partial<Settings>) {
    check(await supabase.from("settings").update(patch).eq("id", 1).select());
  },

  async getCategories(): Promise<Category[]> {
    return check(await supabase.from("categories").select("*").order("name"));
  },
  async addCategory(name: string): Promise<Category> {
    return check(await supabase.from("categories").insert({ name }).select().single());
  },

  async getProducts(): Promise<Product[]> {
    return check(
      await supabase.from("products").select("*, variants(*)").eq("active", true).order("name"),
    );
  },
  async saveProduct(
    p: Omit<Product, "id" | "variants" | "active"> & { id?: string },
    variants: (Omit<Variant, "id" | "product_id" | "active"> & { id?: string })[],
  ) {
    const { id, ...fields } = p;
    const prod = id
      ? check(await supabase.from("products").update(fields).eq("id", id).select().single())
      : check(await supabase.from("products").insert(fields).select().single());
    const productId = (prod as unknown as { id: string }).id;
    for (const v of variants) {
      const row = { ...v, product_id: productId, sku: v.sku || null, barcode: v.barcode || null };
      const res = v.id
        ? await supabase.from("variants").update(row).eq("id", v.id)
        : await supabase.from("variants").insert(row);
      if (res.error) throw new Error(res.error.message);
    }
    return productId;
  },
  async archiveProduct(id: string) {
    check(await supabase.from("products").update({ active: false }).eq("id", id).select());
  },

  async getStock(): Promise<Record<string, number>> {
    const rows = check(await supabase.from("stock_levels").select("*")) as { variant_id: string; qty: number }[];
    return Object.fromEntries(rows.map((r) => [r.variant_id, Number(r.qty)]));
  },
  async adjustStock(variantId: string, qty: number, note: string) {
    check(
      await supabase
        .from("stock_ledger")
        .insert({ variant_id: variantId, qty, reason: "adjustment", note })
        .select(),
    );
  },

  async getParties(): Promise<Party[]> {
    return check(await supabase.from("parties").select("*").order("name"));
  },
  async addParty(p: Omit<Party, "id">): Promise<Party> {
    return check(await supabase.from("parties").insert(p).select().single());
  },
  async updateParty(id: string, p: Partial<Omit<Party, "id">>) {
    check(await supabase.from("parties").update(p).eq("id", id).select());
  },
  /** Outstanding udhaar per party id, from final invoices only. */
  async getBalances(): Promise<Record<string, number>> {
    const rows = check(
      await supabase.from("invoices").select("party_id, grand_total, paid").eq("status", "final").not("party_id", "is", null),
    ) as { party_id: string; grand_total: number; paid: number }[];
    const out: Record<string, number> = {};
    for (const r of rows) out[r.party_id] = (out[r.party_id] ?? 0) + (Number(r.grand_total) - Number(r.paid));
    return out;
  },
  async getPartyInvoices(partyId: string): Promise<Invoice[]> {
    return check(await supabase.from("invoices").select("*").eq("party_id", partyId).order("date", { ascending: false }));
  },
  async getPartyPayments(partyId: string): Promise<Payment[]> {
    return check(await supabase.from("payments").select("*").eq("party_id", partyId).order("date", { ascending: false }));
  },
  async recordPayment(partyId: string, amount: number, mode: string) {
    const { error } = await supabase.rpc("record_payment", { p_party: partyId, p_amount: amount, p_mode: mode });
    if (error) throw new Error(error.message);
  },

  async createInvoice(payload: unknown): Promise<string> {
    return check(await supabase.rpc("create_invoice", { payload }));
  },
  async cancelInvoice(id: string) {
    const { error } = await supabase.rpc("cancel_invoice", { inv: id });
    if (error) throw new Error(error.message);
  },
  async getInvoices(limit = 200): Promise<Invoice[]> {
    return check(
      await supabase.from("invoices").select("*").order("date", { ascending: false }).limit(limit),
    );
  },
  async getInvoice(id: string): Promise<Invoice> {
    return check(await supabase.from("invoices").select("*, invoice_items(*)").eq("id", id).single());
  },

  async createPurchase(payload: unknown): Promise<string> {
    return check(await supabase.rpc("create_purchase", { payload }));
  },
};

// Preview mode (npm run dev:mock) swaps in fake data; the constant makes the bundler drop it from real builds.
export const api: typeof realApi = import.meta.env.VITE_MOCK ? (mockApi as unknown as typeof realApi) : realApi;
