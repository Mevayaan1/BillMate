import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { money, num } from "../lib/money";
import type { Product } from "../lib/types";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Card } from "../components/ui/card";
import PageHeader from "../components/PageHeader";
import FormField from "../components/FormField";
import NativeSelect from "../components/NativeSelect";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import ResponsiveDialog from "../components/ResponsiveDialog";

interface VariantForm {
  id?: string;
  label: string;
  sku: string;
  barcode: string;
  cost_price: string;
  sale_price: string;
  mrp: string;
  low_stock_limit: string;
}
interface ProductForm {
  id?: string;
  name: string;
  category_id: string;
  hsn: string;
  gst_rate: string;
  unit: string;
  has_variants: boolean;
  variants: VariantForm[];
}

const emptyVariant = (label = "Default"): VariantForm => ({
  label, sku: "", barcode: "", cost_price: "", sale_price: "", mrp: "", low_stock_limit: "5",
});
const emptyForm = (): ProductForm => ({
  name: "", category_id: "", hsn: "", gst_rate: "0", unit: "pcs", has_variants: false, variants: [emptyVariant()],
});

export default function Products() {
  const qc = useQueryClient();
  const { data: products = [], isLoading } = useQuery({ queryKey: ["products"], queryFn: api.getProducts });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: api.getCategories });
  const { data: stock = {} } = useQuery({ queryKey: ["stock"], queryFn: api.getStock });
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<ProductForm | null>(null);
  const [newCat, setNewCat] = useState("");
  const [errors, setErrors] = useState<{ name?: string; price?: string }>({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.variants.some((v) => v.barcode?.toLowerCase().includes(q) || v.sku?.toLowerCase().includes(q)),
    );
  }, [products, search]);

  const save = useMutation({
    mutationFn: async (f: ProductForm) => {
      let categoryId = f.category_id;
      if (newCat.trim()) categoryId = (await api.addCategory(newCat.trim())).id;
      const variants = (f.has_variants ? f.variants : f.variants.slice(0, 1).map((v) => ({ ...v, label: "Default" }))).map((v) => ({
        id: v.id,
        label: v.label.trim() || "Default",
        sku: v.sku.trim() || null,
        barcode: v.barcode.trim() || null,
        cost_price: num(v.cost_price),
        sale_price: num(v.sale_price),
        mrp: v.mrp ? num(v.mrp) : null,
        low_stock_limit: num(v.low_stock_limit),
      }));
      return api.saveProduct(
        {
          id: f.id,
          name: f.name.trim(),
          category_id: categoryId || null,
          hsn: f.hsn.trim(),
          gst_rate: num(f.gst_rate),
          unit: f.unit.trim() || "pcs",
          has_variants: f.has_variants,
        },
        variants,
      );
    },
    onSuccess: () => {
      toast.success("Product saved");
      setForm(null);
      setNewCat("");
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: api.archiveProduct,
    onSuccess: () => { toast.success("Product removed"); qc.invalidateQueries({ queryKey: ["products"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  function open(p?: Product) {
    setErrors({});
    setNewCat("");
    if (!p) return setForm(emptyForm());
    setForm({
      id: p.id,
      name: p.name,
      category_id: p.category_id ?? "",
      hsn: p.hsn,
      gst_rate: String(p.gst_rate),
      unit: p.unit,
      has_variants: p.has_variants,
      variants: p.variants.filter((v) => v.active).map((v) => ({
        id: v.id,
        label: v.label,
        sku: v.sku ?? "",
        barcode: v.barcode ?? "",
        cost_price: String(v.cost_price),
        sale_price: String(v.sale_price),
        mrp: v.mrp != null ? String(v.mrp) : "",
        low_stock_limit: String(v.low_stock_limit),
      })),
    });
  }

  function submit() {
    if (!form) return;
    const e: typeof errors = {};
    if (!form.name.trim()) e.name = "Please enter a product name";
    const vs = form.has_variants ? form.variants : form.variants.slice(0, 1);
    if (vs.some((v) => !v.sale_price || num(v.sale_price) <= 0)) e.price = "Enter a price";
    setErrors(e);
    if (Object.keys(e).length === 0) save.mutate(form);
  }

  const setVariant = (i: number, patch: Partial<VariantForm>) =>
    setForm((f) => f && { ...f, variants: f.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) });

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={`${products.length} item${products.length === 1 ? "" : "s"}`}
        actions={<Button onClick={() => open()}><Plus className="size-4" /> Add product</Button>}
      />

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search name, barcode or SKU" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title={products.length === 0 ? "No products yet" : "No matching products"}
          text={products.length === 0 ? "Add the items you sell, with their prices and GST rate." : "Try a different search."}
          action={products.length === 0 && <Button onClick={() => open()}>Add your first product</Button>}
        />
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {filtered.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium leading-snug">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {categories.find((c) => c.id === p.category_id)?.name ?? "No category"} · GST {p.gst_rate}%{p.hsn && ` · HSN ${p.hsn}`}
                  </div>
                </div>
                <div className="flex -mr-2 -mt-2 shrink-0">
                  <Button size="icon" variant="ghost" aria-label={`Edit ${p.name}`} onClick={() => open(p)}><Pencil className="size-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label={`Remove ${p.name}`} onClick={() => confirm(`Remove ${p.name}?`) && archive.mutate(p.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                {p.variants.filter((v) => v.active).map((v) => {
                  const qty = stock[v.id] ?? 0;
                  return (
                    <div key={v.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground truncate">{p.has_variants ? v.label : "Price"}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="font-medium tabular-nums">{money(v.sale_price)}</span>
                        <StatusBadge tone={qty <= 0 ? "danger" : qty <= v.low_stock_limit ? "warning" : "success"}>
                          {qty} {p.unit}
                        </StatusBadge>
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}

      <ResponsiveDialog open={!!form} onOpenChange={(o) => !o && setForm(null)} title={form?.id ? "Edit product" : "New product"} wide>
        {form && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <FormField label="Product name" error={errors.name}>
              <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Category">
                <NativeSelect value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                  <option value="">None</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </NativeSelect>
              </FormField>
              <FormField label="Or new category"><Input value={newCat} onChange={(e) => setNewCat(e.target.value)} /></FormField>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <FormField label="HSN code"><Input inputMode="numeric" value={form.hsn} onChange={(e) => setForm({ ...form, hsn: e.target.value })} /></FormField>
              <FormField label="GST %"><Input type="number" inputMode="decimal" value={form.gst_rate} onChange={(e) => setForm({ ...form, gst_rate: e.target.value })} /></FormField>
              <FormField label="Unit"><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></FormField>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/40 p-3">
              <div>
                <Label>Has variants</Label>
                <p className="text-xs text-muted-foreground">For sizes, colours or weights with their own price and stock</p>
              </div>
              <Switch checked={form.has_variants} onCheckedChange={(v) => setForm({ ...form, has_variants: v })} />
            </div>

            <div className="space-y-3">
              {(form.has_variants ? form.variants : form.variants.slice(0, 1)).map((v, i) => (
                <Card key={i} className="p-3 space-y-3">
                  {form.has_variants && (
                    <FormField label="Variant name"><Input placeholder="e.g. M / Red" value={v.label} onChange={(e) => setVariant(i, { label: e.target.value })} /></FormField>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Selling price (₹)" error={i === 0 ? errors.price : undefined}><Input type="number" inputMode="decimal" value={v.sale_price} onChange={(e) => setVariant(i, { sale_price: e.target.value })} /></FormField>
                    <FormField label="Cost price (₹)"><Input type="number" inputMode="decimal" value={v.cost_price} onChange={(e) => setVariant(i, { cost_price: e.target.value })} /></FormField>
                    <FormField label="MRP (₹)"><Input type="number" inputMode="decimal" value={v.mrp} onChange={(e) => setVariant(i, { mrp: e.target.value })} /></FormField>
                    <FormField label="Low stock alert at"><Input type="number" inputMode="decimal" value={v.low_stock_limit} onChange={(e) => setVariant(i, { low_stock_limit: e.target.value })} /></FormField>
                    <FormField label="Barcode"><Input value={v.barcode} onChange={(e) => setVariant(i, { barcode: e.target.value })} /></FormField>
                    <FormField label="SKU"><Input value={v.sku} onChange={(e) => setVariant(i, { sku: e.target.value })} /></FormField>
                  </div>
                  {form.has_variants && form.variants.length > 1 && !v.id && (
                    <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => setForm({ ...form, variants: form.variants.filter((_, j) => j !== i) })}>
                      Remove variant
                    </Button>
                  )}
                </Card>
              ))}
              {form.has_variants && (
                <Button type="button" variant="outline" className="w-full" onClick={() => setForm({ ...form, variants: [...form.variants, emptyVariant("")] })}>
                  <Plus className="size-4" /> Add another variant
                </Button>
              )}
            </div>

            <p className="text-xs text-muted-foreground">Add opening stock from the Stock page after saving.</p>
            <Button className="w-full" size="lg" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save product"}</Button>
          </form>
        )}
      </ResponsiveDialog>
    </div>
  );
}
