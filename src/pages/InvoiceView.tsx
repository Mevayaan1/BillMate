import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, MessageCircle, Printer } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { money } from "../lib/money";
import type { Invoice, Settings } from "../lib/types";
import { Button } from "../components/ui/button";
import StatusBadge from "../components/StatusBadge";

type Fmt = "a4" | "thermal";

export default function InvoiceView() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const [fmt, setFmt] = useState<Fmt>(() => (localStorage.getItem("billmate.fmt") as Fmt) || "thermal");
  const { data: inv } = useQuery({ queryKey: ["invoice", id], queryFn: () => api.getInvoice(id) });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });

  const cancel = useMutation({
    mutationFn: () => api.cancelInvoice(id),
    onSuccess: () => {
      toast.success("Invoice cancelled and stock restored");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!inv || !settings) return <p className="text-muted-foreground">Loading…</p>;

  const pick = (f: Fmt) => { setFmt(f); localStorage.setItem("billmate.fmt", f); };
  const whatsapp = () => {
    const lines = (inv.invoice_items ?? []).map((i) => `${i.name} x${i.qty} = ${money(i.line_total)}`);
    const text = `${settings.shop_name}\nInvoice ${inv.invoice_no}\n${lines.join("\n")}\nTotal: ${money(inv.grand_total)}\n${settings.footer_note}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <div>
      <style>{fmt === "thermal"
        ? "@page { size: 80mm auto; margin: 2mm; }"
        : "@page { size: A4; margin: 12mm; }"}</style>

      <div className="print:hidden mb-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Button asChild variant="ghost" className="-ml-2"><Link to="/invoices"><ArrowLeft className="size-4" /> Invoices</Link></Button>
          {inv.status === "cancelled" && <StatusBadge tone="danger">Cancelled</StatusBadge>}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" onClick={() => window.print()}><Printer className="size-4" /> Print</Button>
          <Button size="lg" variant="outline" onClick={whatsapp}><MessageCircle className="size-4" /> WhatsApp</Button>
        </div>

        <div className="grid grid-cols-2 rounded-lg border bg-muted p-1 gap-1">
          {([["thermal", "80mm receipt"], ["a4", "A4 invoice"]] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => pick(id)}
              className={`h-10 rounded-md text-sm font-medium transition-colors ${fmt === id ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto print:overflow-visible pb-2">
        <div className="bg-white text-black mx-auto shadow-md print:shadow-none rounded-sm" style={{ width: fmt === "thermal" ? "76mm" : undefined, minWidth: fmt === "a4" ? "640px" : undefined, maxWidth: fmt === "a4" ? "210mm" : undefined }}>
          {fmt === "thermal" ? <Thermal inv={inv} s={settings} /> : <A4 inv={inv} s={settings} />}
        </div>
      </div>

      {inv.status === "final" && (
        <div className="print:hidden mt-6 pb-24 md:pb-0 text-center">
          <Button variant="ghost" className="text-destructive" onClick={() => confirm("Cancel this invoice and return the items to stock?") && cancel.mutate()}>
            Cancel this invoice
          </Button>
        </div>
      )}
    </div>
  );
}

function Thermal({ inv, s }: { inv: Invoice; s: Settings }) {
  const items = inv.invoice_items ?? [];
  return (
    <div className="p-2 text-[11px] leading-tight font-mono">
      <div className="text-center">
        <div className="text-sm font-bold">{s.shop_name}</div>
        <div>{s.address}</div>
        {s.phone && <div>Ph: {s.phone}</div>}
        {s.gst_enabled && s.gstin && <div>GSTIN: {s.gstin}</div>}
      </div>
      <hr className="my-1 border-dashed border-black" />
      <div className="flex justify-between"><span>{inv.invoice_no}</span><span>{format(new Date(inv.date), "dd/MM/yy HH:mm")}</span></div>
      {inv.customer_name && <div>Cust: {inv.customer_name}</div>}
      {inv.status === "cancelled" && <div className="text-center font-bold">** CANCELLED **</div>}
      <hr className="my-1 border-dashed border-black" />
      {items.map((i) => (
        <div key={i.id} className="mb-1">
          <div>{i.name}</div>
          <div className="flex justify-between">
            <span>{i.qty} x {i.unit_price.toFixed(2)}{i.discount > 0 && ` (-${i.discount})`}</span>
            <span>{i.line_total.toFixed(2)}</span>
          </div>
        </div>
      ))}
      <hr className="my-1 border-dashed border-black" />
      {s.gst_enabled && (
        <>
          <Line k="Taxable" v={inv.taxable_total} />
          {inv.igst_total > 0 ? <Line k="IGST" v={inv.igst_total} /> : (<><Line k="CGST" v={inv.cgst_total} /><Line k="SGST" v={inv.sgst_total} /></>)}
        </>
      )}
      {inv.round_off !== 0 && <Line k="Round off" v={inv.round_off} />}
      <div className="flex justify-between text-sm font-bold"><span>TOTAL</span><span>{inv.grand_total.toFixed(2)}</span></div>
      <div className="flex justify-between"><span>Paid ({inv.payment_mode})</span><span>{inv.paid.toFixed(2)}</span></div>
      {inv.grand_total - inv.paid > 0 && <div className="flex justify-between font-bold"><span>Due</span><span>{(inv.grand_total - inv.paid).toFixed(2)}</span></div>}
      <hr className="my-1 border-dashed border-black" />
      <div className="text-center">{s.footer_note}</div>
    </div>
  );
}

const Line = ({ k, v }: { k: string; v: number }) => (
  <div className="flex justify-between"><span>{k}</span><span>{v.toFixed(2)}</span></div>
);

function A4({ inv, s }: { inv: Invoice; s: Settings }) {
  const items = inv.invoice_items ?? [];
  const inter = inv.igst_total > 0;
  return (
    <div className="p-8 text-sm">
      <div className="flex justify-between border-b pb-3">
        <div>
          <div className="text-xl font-bold">{s.shop_name}</div>
          <div className="whitespace-pre-line">{s.address}</div>
          {s.phone && <div>Phone: {s.phone}</div>}
          {s.gst_enabled && s.gstin && <div>GSTIN: {s.gstin}</div>}
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold">{s.gst_enabled ? "TAX INVOICE" : "INVOICE"}</div>
          <div>No: {inv.invoice_no}</div>
          <div>Date: {format(new Date(inv.date), "dd MMM yyyy")}</div>
          {inv.status === "cancelled" && <div className="font-bold text-red-600">CANCELLED</div>}
        </div>
      </div>
      <div className="py-3">Bill to: <b>{inv.customer_name || "Walk-in customer"}</b></div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y bg-gray-100 text-left">
            <th className="p-1">#</th><th className="p-1">Item</th>
            {s.gst_enabled && <th className="p-1">HSN</th>}
            <th className="p-1 text-right">Qty</th><th className="p-1 text-right">Rate</th>
            {s.gst_enabled && <th className="p-1 text-right">GST%</th>}
            <th className="p-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i, n) => (
            <tr key={i.id} className="border-b">
              <td className="p-1">{n + 1}</td><td className="p-1">{i.name}</td>
              {s.gst_enabled && <td className="p-1">{i.hsn}</td>}
              <td className="p-1 text-right">{i.qty} {i.unit}</td>
              <td className="p-1 text-right">{i.unit_price.toFixed(2)}</td>
              {s.gst_enabled && <td className="p-1 text-right">{i.gst_rate}</td>}
              <td className="p-1 text-right">{i.line_total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 ml-auto w-64 space-y-1">
        {s.gst_enabled && <Line k="Taxable value" v={inv.taxable_total} />}
        {s.gst_enabled && (inter ? <Line k="IGST" v={inv.igst_total} /> : (<><Line k="CGST" v={inv.cgst_total} /><Line k="SGST" v={inv.sgst_total} /></>))}
        {inv.round_off !== 0 && <Line k="Round off" v={inv.round_off} />}
        <div className="flex justify-between border-t pt-1 text-base font-bold"><span>Grand total</span><span>{money(inv.grand_total)}</span></div>
        <div className="flex justify-between"><span>Paid ({inv.payment_mode})</span><span>{money(inv.paid)}</span></div>
        {inv.grand_total - inv.paid > 0 && <div className="flex justify-between font-semibold"><span>Balance due</span><span>{money(inv.grand_total - inv.paid)}</span></div>}
      </div>
      <div className="mt-10 text-center text-xs text-gray-600">{s.footer_note}</div>
    </div>
  );
}
