import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Users } from "lucide-react";
import { api } from "../lib/api";
import { money } from "../lib/money";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import PageHeader from "../components/PageHeader";
import ListRow from "../components/ListRow";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import CustomerDialog from "../components/CustomerDialog";

export default function Customers() {
  const [params, setParams] = useSearchParams();
  const dueOnly = params.get("due") === "1";
  const { data: parties = [], isLoading } = useQuery({ queryKey: ["parties"], queryFn: api.getParties });
  const { data: balances = {} } = useQuery({ queryKey: ["balances"], queryFn: api.getBalances });
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);

  const customers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parties
      .filter((p) => p.type !== "supplier")
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.phone.includes(q))
      .filter((p) => !dueOnly || (balances[p.id] ?? 0) > 0)
      .sort((a, b) => (balances[b.id] ?? 0) - (balances[a.id] ?? 0) || a.name.localeCompare(b.name));
  }, [parties, balances, search, dueOnly]);

  const totalDue = Object.values(balances).reduce((s, v) => s + Math.max(0, v), 0);
  const setDue = (on: boolean) => setParams(on ? { due: "1" } : {}, { replace: true });

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={<>Total to collect: <b className="text-foreground">{money(totalDue)}</b></>}
        actions={<Button onClick={() => setAdding(true)}><Plus className="size-4" /> Add customer</Button>}
      />

      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search name or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 mb-4">
        <Button size="sm" variant={dueOnly ? "outline" : "default"} onClick={() => setDue(false)}>All</Button>
        <Button size="sm" variant={dueOnly ? "default" : "outline"} onClick={() => setDue(true)}>Has due</Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : customers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={dueOnly ? "No pending dues" : search ? "No matching customers" : "No customers yet"}
          text={dueOnly ? "Everyone has paid up." : "Add customers to track their bills and udhaar."}
          action={!dueOnly && !search && <Button onClick={() => setAdding(true)}>Add customer</Button>}
        />
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {customers.map((p) => {
            const due = balances[p.id] ?? 0;
            return (
              <ListRow
                key={p.id}
                to={`/customers/${p.id}`}
                title={p.name}
                subtitle={p.phone || "No phone"}
                right={due > 0 ? money(due) : undefined}
                rightSub={due > 0 ? <StatusBadge tone="warning">Due</StatusBadge> : <StatusBadge tone="success">Settled</StatusBadge>}
              />
            );
          })}
        </div>
      )}

      <CustomerDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}
