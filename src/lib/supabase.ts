import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && key) || Boolean(import.meta.env.VITE_MOCK);

// Placeholder values keep the module importable when .env is missing; main.tsx shows a setup screen instead.
export const supabase = createClient(url || "http://localhost", key || "missing");
