import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Home,
  Factory,
  Boxes,
  Scissors,
  Package,
  Ruler,
  ListOrdered,
  ShieldCheck,
  PackageCheck,
  Layers,
  BarChart3,
  Tag,
  Wallet,
  CalendarClock,
  Users,
  Settings as SettingsIcon,
  Languages,
  Keyboard,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { setLanguage, LANGUAGES } from "@/i18n";
import { useSettings } from "@/lib/data";

const NAV = [
  { to: "/", key: "home", icon: Home, end: true },
  { to: "/fabrication", key: "fabrication", icon: Factory },
  { to: "/cutting-lots", key: "cuttingLots", icon: Boxes },
  { to: "/master-entry", key: "masterEntry", icon: Keyboard },
  { to: "/cutting", key: "cutting", icon: Scissors },
  { to: "/pouch", key: "pouch", icon: Package },
  { to: "/stretching", key: "stretching", icon: Ruler },
  { to: "/stretching-flows", key: "stretchingFlows", icon: ListOrdered },
  { to: "/pichiru", key: "pichiru", icon: ShieldCheck },
  { to: "/packing", key: "packing", icon: PackageCheck },
  { to: "/rip-cutting", key: "ripCutting", icon: Layers },
  { to: "/analytics", key: "analytics", icon: BarChart3 },
  { to: "/pricing", key: "pricing", icon: Tag },
  { to: "/salary", key: "salary", icon: Wallet },
  { to: "/shifts", key: "shifts", icon: CalendarClock },
  { to: "/employees", key: "employees", icon: Users },
  { to: "/settings", key: "settings", icon: SettingsIcon },
] as const;

/** Logo + vertical nav — shared by the desktop sidebar and the mobile drawer. */
function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { data: settings } = useSettings();
  return (
    <>
      <div className="p-5 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold">
          {(settings?.companyName ?? "E").trim().charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="font-semibold truncate">
            {settings?.companyName ?? t("app.title")}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {t("app.tagline")}
          </div>
        </div>
      </div>
      <nav className="px-3 pb-4 grid grid-cols-1 gap-1">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={(item as any).end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex flex-row items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span>{t(`nav.${item.key}`)}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const { data: settings } = useSettings();
  // Mobile-only left drawer; the desktop sidebar is always visible.
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden md:block md:w-64 shrink-0 border-r border-border bg-card md:sticky md:top-0 md:h-screen md:overflow-y-auto">
        <SidebarContent />
      </aside>

      {/* Mobile drawer + backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-card border-r border-border overflow-y-auto transform transition-transform duration-200 md:hidden",
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label={t("nav.menu")}
      >
        <button
          type="button"
          className="absolute top-4 right-4 p-1 rounded-md text-muted-foreground hover:bg-muted"
          onClick={() => setDrawerOpen(false)}
          aria-label={t("common.close")}
        >
          <X className="h-5 w-5" />
        </button>
        <SidebarContent onNavigate={() => setDrawerOpen(false)} />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border bg-card/60 backdrop-blur flex items-center justify-between px-4 md:px-5 gap-2 sticky top-0 z-30 md:static">
          <div className="flex items-center gap-3 min-w-0 md:hidden">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label={t("nav.menu")}
              aria-expanded={drawerOpen}
              className="p-2 -ml-2 rounded-md text-foreground hover:bg-muted"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="font-semibold truncate">
              {settings?.companyName ?? t("app.title")}
            </span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Languages className="h-4 w-4 text-muted-foreground" />
            <div className="flex rounded-md border border-input overflow-hidden">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLanguage(l.code)}
                  className={cn(
                    "px-3 py-1.5 text-sm",
                    i18n.language === l.code
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground hover:bg-muted"
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </header>
        <main className="flex-1 p-5 md:p-8 max-w-6xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
