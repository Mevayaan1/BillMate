import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import { isConfigured } from "./lib/supabase";
import "./styles/index.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } });

const root = createRoot(document.getElementById("root")!);

if (!isConfigured) {
  root.render(
    <div className="min-h-screen grid place-items-center p-4">
      <div className="max-w-md border rounded-lg p-6 space-y-2">
        <h1 className="text-xl font-semibold">BillMate needs Supabase</h1>
        <p className="text-sm text-muted-foreground">
          Copy <code>.env.example</code> to <code>.env</code>, set <code>VITE_SUPABASE_URL</code> and{" "}
          <code>VITE_SUPABASE_ANON_KEY</code>, then restart the dev server. See README.md for the full setup.
        </p>
      </div>
    </div>,
  );
} else root.render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>,
);
