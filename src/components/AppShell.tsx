import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Boxes, FileText, Home, LogOut, MoreHorizontal, Package, Receipt, Settings as Cog, Users,
  type LucideIcon,
} from "lucide-react";
import { api } from "../lib/api";
import { supabase } from "../lib/supabase";
import ResponsiveDialog from "./ResponsiveDialog";

interface Item { to: string; label: string; icon: LucideIcon; end?: boolean }

const sidebar: Item[] = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/billing", label: "New Bill", icon: Receipt },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/products", label: "Products", icon: Package },
  { to: "/stock", label: "Stock", icon: Boxes },
  { to: "/settings", label: "Settings", icon: Cog },
];

const more: Item[] = [
  { to: "/products", label: "Products", icon: Package },
  { to: "/stock", label: "Stock", icon: Boxes },
  { to: "/settings", label: "Settings", icon: Cog },
];

const linkCls = (active: boolean) =>
  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
    active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;

export default function AppShell() {
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  // The billing screen has its own sticky action bar, so it hides the tab bar on phones.
  const hideTabs = pathname === "/billing";
  const moreActive = more.some((m) => pathname.startsWith(m.to));
  const signOut = () => supabase.auth.signOut();

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 shrink-0 flex-col border-r bg-sidebar print:hidden sticky top-0 h-screen">
        <div className="px-5 pt-5 pb-4">
          <div className="text-lg font-bold tracking-tight text-primary">BillMate</div>
          <div className="text-xs text-muted-foreground truncate">{settings?.shop_name}</div>
        </div>
        <nav className="flex-1 space-y-1 px-3 overflow-y-auto">
          {sidebar.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => linkCls(isActive)}>
              <Icon className="size-4" /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t">
          <button onClick={signOut} className={`${linkCls(false)} w-full`}>
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between border-b bg-card px-4 h-14 print:hidden">
        <div className="min-w-0">
          <div className="font-bold text-primary leading-tight">BillMate</div>
          <div className="text-[11px] text-muted-foreground truncate leading-tight">{settings?.shop_name}</div>
        </div>
      </header>

      <main className={`flex-1 min-w-0 px-4 py-4 md:px-8 md:py-6 ${hideTabs ? "" : "pb-24"} md:pb-8 print:p-0`}>
        <div className="mx-auto w-full max-w-5xl">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      {!hideTabs && (
        <nav
          className="md:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 border-t bg-card print:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <Tab to="/" label="Home" icon={Home} end />
          <Tab to="/invoices" label="Invoices" icon={FileText} />
          <NavLink to="/billing" aria-label="New bill" className="flex flex-col items-center justify-center py-1.5">
            <span className="grid size-12 -mt-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background">
              <Receipt className="size-5" />
            </span>
            <span className="text-[11px] font-medium text-primary">Bill</span>
          </NavLink>
          <Tab to="/customers" label="Customers" icon={Users} />
          <button
            onClick={() => setMoreOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium ${
              moreActive ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <MoreHorizontal className="size-5" /> More
          </button>
        </nav>
      )}

      <ResponsiveDialog open={moreOpen} onOpenChange={setMoreOpen} title="More">
        <div className="space-y-1">
          {more.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={() => setMoreOpen(false)} className={({ isActive }) => linkCls(isActive)}>
              <Icon className="size-4" /> {label}
            </NavLink>
          ))}
          <button onClick={signOut} className={`${linkCls(false)} w-full`}>
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </ResponsiveDialog>
    </div>
  );
}

function Tab({ to, label, icon: Icon, end }: Item) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium ${
          isActive ? "text-primary" : "text-muted-foreground"
        }`
      }
    >
      <Icon className="size-5" /> {label}
    </NavLink>
  );
}
