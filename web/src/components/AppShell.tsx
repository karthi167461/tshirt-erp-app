import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Home,
  Factory,
  Boxes,
  Scissors,
  Package,
  Ruler,
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const { data: settings } = useSettings();

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-border bg-card md:sticky md:top-0 md:h-screen md:overflow-y-auto">
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
        <nav className="px-3 pb-4 grid grid-cols-4 md:grid-cols-1 gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={(item as any).end}
              className={({ isActive }) =>
                cn(
                  "flex md:flex-row flex-col items-center gap-1 md:gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )
              }
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="text-center">{t(`nav.${item.key}`)}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border bg-card/60 backdrop-blur flex items-center justify-end px-5 gap-2">
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
        </header>
        <main className="flex-1 p-5 md:p-8 max-w-6xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
