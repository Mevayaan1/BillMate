import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../lib/api";
import type { Party } from "../lib/types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import FormField from "./FormField";
import ResponsiveDialog from "./ResponsiveDialog";

const blank = { name: "", phone: "", gstin: "", state_code: "", address: "" };

export default function CustomerDialog({
  open,
  onOpenChange,
  customer,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customer?: Party | null;
  onSaved?: (p: Party) => void;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState(blank);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setF(
      customer
        ? { name: customer.name, phone: customer.phone, gstin: customer.gstin, state_code: customer.state_code, address: customer.address }
        : blank,
    );
  }, [open, customer]);

  const save = useMutation({
    mutationFn: async () => {
      const body = { ...f, name: f.name.trim(), gstin: f.gstin.trim().toUpperCase() };
      if (customer) {
        await api.updateParty(customer.id, body);
        return { ...customer, ...body } as Party;
      }
      return api.addParty({ ...body, type: "customer" });
    },
    onSuccess: (p) => {
      toast.success("Customer saved");
      qc.invalidateQueries({ queryKey: ["parties"] });
      onSaved?.(p);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });

  function submit() {
    if (!f.name.trim()) return setError("Please enter the customer's name");
    save.mutate();
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={customer ? "Edit customer" : "New customer"}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <FormField label="Name" error={error}>
          <Input autoFocus value={f.name} onChange={(e) => { set("name", e.target.value); setError(""); }} />
        </FormField>
        <FormField label="Phone">
          <Input type="tel" inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="GSTIN (optional)">
            <Input value={f.gstin} onChange={(e) => set("gstin", e.target.value)} />
          </FormField>
          <FormField label="State code" hint="e.g. 08 for Rajasthan">
            <Input maxLength={2} inputMode="numeric" value={f.state_code} onChange={(e) => set("state_code", e.target.value)} />
          </FormField>
        </div>
        <FormField label="Address">
          <Input value={f.address} onChange={(e) => set("address", e.target.value)} />
        </FormField>
        <Button className="w-full" size="lg" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save customer"}</Button>
      </form>
    </ResponsiveDialog>
  );
}
