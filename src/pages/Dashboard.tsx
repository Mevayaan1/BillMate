import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format, isSameDay, startOfDay, subDays } from "date-fns";
import { AlertTriangle, IndianRupee, Plus, Receipt, Wallet } from "lucide-react";
import { api } from "../lib/api";
import { money } from "../lib/money";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import ListRow from "../components/ListRow";
import EmptyState from "../components/EmptyState";

export default function Dashboard() {
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: () => api.getInvoices() });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: api.getProducts });
  const { data: stock = {} } = useQuery({ queryKey: ["stock"], queryFn: api.getStock });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });

  const stats = useMemo(() => {
    const live = invoices.filter((i) => i.status === "final");
    const today = live.filter((i) => isSameDay(new Date(i.date), new Date()));
    const days = Array.from({ length: 7 }, (_, n) => startOfDay(subDays(new Date(), 6 - n)));
    const chart = days.map((d) => ({
      day: format(d, "EEE"),
      total: live.filter((i) => isSameDay(new Date(i.date), d)).reduce((s, i) => s + i.grand_total, 0),
    }));
    const due = live.reduce((s, i) => s + Math.max(0, i.grand_total - i.paid), 0);
    const low = products
      .flatMap((p) => p.variants.filter((v) => v.active).map((v) => ({ p, v, qty: stock[v.id] ?? 0 })))
      .filter((x) => x.qty <= x.v.low_stock_limit)
      .sort((a, b) => a.qty - b.qty);
    return {
      todaySales: today.reduce((s, i) => s + i.grand_total, 0),
      todayCount: today.length,
      due,
      low,
      chart,
      recent: invoices.slice(0, 5),
    };
  }, [invoices, products, stock]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Home"
        subtitle={format(new Date(), "EEEE, d MMMM")}
        actions={
          <Button asChild className="hidden md:inline-flex">
            <Link to="/billing"><Plus className="size-4" /> New bill</Link>
          </Button>
        }
      />

      {settings && !settings.setup_done && (
        <Card className="p-4 border-primary/30 bg-accent">
          <div className="font-medium">Finish setting up your shop</div>
          <p className="text-sm text-muted-foreground mb-3">Add your shop name and GST details, then add your products.</p>
          <Button asChild size="sm"><Link to="/settings">Open settings</Link></Button>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Today's sales" value={money(stats.todaySales)} icon={IndianRupee} />
        <StatCard label="Bills today" value={String(stats.todayCount)} icon={Receipt} />
        <Link to="/customers?due=1" className="block">
          <StatCard label="To collect (udhaar)" value={money(stats.due)} icon={Wallet} tone={stats.due > 0 ? "warning" : "default"} />
        </Link>
        <Link to="/stock" className="block">
          <StatCard label="Low stock items" value={String(stats.low.length)} icon={AlertTriangle} tone={stats.low.length > 0 ? "danger" : "default"} />
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-4">
          <div className="text-sm font-medium mb-3">Sales, last 7 days</div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.chart} margin={{ left: -12, right: 4, top: 4 }}>
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} width={48} fontSize={12} />
                <Tooltip formatter={(v: number) => money(v)} cursor={{ fill: "var(--muted)" }} />
                <Bar dataKey="total" fill="#2563eb" radius={[6, 6, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Recent bills</h2>
            <Link to="/invoices" className="text-sm text-primary">View all</Link>
          </div>
          {stats.recent.length === 0 ? (
            <EmptyState icon={Receipt} title="No bills yet" text="Your first bill will show up here." />
          ) : (
            stats.recent.map((i) => (
              <ListRow
                key={i.id}
                to={`/invoices/${i.id}`}
                title={i.invoice_no}
                subtitle={`${i.customer_name || "Walk-in"} · ${format(new Date(i.date), "d MMM, h:mm a")}`}
                right={money(i.grand_total)}
                rightSub={
                  i.status === "cancelled" ? <StatusBadge tone="danger">Cancelled</StatusBadge>
                  : i.grand_total - i.paid > 0 ? <StatusBadge tone="warning">Due {money(i.grand_total - i.paid)}</StatusBadge>
                  : <StatusBadge tone="success">Paid</StatusBadge>
                }
              />
            ))
          )}
        </section>
      </div>

      {stats.low.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Running low</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {stats.low.slice(0, 4).map(({ p, v, qty }) => (
              <ListRow
                key={v.id}
                to="/stock"
                title={p.has_variants ? `${p.name} (${v.label})` : p.name}
                right={`${qty} ${p.unit}`}
                rightSub={<StatusBadge tone={qty <= 0 ? "danger" : "warning"}>{qty <= 0 ? "Out of stock" : "Low"}</StatusBadge>}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
