import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Factory,
  Scissors,
  Package,
  Ruler,
  BarChart3,
  ArrowRight,
  Keyboard,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui";
import { useCuttingLotsList, useSettings } from "@/lib/data";
import { PageTitle } from "@/pages/_parts";

const QUICK = [
  { to: "/master-entry", key: "masterEntry", icon: Keyboard },
  { to: "/fabrication", key: "fabrication", icon: Factory },
  { to: "/cutting-lots", key: "cuttingLots", icon: Scissors },
  { to: "/cutting", key: "cutting", icon: Scissors },
  { to: "/pouch", key: "pouch", icon: Package },
  { to: "/stretching", key: "stretching", icon: Ruler },
  { to: "/pichiru", key: "pichiru", icon: BarChart3 },
] as const;

export default function Home() {
  const { t } = useTranslation();
  const { data: settings } = useSettings();
  const { data: lots } = useCuttingLotsList();

  return (
    <div className="space-y-8">
      <PageTitle
        title={`${t("home.welcome")}${settings?.companyName ? " · " + settings.companyName : ""}`}
        subtitle={t("app.tagline")}
      />

      <div>
        <p className="text-sm font-medium text-muted-foreground mb-3">
          {t("home.quickEntry")}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {QUICK.map((q) => (
            <Link key={q.to} to={q.to}>
              <Card className="hover:border-primary transition-colors">
                <CardContent className="pt-6 flex flex-col items-center gap-3 text-center">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <q.icon className="h-6 w-6" />
                  </div>
                  <span className="font-medium">{t(`nav.${q.key}`)}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-muted-foreground">
            {t("home.recentLots")}
          </p>
          <Link
            to="/analytics"
            className="text-sm text-primary flex items-center gap-1 hover:underline"
          >
            <BarChart3 className="h-4 w-4" />
            {t("home.openAnalytics")}
          </Link>
        </div>
        <Card>
          <CardContent className="pt-5">
            {lots?.length ? (
              <ul className="divide-y divide-border">
                {lots.slice(0, 8).map((l) => (
                  <li key={l.id}>
                    <Link
                      to="/analytics"
                      className="flex items-center justify-between py-3 group"
                    >
                      <span className="font-medium">{l.cuttingLotNumber}</span>
                      <span className="text-muted-foreground text-sm flex items-center gap-2">
                        {new Date(l.createdAt).toLocaleDateString()}
                        <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground py-2">{t("common.noData")}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
