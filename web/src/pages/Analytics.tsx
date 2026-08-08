import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BarChart3, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { weekStartOf, weekEndOf, type WeekGroup } from "@erp/shared";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  Field,
  Badge,
  Button,
  Progress,
} from "@/components/ui";
import { useCuttingLotsList, useCuttingLotAnalytics, useWeekAnalytics } from "@/lib/data";
import { PageTitle } from "@/pages/_parts";
import { todayIso, addDaysIso, fmtQty } from "@/lib/utils";
import type { ColorAnalytics, LotAnalytics, StageProgress } from "@erp/shared";

function WeekGroupCard({ title, group }: { title: string; group: WeekGroup }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        <div className="flex gap-2">
          <Badge tone="success">{t("analytics.completed")} {group.completed}</Badge>
          <Badge tone="muted">{t("analytics.inProgress")} {group.inProgress}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border">
          {group.lots.map((l) => (
            <div key={l.id} className="flex items-center justify-between py-1.5 text-sm">
              <span className="font-medium">{l.number}</span>
              <Badge tone={l.completed ? "success" : "muted"}>{l.status}</Badge>
            </div>
          ))}
          {!group.lots.length && <p className="text-muted-foreground text-sm py-1.5">{t("common.noData")}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function WeekView() {
  const { t } = useTranslation();
  const [dateInWeek, setDateInWeek] = useState(todayIso());
  const { data } = useWeekAnalytics(dateInWeek);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 max-w-sm">
        <Button variant="outline" size="icon" onClick={() => setDateInWeek(addDaysIso(dateInWeek, -7))} aria-label={t("salary.prevWeek")}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 text-center text-sm rounded-md border border-input bg-card py-2 tabular-nums">
          {weekStartOf(dateInWeek)} → {weekEndOf(dateInWeek)}
        </div>
        <Button variant="outline" size="icon" onClick={() => setDateInWeek(addDaysIso(dateInWeek, 7))} aria-label={t("salary.nextWeek")}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {data && (
        <div className="grid gap-4 md:grid-cols-2">
          <WeekGroupCard title={t("nav.fabrication")} group={data.fabrication} />
          <WeekGroupCard title={t("nav.cuttingLots")} group={data.cutting} />
        </div>
      )}
    </div>
  );
}

/**
 * One stage against its OWN ceiling (pouch vs cutting, stretching vs pouch, …),
 * so a stage that has caught up with whatever feeds it reads 100%. A zero
 * ceiling means upstream hasn't started — that is not "0% done", so it gets a
 * plain "not started" rather than a misleading empty bar.
 */
function StageRow({ label, p, note }: { label: string; p: StageProgress; note?: string }) {
  const { t } = useTranslation();
  const started = p.ceiling > 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm gap-2">
        <span className="font-medium flex items-center gap-1.5">
          {label}
          {p.complete && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-label={t("analytics.stageComplete")} />}
        </span>
        <span className="text-muted-foreground tabular-nums shrink-0">
          {started ? (
            <>
              {fmtQty(t, p.done)} / {fmtQty(t, p.ceiling)} ({p.percent}%)
            </>
          ) : (
            (note ?? t("analytics.notStarted"))
          )}
        </span>
      </div>
      <Progress value={p.percent} />
    </div>
  );
}

function ColorCard({ c }: { c: ColorAnalytics }) {
  const { t } = useTranslation();
  // Only the types actually applied to this lot are shown — the master list
  // holds category-specific types and rendering all 11 buries the real work.
  const usedStretching = c.stretching.filter((s) => s.used);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <span
            className="h-4 w-4 rounded-full border border-border"
            style={{ background: c.color.toLowerCase() }}
          />
          {c.color}
          <span className="text-muted-foreground font-normal text-sm">
            · {t("common.quota")} {fmtQty(t, c.quota)}
          </span>
        </CardTitle>
        {c.completed ? (
          <Badge tone="success">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            {t("analytics.completed")}
          </Badge>
        ) : c.allStagesComplete ? (
          <Badge tone="success">{t("analytics.allStagesComplete")}</Badge>
        ) : (
          <Badge tone="muted">{t("analytics.inProgress")}</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {c.shortFlow ? (
          <>
            <p className="text-xs text-muted-foreground">{t("analytics.shortFlowHint")}</p>
            <StageRow label={t("section.packing")} p={c.packing} />
          </>
        ) : (
          <>
            <StageRow label={t("section.pouch")} p={c.pouch} />
            <div className="space-y-3 pt-2 border-t border-border">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("section.stretching")}
              </p>
              {usedStretching.map((s) => (
                <StageRow key={s.typeId} label={s.typeName} p={s} />
              ))}
              {!usedStretching.length && (
                <p className="text-sm text-muted-foreground">{t("analytics.notStarted")}</p>
              )}
            </div>
            <div className="space-y-3 pt-2 border-t border-border">
              <StageRow label={t("section.pichiru")} p={c.pichiru} />
              <StageRow label={t("section.packing")} p={c.packing} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Roll-up across every colour of the selected lot, in dz/pcs. */
function LotTotalsCard({ data }: { data: LotAnalytics }) {
  const { t } = useTranslation();
  const { totals } = data;
  const Cell = ({ label, value }: { label: string; value: number }) => (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">{fmtQty(t, value)}</p>
    </div>
  );
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{t("analytics.lotTotals")}</CardTitle>
        <Badge tone={totals.colorsComplete === totals.colorsTotal && totals.colorsTotal > 0 ? "success" : "muted"}>
          {t("analytics.colorsComplete", { done: totals.colorsComplete, total: totals.colorsTotal })}
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        <Cell label={t("analytics.totalDozen")} value={totals.quota} />
        {!data.shortFlow && <Cell label={t("section.pouch")} value={totals.pouch} />}
        {!data.shortFlow && <Cell label={t("section.pichiru")} value={totals.pichiru} />}
        <Cell label={t("section.packing")} value={totals.packing} />
        {!data.shortFlow &&
          totals.stretching.map((s) => <Cell key={s.typeId} label={s.typeName} value={s.done} />)}
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const { data: lots } = useCuttingLotsList();
  const [cuttingLotId, setCuttingLotId] = useState("");
  const { data, isLoading } = useCuttingLotAnalytics(cuttingLotId ? Number(cuttingLotId) : undefined);

  return (
    <div className="space-y-6">
      <PageTitle icon={BarChart3} title={t("analytics.title")} />

      <div>
        <p className="text-sm font-medium text-muted-foreground mb-3">{t("analytics.weekProgress")}</p>
        <WeekView />
      </div>

      <Card className="max-w-md">
        <CardContent className="pt-5">
          <Field label={t("analytics.byLot")} hint={t("analytics.selectLot")}>
            <Select value={cuttingLotId} onChange={(e) => setCuttingLotId(e.target.value)}>
              <option value="">{t("cuttingLot.select")}</option>
              {lots?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.cuttingLotNumber} · {l.fabricationLotNumber}
                </option>
              ))}
            </Select>
          </Field>
        </CardContent>
      </Card>

      {isLoading && <p className="text-muted-foreground">{t("common.loading")}</p>}

      {data && (
        <div className="space-y-3">
          <LotTotalsCard data={data} />
          <p className="text-sm text-muted-foreground">{t("analytics.colorProgress")}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {data.colors.map((c) => (
              <ColorCard key={c.color} c={c} />
            ))}
          </div>
          {data.colors.length === 0 && (
            <p className="text-muted-foreground">{t("common.noData")}</p>
          )}
        </div>
      )}
    </div>
  );
}
