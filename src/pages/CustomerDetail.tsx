import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, MessageCircle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { money, num } from "../lib/money";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import ListRow from "../components/ListRow";
import FormField from "../components/FormField";
import ResponsiveDialog from "../components/ResponsiveDialog";
import CustomerDialog from "../components/CustomerDialog";

type Mode = "cash" | "upi" | "card";

export default function CustomerDetail() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const { data: parties = [] } = useQuery({ queryKey: ["parties"], queryFn: api.getParties });
  const { data: invoices = [] } = useQuery({ queryKey: ["party-invoices", id], queryFn: () => api.getPartyInvoices(id) });
  const { data: payments = [] } = useQuery({ queryKey: ["party-payments", id], queryFn: () => api.getPartyPayments(id) });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });

  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<Mode>("cash");

  const party = parties.find((p) => p.id === id);
  const live = invoices.filter((i) => i.status === "final");
  const due = live.reduce((s, i) => s + (i.grand_total - i.paid), 0);
  const billed = live.reduce((s, i) => s + i.grand_total, 0);

  const receive = useMutation({
    mutationFn: () => api.recordPayment(id, num(amount), mode),
    onSuccess: () => {
      toast.success("Payment recorded");
      setPaying(false);
      setAmount("");
      for (const k of ["party-invoices", "party-payments", "balances", "invoices"]) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!party) return <p className="text-muted-foreground">Loading…</p>;

  const remind = () => {
    const text = `Hello ${party.name}, your pending balance at ${settings?.shop_name ?? "our shop"} is ${money(due)}. Please pay at your convenience. Thank you!`;
    const phone = party.phone.replace(/\D/g, "");
    window.open(`https://wa.me/${phone.length === 10 ? "91" + phone : phone}?text=${encodeURIComponent(text)}`, "_blank");
  };

  const amt = num(amount);
  const amountError = amt > due ? `Can't be more than ${money(due)}` : "";

  return (
    <div className="space-y-5">
      <Link to="/customers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Customers
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight truncate">{party.name}</h1>
          <p className="text-sm text-muted-foreground">{[party.phone, party.gstin, party.address].filter(Boolean).join(" · ") || "No contact details"}</p>
        </div>
        <Button variant="outline" size="icon" aria-label="Edit customer" onClick={() => setEditing(true)}><Pencil className="size-4" /></Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total billed" value={money(billed)} />
        <StatCard label="Outstanding" value={money(due)} tone={due > 0 ? "warning" : "success"} />
      </div>

      <div className="flex gap-2">
        <Button className="flex-1 md:flex-none" disabled={due <= 0} onClick={() => { setAmount(String(due)); setPaying(true); }}>Receive payment</Button>
        <Button className="flex-1 md:flex-none" variant="outline" disabled={due <= 0 || !party.phone} onClick={remind}>
          <MessageCircle className="size-4" /> Remind
        </Button>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Bills</h2>
        {invoices.length === 0 && <p className="text-sm text-muted-foreground">No bills yet.</p>}
        {invoices.map((i) => (
          <ListRow
            key={i.id}
            to={`/invoices/${i.id}`}
            title={i.invoice_no}
            subtitle={format(new Date(i.date), "d MMM yyyy")}
            right={money(i.grand_total)}
            rightSub={
              i.status === "cancelled" ? <StatusBadge tone="danger">Cancelled</StatusBadge>
              : i.grand_total - i.paid > 0 ? <StatusBadge tone="warning">Due {money(i.grand_total - i.paid)}</StatusBadge>
              : <StatusBadge tone="success">Paid</StatusBadge>
            }
          />
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Payments received</h2>
        {payments.length === 0 && <p className="text-sm text-muted-foreground">No payments yet.</p>}
        {payments.map((p) => (
          <Card key={p.id} className="px-4 py-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{format(new Date(p.date), "d MMM yyyy, h:mm a")} · {p.mode === "upi" ? "UPI" : p.mode[0].toUpperCase() + p.mode.slice(1)}</span>
            <span className="font-semibold tabular-nums text-success">{money(p.amount)}</span>
          </Card>
        ))}
      </section>

      <ResponsiveDialog open={paying} onOpenChange={setPaying} title="Receive payment" description={`Outstanding ${money(due)}. Payment settles the oldest bills first.`}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (amt > 0 && !amountError) receive.mutate(); }}>
          <FormField label="Amount received" error={amountError}>
            <Input type="number" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormField>
          <div className="grid grid-cols-3 gap-2">
            {(["cash", "upi", "card"] as Mode[]).map((m) => (
              <Button type="button" key={m} variant={mode === m ? "default" : "outline"} onClick={() => setMode(m)}>{m === "upi" ? "UPI" : m[0].toUpperCase() + m.slice(1)}</Button>
            ))}
          </div>
          <Button className="w-full" size="lg" disabled={receive.isPending || amt <= 0 || !!amountError}>Record payment</Button>
        </form>
      </ResponsiveDialog>

      <CustomerDialog open={editing} onOpenChange={setEditing} customer={party} />
    </div>
  );
}
