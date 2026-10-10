import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../lib/api";
import type { Settings } from "../lib/types";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Textarea } from "../components/ui/textarea";
import { Card } from "../components/ui/card";
import PageHeader from "../components/PageHeader";
import FormField from "../components/FormField";

function ToggleRow({ title, text, checked, onChange }: { title: string; text: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <Label>{title}</Label>
        <p className="text-xs text-muted-foreground">{text}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });
  const [f, setF] = useState<Settings | null>(null);
  useEffect(() => { if (data) setF(data); }, [data]);

  const save = useMutation({
    mutationFn: () => {
      const { id: _id, next_invoice_no: _n, ...patch } = f!;
      return api.saveSettings({ ...patch, setup_done: true });
    },
    onSuccess: () => { toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!f) return <p className="text-muted-foreground">Loading…</p>;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setF({ ...f, [k]: v });

  return (
    <div className="max-w-2xl pb-24 md:pb-0">
      <PageHeader title="Settings" subtitle="Your shop details appear on every bill" />
      {!data?.setup_done && (
        <Card className="p-4 mb-4 border-primary/30 bg-accent text-sm">Welcome! Fill in your shop details and save to get started.</Card>
      )}

      <div className="space-y-4">
        <Card className="p-4 space-y-4">
          <h2 className="font-medium">Shop</h2>
          <FormField label="Shop name"><Input value={f.shop_name} onChange={(e) => set("shop_name", e.target.value)} /></FormField>
          <FormField label="Address"><Textarea value={f.address} onChange={(e) => set("address", e.target.value)} /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Phone"><Input type="tel" inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></FormField>
            <FormField label="Bill number prefix"><Input value={f.invoice_prefix} onChange={(e) => set("invoice_prefix", e.target.value)} /></FormField>
          </div>
          <FormField label="Bill footer message"><Input value={f.footer_note} onChange={(e) => set("footer_note", e.target.value)} /></FormField>
        </Card>

        <Card className="p-4 space-y-4">
          <h2 className="font-medium">GST</h2>
          <ToggleRow title="Charge GST" text="Turn off if the shop is not registered under GST" checked={f.gst_enabled} onChange={(v) => set("gst_enabled", v)} />
          {f.gst_enabled && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="GSTIN"><Input value={f.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase())} /></FormField>
                <FormField label="State code" hint="e.g. 08 for Rajasthan"><Input maxLength={2} inputMode="numeric" value={f.state_code} onChange={(e) => set("state_code", e.target.value)} /></FormField>
              </div>
              <ToggleRow title="Prices include GST" text="The selling prices you enter already contain tax" checked={f.prices_include_tax} onChange={(v) => set("prices_include_tax", v)} />
            </>
          )}
        </Card>

        <Button size="lg" className="w-full md:w-auto" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save settings"}</Button>
      </div>
    </div>
  );
}
