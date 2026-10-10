import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { FileText, Plus, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { money } from "../lib/money";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import PageHeader from "../components/PageHeader";
import ListRow from "../components/ListRow";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";

type Filter = "all" | "due" | "cancelled";

export default function Invoices() {
  const { data = [], isLoading } = useQuery({ queryKey: ["invoices"], queryFn: () => api.getInvoices() });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data
      .filter((i) => !q || i.invoice_no.toLowerCase().includes(q) || i.customer_name.toLowerCase().includes(q))
      .filter((i) => (filter === "due" ? i.status === "final" && i.grand_total > i.paid : filter === "cancelled" ? i.status === "cancelled" : true));
  }, [data, search, filter]);

  const chips: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "due", label: "Unpaid" },
    { id: "cancelled", label: "Cancelled" },
  ];

  return (
    <div>
      <PageHeader title="Invoices" actions={<Button asChild className="hidden md:inline-flex"><Link to="/billing"><Plus className="size-4" /> New bill</Link></Button>} />

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search bill number or customer" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="flex gap-2 mb-4">
        {chips.map((c) => (
          <Button key={c.id} size="sm" variant={filter === c.id ? "default" : "outline"} onClick={() => setFilter(c.id)}>{c.label}</Button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={data.length === 0 ? "No bills yet" : "No bills found"}
          text={data.length === 0 ? "Make your first bill and it will appear here." : "Try a different search or filter."}
          action={data.length === 0 && <Button asChild><Link to="/billing">New bill</Link></Button>}
        />
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {rows.map((i) => (
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
          ))}
        </div>
      )}
    </div>
  );
}
