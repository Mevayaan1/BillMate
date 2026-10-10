import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Minus, Plus, Search, ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { money, num } from "../lib/money";
import { calcTotals } from "../lib/billing";
import type { CartLine } from "../lib/types";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import FormField from "../components/FormField";
import NativeSelect from "../components/NativeSelect";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import CustomerDialog from "../components/CustomerDialog";

type Mode = "cash" | "upi" | "card" | "credit";
const MODES: { id: Mode; label: string }[] = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "card", label: "Card" },
  { id: "credit", label: "Udhaar" },
];

export default function Billing() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: api.getProducts });
  const { data: stock = {} } = useQuery({ queryKey: ["stock"], queryFn: api.getStock });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });
  const { data: parties = [] } = useQuery({ queryKey: ["parties"], queryFn: api.getParties });
  const { data: balances = {} } = useQuery({ queryKey: ["balances"], queryFn: api.getBalances });

  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [partyId, setPartyId] = useState("");
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [customer, setCustomer] = useState("");
  const [pos, setPos] = useState("");
  const [mode, setMode] = useState<Mode>("cash");
  const [paid, setPaid] = useState("");
  const [openEdit, setOpenEdit] = useState<string | null>(null);
  const party = parties.find((p) => p.id === partyId);

  const sellable = useMemo(
    () =>
      products.flatMap((p) =>
        p.variants
          .filter((v) => v.active)
          .map((v) => ({
            variantId: v.id,
            name: p.has_variants ? `${p.name} (${v.label})` : p.name,
            barcode: v.barcode ?? "",
            sku: v.sku ?? "",
            price: v.sale_price,
            gstRate: p.gst_rate,
            stock: stock[v.id] ?? 0,
          })),
      ),
    [products, stock],
  );

  const q = search.trim().toLowerCase();
  const matches = useMemo(
    () => (q ? sellable.filter((s) => s.name.toLowerCase().includes(q) || s.barcode.toLowerCase() === q || s.sku.toLowerCase() === q).slice(0, 12) : []),
    [q, sellable],
  );

  function add(s: (typeof sellable)[number]) {
    if (s.stock <= 0) {
      toast.error(`${s.name} is out of stock`);
      return;
    }
    setCart((c) => {
      const i = c.findIndex((l) => l.variantId === s.variantId);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { variantId: s.variantId, name: s.name, qty: 1, unitPrice: s.price, discount: 0, gstRate: s.gstRate, stock: s.stock }];
    });
    setSearch("");
    searchRef.current?.focus();
  }

  function onSearchKey(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    const exact = sellable.find((s) => s.barcode.toLowerCase() === q || s.sku.toLowerCase() === q);
    if (exact) add(exact);
    else if (matches.length === 1) add(matches[0]);
  }

  const patch = (id: string, p: Partial<CartLine>) => setCart((c) => c.map((l) => (l.variantId === id ? { ...l, ...p } : l)));

  const posCode = (party ? party.state_code : pos).trim();
  const interState = Boolean(settings?.gst_enabled && settings.state_code && posCode && posCode !== settings.state_code);
  const totals = useMemo(
    () => calcTotals(cart, { gstEnabled: settings?.gst_enabled ?? false, pricesIncludeTax: settings?.prices_include_tax ?? true, interState }),
    [cart, settings, interState],
  );

  const create = useMutation({
    mutationFn: () =>
      api.createInvoice({
        party_id: partyId || undefined,
        customer_name: party ? party.name : customer.trim(),
        place_of_supply: posCode,
        payment_mode: mode,
        paid: mode === "credit" ? num(paid) : undefined,
        items: cart.map((l) => ({ variant_id: l.variantId, qty: l.qty, unit_price: l.unitPrice, discount: l.discount })),
      }),
    onSuccess: (id) => {
      toast.success("Bill saved");
      for (const k of ["stock", "invoices", "settings", "balances", "party-invoices"]) qc.invalidateQueries({ queryKey: [k] });
      nav(`/invoices/${id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const overStock = cart.some((l) => l.qty > l.stock);
  const needsCustomer = mode === "credit" && !partyId;
  const creditPaid = num(paid);
  const blocked = cart.length === 0 || overStock || needsCustomer || (mode === "credit" && creditPaid > totals.grand);
  const itemCount = cart.reduce((s, l) => s + l.qty, 0);
  const due = mode === "credit" ? Math.max(0, totals.grand - creditPaid) : 0;

  const reason = overStock ? "Some items exceed available stock" : needsCustomer ? "Choose a customer for udhaar" : "";

  return (
    <div className="pb-28 lg:pb-0">
      <div className="flex items-center gap-2 mb-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back"><Link to="/"><ArrowLeft className="size-5" /></Link></Button>
        <h1 className="text-2xl font-semibold tracking-tight">New bill</h1>
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-5 items-start">
        {/* Left: find items and cart */}
        <div className="space-y-4 min-w-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              autoFocus
              className="pl-9 h-12 text-base"
              placeholder="Scan barcode or search item"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onSearchKey}
            />
          </div>

          {q ? (
            <div className="space-y-1.5">
              {matches.length === 0 && <p className="text-sm text-muted-foreground px-1">No items match "{search}".</p>}
              {matches.map((s) => (
                <button
                  key={s.variantId}
                  onClick={() => add(s)}
                  disabled={s.stock <= 0}
                  className="w-full flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-left active:bg-accent disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block font-medium truncate">{s.name}</span>
                    <span className="block text-xs text-muted-foreground">{s.stock > 0 ? `${s.stock} in stock` : "Out of stock"}</span>
                  </span>
                  <span className="font-semibold tabular-nums">{money(s.price)}</span>
                </button>
              ))}
            </div>
          ) : null}

          <section className={cart.length === 0 && !q && sellable.length > 0 ? "hidden" : ""}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-medium">Items in bill {cart.length > 0 && <span className="text-muted-foreground">({itemCount})</span>}</h2>
              {cart.length > 0 && (
                <button className="text-sm text-muted-foreground" onClick={() => setCart([])}>Clear</button>
              )}
            </div>
            {cart.length === 0 ? (
              !q && sellable.length > 0 ? null : <EmptyState icon={ShoppingCart} title="No items yet" text="Add products first, then scan or search to bill them." />
            ) : (
              <div className="space-y-2">
                {cart.map((l) => {
                  const over = l.qty > l.stock;
                  const editing = openEdit === l.variantId;
                  return (
                    <Card key={l.variantId} className={`p-3 ${over ? "border-destructive" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium leading-snug">{l.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {money(l.unitPrice)} each{l.discount > 0 && ` · − ${money(l.discount)}`}
                          </div>
                        </div>
                        <button aria-label={`Remove ${l.name}`} className="p-1 -m-1 text-muted-foreground" onClick={() => setCart((c) => c.filter((x) => x.variantId !== l.variantId))}>
                          <X className="size-5" />
                        </button>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="outline" aria-label="Decrease quantity" onClick={() => patch(l.variantId, { qty: Math.max(1, l.qty - 1) })}><Minus className="size-4" /></Button>
                          <Input
                            type="number"
                            inputMode="decimal"
                            aria-label="Quantity"
                            className="w-16 text-center px-1"
                            value={l.qty}
                            onChange={(e) => patch(l.variantId, { qty: Math.max(0, num(e.target.value)) })}
                          />
                          <Button size="icon" variant="outline" aria-label="Increase quantity" onClick={() => patch(l.variantId, { qty: l.qty + 1 })}><Plus className="size-4" /></Button>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold tabular-nums">{money(l.qty * l.unitPrice - l.discount)}</div>
                          <button className="text-xs text-primary" onClick={() => setOpenEdit(editing ? null : l.variantId)}>
                            {editing ? "Done" : "Edit price / discount"}
                          </button>
                        </div>
                      </div>

                      {over && <p className="mt-2 text-xs text-destructive">Only {l.stock} in stock</p>}

                      {editing && (
                        <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3">
                          <FormField label="Price (₹)"><Input type="number" inputMode="decimal" value={l.unitPrice} onChange={(e) => patch(l.variantId, { unitPrice: num(e.target.value) })} /></FormField>
                          <FormField label="Discount (₹)"><Input type="number" inputMode="decimal" value={l.discount} onChange={(e) => patch(l.variantId, { discount: num(e.target.value) })} /></FormField>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {!q && sellable.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">{cart.length === 0 ? "Tap an item to add it" : "Add more"}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {sellable.slice(0, cart.length === 0 ? 9 : 6).map((s) => (
                  <button
                    key={s.variantId}
                    onClick={() => add(s)}
                    disabled={s.stock <= 0}
                    className="rounded-xl border bg-card p-3 text-left active:bg-accent disabled:opacity-50 min-h-[68px]"
                  >
                    <span className="block text-sm font-medium leading-snug line-clamp-2">{s.name}</span>
                    <span className="block text-xs text-muted-foreground mt-1">{s.stock <= 0 ? "Out of stock" : money(s.price)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: customer, payment, totals */}
        <div className="space-y-4 lg:sticky lg:top-6">
          <Card className="p-4 space-y-4">
            <FormField label="Customer">
              <div className="flex gap-2">
                <div className="flex-1 min-w-0">
                  <NativeSelect value={partyId} onChange={(e) => setPartyId(e.target.value)}>
                    <option value="">Walk-in customer</option>
                    {parties.filter((p) => p.type !== "supplier").map((p) => (
                      <option key={p.id} value={p.id}>{p.name}{p.phone ? ` · ${p.phone}` : ""}</option>
                    ))}
                  </NativeSelect>
                </div>
                <Button type="button" size="icon" variant="outline" aria-label="Add customer" onClick={() => setAddingCustomer(true)}><Plus className="size-4" /></Button>
              </div>
              {party && (balances[party.id] ?? 0) > 0 && (
                <div className="mt-1"><StatusBadge tone="warning">Previous due {money(balances[party.id])}</StatusBadge></div>
              )}
            </FormField>

            {!party && (
              <FormField label="Name on bill (optional)">
                <Input value={customer} onChange={(e) => setCustomer(e.target.value)} />
              </FormField>
            )}
            {settings?.gst_enabled && !party && (
              <FormField label="Customer state code" hint="Only if the customer is from another state">
                <Input maxLength={2} inputMode="numeric" placeholder={settings.state_code || "e.g. 27"} value={pos} onChange={(e) => setPos(e.target.value)} />
              </FormField>
            )}

            <FormField label="Payment">
              <div className="grid grid-cols-4 gap-1.5">
                {MODES.map((m) => (
                  <Button key={m.id} type="button" size="sm" variant={mode === m.id ? "default" : "outline"} onClick={() => setMode(m.id)} className="px-1">
                    {m.label}
                  </Button>
                ))}
              </div>
            </FormField>

            {mode === "credit" && (
              <FormField label="Paid now (₹)" hint={`Balance ${money(due)} goes on udhaar`} error={creditPaid > totals.grand ? "More than the bill total" : undefined}>
                <Input type="number" inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} />
              </FormField>
            )}
          </Card>

          <Card className="p-4 space-y-1.5 text-sm">
            {settings?.gst_enabled && (
              <>
                <Row k="Taxable value" v={money(totals.taxable)} />
                {interState ? <Row k="IGST" v={money(totals.igst)} /> : (<><Row k="CGST" v={money(totals.cgst)} /><Row k="SGST" v={money(totals.sgst)} /></>)}
              </>
            )}
            {totals.discount > 0 && <Row k="Discount" v={`− ${money(totals.discount)}`} />}
            {totals.roundOff !== 0 && <Row k="Round off" v={money(totals.roundOff)} />}
            <div className="flex justify-between items-baseline pt-2 border-t text-lg font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{money(totals.grand)}</span>
            </div>
            <div className="hidden lg:block pt-3">
              {reason && <p className="text-xs text-destructive mb-2">{reason}</p>}
              <Button className="w-full" size="lg" disabled={blocked || create.isPending} onClick={() => create.mutate()}>
                {create.isPending ? "Saving…" : "Save & print"}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Phone: sticky total + save */}
      <div
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-card px-4 pt-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        {reason && <p className="text-xs text-destructive mb-1.5">{reason}</p>}
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{itemCount} item{itemCount === 1 ? "" : "s"}</div>
            <div className="text-xl font-bold tabular-nums leading-tight">{money(totals.grand)}</div>
          </div>
          <Button className="flex-1" size="lg" disabled={blocked || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Saving…" : "Save & print"}
          </Button>
        </div>
      </div>

      <CustomerDialog open={addingCustomer} onOpenChange={setAddingCustomer} onSaved={(p) => setPartyId(p.id)} />
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between text-muted-foreground"><span>{k}</span><span className="tabular-nums">{v}</span></div>
);
