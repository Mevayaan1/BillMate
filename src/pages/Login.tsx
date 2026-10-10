import { useState } from "react";
import { Receipt } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import FormField from "../components/FormField";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
  }

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg mb-3">
            <Receipt className="size-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">BillMate</h1>
          <p className="text-sm text-muted-foreground">Sign in to your shop</p>
        </div>
        <Card className="p-5">
          <form onSubmit={submit} className="space-y-4">
            <FormField label="Email">
              <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </FormField>
            <FormField label="Password">
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </FormField>
            <Button className="w-full" size="lg" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
