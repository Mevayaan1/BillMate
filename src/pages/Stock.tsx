import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { money, num } from "../lib/money";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import PageHeader from "../components/PageHeader";
import FormField from "../components/FormField";
import NativeSelect from "../components/NativeSelect";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import ListRow from "../components/ListRow";

interface Line { variantId: string; name: string; qty: string; cost: string }

export default function Stock() {
  const qc = useQueryClient();
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: api.getProducts });
  const { data: stock = {} } = useQuery({ queryKey: ["stock"], queryFn: api.getStock });

  const rows = useMemo(
    () =>
      products.flatMap((p) =>
        p.variants.filter((v) => v.active).map((v) => ({
          id: v.id,
          name: p.has_variants ? `${p.name} (${v.label})` : p.name,
          unit: p.unit,
          cost: v.cost_price,
          limit: v.low_stock_limit,
          qty: stock[v.id] ?? 0,
        })),
      ),
    [products, stock],
  );

  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [pick, setPick] = useState("");
  const [billRef, setBillRef] = useState("");
  const [adjId, setAdjId] = useState("");
  const [adjQty, setAdjQty] = useState("");
  const [adjNote, setAdjNote] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["stock"] });

  const purchase = useMutation({
    mutationFn: () =>
      api.createPurchase({
        bill_ref: billRef,
        items: lines.map((l) => ({ variant_id: l.variantId, qty: num(l.qty), cost_price: num(l.cost) })),
      }),
    onSuccess: () => {
      toast.success("Stock added");
      setLines([]);
      setBillRef("");
      refresh();
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const adjust = useMutation({
    mutationFn: () => api.adjustStock(adjId, num(adjQty), adjNote),
    onSuccess: () => { toast.success("Stock updated"); setAdjQty(""); setAdjNote(""); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  function addLine(id: string) {
    const r = rows.find((x) => x.id === id);
    if (!r || lines.some((l) => l.variantId === r.id)) return;
    setLines([...lines, { variantId: r.id, name: r.name, qty: "", cost: String(r.cost) }]);
    setPick("");
  }

  const q = search.trim().toLowerCase();
  const shown = rows.filter((r) => !q || r.name.toLowerCase().includes(q));
  const low = rows.filter((r) => r.qty <= r.limit).sort((a, b) => a.qty - b.qty);
  const tone = (r: { qty: number; limit: number }) => (r.qty <= 0 ? "danger" : r.qty <= r.limit ? "warning" : "success");
  const purchaseTotal = lines.reduce((s, l) => s + num(l.qty) * num(l.cost), 0);
  const adjRow = rows.find((r) => r.id === adjId);

  return (
    <div>
      <PageHeader title="Stock" subtitle={`${rows.length} item${rows.length === 1 ? "" : "s"} · ${low.length} running low`} />

      <Tabs defaultValue="levels">
        <TabsList className="w-full mb-4 h-auto">
          <TabsTrigger value="levels" className="flex-1 py-2">Levels</TabsTrigger>
          <TabsTrigger value="low" className="flex-1 py-2">Low{low.length > 0 && ` (${low.length})`}</TabsTrigger>
          <TabsTrigger value="purchase" className="flex-1 py-2">Add stock</TabsTrigger>
          <TabsTrigger value="adjust" className="flex-1 py-2">Adjust</TabsTrigger>
        </TabsList>

        <TabsContent value="levels" className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search items" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {shown.length === 0 ? (
            <EmptyState icon={Boxes} title="No items" text="Add products first, then manage their stock here." />
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {shown.map((r) => (
                <ListRow key={r.id} title={r.name} right={`${r.qty} ${r.unit}`} rightSub={<StatusBadge tone={tone(r)}>{r.qty <= 0 ? "Out of stock" : r.qty <= r.limit ? "Low" : "In stock"}</StatusBadge>} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="low" className="space-y-2">
          {low.length === 0 ? (
            <EmptyState icon={Boxes} title="Nothing is running low" text="You'll see items here when they fall to their alert level." />
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {low.map((r) => (
                <ListRow key={r.id} title={r.name} subtitle={`Alert at ${r.limit}`} right={`${r.qty} ${r.unit}`} rightSub={<StatusBadge tone={tone(r)}>{r.qty <= 0 ? "Out of stock" : "Low"}</StatusBadge>} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="purchase" className="space-y-4 max-w-2xl">
          <FormField label="Add an item">
            <NativeSelect value={pick} onChange={(e) => addLine(e.target.value)}>
              <option value="">Choose a product…</option>
              {rows.map((r) => <option key={r.id} value={r.id} disabled={lines.some((l) => l.variantId === r.id)}>{r.name}</option>)}
            </NativeSelect>
          </FormField>

          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">Choose the products you received, then enter quantity and cost.</p>
          ) : (
            <div className="space-y-2">
              {lines.map((l, i) => (
                <Card key={l.variantId} className="p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-medium text-sm">{l.name}</span>
                    <button aria-label={`Remove ${l.name}`} className="text-muted-foreground" onClick={() => setLines(lines.filter((_, j) => j !== i))}><X className="size-5" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Quantity"><Input type="number" inputMode="decimal" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} /></FormField>
                    <FormField label="Cost each (₹)"><Input type="number" inputMode="decimal" value={l.cost} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, cost: e.target.value } : x)))} /></FormField>
                  </div>
                </Card>
              ))}
              <FormField label="Supplier bill or note (optional)"><Input value={billRef} onChange={(e) => setBillRef(e.target.value)} /></FormField>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Purchase total</span>
                <span className="font-semibold tabular-nums">{money(purchaseTotal)}</span>
              </div>
              <Button size="lg" className="w-full" onClick={() => purchase.mutate()} disabled={purchase.isPending || lines.some((l) => num(l.qty) <= 0)}>
                <Plus className="size-4" /> {purchase.isPending ? "Saving…" : "Add to stock"}
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="adjust" className="space-y-4 max-w-md">
          <p className="text-sm text-muted-foreground">Use a positive number to add (opening stock, found items) and a negative one to remove (damage, loss).</p>
          <FormField label="Product">
            <NativeSelect value={adjId} onChange={(e) => setAdjId(e.target.value)}>
              <option value="">Choose a product…</option>
              {rows.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.qty})</option>)}
            </NativeSelect>
          </FormField>
          <FormField label="Change in quantity" hint={adjRow && num(adjQty) !== 0 ? `New stock: ${adjRow.qty + num(adjQty)} ${adjRow.unit}` : "e.g. 10 or -2"}>
            <Input type="number" inputMode="decimal" value={adjQty} onChange={(e) => setAdjQty(e.target.value)} />
          </FormField>
          <FormField label="Reason (optional)"><Input value={adjNote} onChange={(e) => setAdjNote(e.target.value)} /></FormField>
          <Button size="lg" className="w-full" onClick={() => adjust.mutate()} disabled={!adjId || num(adjQty) === 0 || adjust.isPending}>Update stock</Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
