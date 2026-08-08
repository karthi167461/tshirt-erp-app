import type { LucideIcon } from "lucide-react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input, Button } from "@/components/ui";

export function PageTitle({
  icon: Icon,
  title,
  subtitle,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      {Icon && (
        <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative max-w-xs w-full">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        className="pl-8"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

/** Page controls + total count ("list by count"). */
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-3 pt-3 text-sm">
      <span className="text-muted-foreground">{t("common.totalCount", { n: total })}</span>
      <div className="flex items-center gap-2">
        <Button size="icon" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t("salary.prevWeek")}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="tabular-nums">{t("common.pageOf", { page, pages })}</span>
        <Button size="icon" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t("salary.nextWeek")}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
