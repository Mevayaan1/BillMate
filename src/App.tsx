import { Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import { useAuth } from "./lib/auth";
import AppShell from "./components/AppShell";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Billing from "./pages/Billing";
import Products from "./pages/Products";
import Stock from "./pages/Stock";
import Invoices from "./pages/Invoices";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import InvoiceView from "./pages/InvoiceView";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  const { session, loading } = useAuth();
  if (loading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  return (
    <>
      <Toaster richColors position="top-center" />
      {!session ? (
        <Login />
      ) : (
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="billing" element={<Billing />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="invoices/:id" element={<InvoiceView />} />
            <Route path="customers" element={<Customers />} />
            <Route path="customers/:id" element={<CustomerDetail />} />
            <Route path="products" element={<Products />} />
            <Route path="stock" element={<Stock />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Route>
        </Routes>
      )}
    </>
  );
}
