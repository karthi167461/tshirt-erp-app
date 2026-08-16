import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { BarChart3, CheckCircle2, ChevronLeft, ChevronRight, Factory } from "lucide-react";
import { weekStartOf, weekEndOf, type WeekGroup } from "@erp/shared";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  Progress,
} from "@/components/ui";
import {
  useCuttingLotAnalytics,
  useFabricationAnalytics,
  useFabricationLotsPaged,
  useWeekAnalytics,
} from "@/lib/data";
import { PageTitle, SearchBox, Pagination } from "@/pages/_parts";
import { BarChart, type BarChartGroup } from "@/components/BarChart";
import { todayIso, addDaysIso, fmtQty, fmtQtyCompact } from "@/lib/utils";
import type { ColorAnalytics, FabricationAnalytics, LotAnalytics, StageProgress } from "@erp/shared";

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
                <StageRow
                  key={s.typeId}
                  label={s.stepOrder ? `${s.stepOrder}. ${s.typeName}` : s.typeName}
                  p={s}
                />
              ))}
              {!usedStretching.length && (
                <p className="text-sm text-muted-foreground">{t("analytics.notStarted")}</p>
              )}
            </div>
            <div className="space-y-3 pt-2 border-t border-border">
              {c.kainoolSkipped ? (
                <p className="text-xs text-muted-foreground">{t("analytics.kainoolSkippedHint")}</p>
              ) : (
                <StageRow label={t("section.pichiru")} p={c.pichiru} />
              )}
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
        {!data.shortFlow && !data.kainoolSkipped && (
          <Cell label={t("section.pichiru")} value={totals.pichiru} />
        )}
        <Cell label={t("section.packing")} value={totals.packing} />
        {!data.shortFlow &&
          totals.stretching.map((s) => <Cell key={s.typeId} label={s.typeName} value={s.done} />)}
      </CardContent>
    </Card>
  );
}

/** Step 1 of the drill-down: server-side search over fabrication lots. */
function FabLotSearch({ onSelect }: { onSelect: (id: number) => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data: list } = useFabricationLotsPaged({ search, page, pageSize: 10 });

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Factory className="h-4 w-4" />
          {t("analytics.searchFabLot")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("analytics.selectFabLotHint")}</p>
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder={t("analytics.searchFabLot")}
        />
        <div className="divide-y divide-border">
          {list?.items.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => onSelect(l.id)}
              className="w-full flex items-center justify-between gap-3 py-2.5 text-left hover:bg-muted px-2 -mx-2 rounded-md"
            >
              <span className="font-medium">{l.lotNumber}</span>
              <span className="flex items-center gap-2 shrink-0">
                {l.type !== "own" && <Badge tone="muted">{t(`fabType.${l.type}`)}</Badge>}
                <Badge tone={l.status === "ready" ? "success" : "muted"}>
                  {t(`fabStatus.${l.status}`)}
                </Badge>
              </span>
            </button>
          ))}
          {list && !list.items.length && (
            <p className="text-muted-foreground py-2 text-sm">{t("common.noData")}</p>
          )}
        </div>
        {list && (
          <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={setPage} />
        )}
      </CardContent>
    </Card>
  );
}

/** Step 2: the selected fabrication lot — details, roll totals, its cutting lots. */
function FabSummaryCard({ fab, onChange }: { fab: FabricationAnalytics; onChange: () => void }) {
  const { t } = useTranslation();
  const Cell = ({ label, value }: { label: string; value: string }) => (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          {fab.lotNumber}
          {fab.type !== "own" && <Badge tone="muted">{t(`fabType.${fab.type}`)}</Badge>}
          <Badge tone={fab.status === "ready" ? "success" : "muted"}>
            {t(`fabStatus.${fab.status}`)}
          </Badge>
        </CardTitle>
        <Button size="sm" variant="outline" onClick={onChange}>
          {t("analytics.changeLot")}
        </Button>
      </CardHeader>
      <CardContent className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        <Cell label={t("fabrication.rollCount")} value={String(fab.totals.rollCount)} />
        <Cell label={t("analytics.greigeWeight")} value={String(fab.totals.greigeWeight)} />
        <Cell label={t("fabrication.stage1")} value={String(fab.totals.fabricationWeight)} />
        <Cell label={t("fabrication.stage2")} value={String(fab.totals.dyeingWeight)} />
      </CardContent>
    </Card>
  );
}

function FabCuttingLotsCard({
  fab,
  selectedId,
  onSelect,
}: {
  fab: FabricationAnalytics;
  selectedId: number | undefined;
  onSelect: (id: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("nav.cuttingLots")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {fab.cuttingLots.length > 0 && (
          <p className="text-xs text-muted-foreground">{t("analytics.tapLotHint")}</p>
        )}
        <div className="divide-y divide-border">
          {fab.cuttingLots.map((cl) => {
            const on = cl.id === selectedId;
            return (
              <button
                key={cl.id}
                type="button"
                onClick={() => onSelect(cl.id)}
                aria-pressed={on}
                className={
                  "w-full py-2.5 px-2 -mx-2 rounded-md text-left transition-colors " +
                  (on ? "bg-primary/10" : "hover:bg-muted")
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={"truncate " + (on ? "font-semibold" : "font-medium")}>
                    {cl.cuttingLotNumber}
                    <span className="text-muted-foreground font-normal text-sm ml-2">
                      · {cl.categoryName}/{cl.sizeName} · {t("fabrication.dia")} {cl.dia}
                      {cl.stretchingFlowName ? ` · ${cl.stretchingFlowName}` : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0 text-sm tabular-nums">
                    <span className="text-muted-foreground">
                      {t("analytics.cut")} {fmtQty(t, cl.cut)} · {t("analytics.packed")}{" "}
                      {fmtQty(t, cl.packed)}
                    </span>
                    <Badge tone={cl.status === "completed" ? "muted" : "success"}>
                      {cl.status === "completed"
                        ? t("cuttingLot.statusCompleted")
                        : t("cuttingLot.statusActive")}
                    </Badge>
                  </span>
                </div>
                <Progress
                  className="mt-1.5"
                  value={cl.cut > 0 ? (cl.packed / cl.cut) * 100 : 0}
                />
              </button>
            );
          })}
          {!fab.cuttingLots.length && (
            <p className="text-muted-foreground py-2 text-sm">{t("analytics.noCuttingLots")}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Stage totals for the bar chart, in pipeline order; flow lots order their
 *  stretching bars by step position (totals.stretching is first-seen order). */
function stageChartGroups(data: LotAnalytics, t: TFunction): BarChartGroup[] {
  const groups: BarChartGroup[] = [
    { label: t("analytics.totalDozen"), values: [data.totals.quota] },
  ];
  if (data.shortFlow) {
    groups.push({ label: t("section.packing"), values: [data.totals.packing] });
    return groups;
  }
  groups.push({ label: t("section.pouch"), values: [data.totals.pouch] });
  const pos = new Map((data.flow?.steps ?? []).map((s) => [s.typeId, s.position]));
  const stretching = [...data.totals.stretching].sort(
    (a, b) => (pos.get(a.typeId) ?? 999) - (pos.get(b.typeId) ?? 999)
  );
  for (const s of stretching) {
    const p = pos.get(s.typeId);
    groups.push({ label: p ? `${p}. ${s.typeName}` : s.typeName, values: [s.done] });
  }
  if (!data.kainoolSkipped) {
    groups.push({ label: t("section.pichiru"), values: [data.totals.pichiru] });
  }
  groups.push({ label: t("section.packing"), values: [data.totals.packing] });
  return groups;
}

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const [fabLotId, setFabLotId] = useState<number>();
  const [cuttingLotId, setCuttingLotId] = useState<number>();
  const { data: fab, isLoading: fabLoading } = useFabricationAnalytics(fabLotId);
  const { data, isLoading } = useCuttingLotAnalytics(cuttingLotId);

  function selectFabLot(id: number) {
    setFabLotId(id);
    setCuttingLotId(undefined);
  }

  return (
    <div className="space-y-6">
      <PageTitle icon={BarChart3} title={t("analytics.title")} />

      <div>
        <p className="text-sm font-medium text-muted-foreground mb-3">{t("analytics.weekProgress")}</p>
        <WeekView />
      </div>

      {!fabLotId && <FabLotSearch onSelect={selectFabLot} />}

      {fabLotId && fabLoading && <p className="text-muted-foreground">{t("common.loading")}</p>}

      {fab && (
        <div className="space-y-4">
          <FabSummaryCard
            fab={fab}
            onChange={() => {
              setFabLotId(undefined);
              setCuttingLotId(undefined);
            }}
          />
          <FabCuttingLotsCard fab={fab} selectedId={cuttingLotId} onSelect={setCuttingLotId} />
          {fab.cuttingLots.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("analytics.cutVsPacked")}</CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart
                  variant="meter"
                  groups={fab.cuttingLots.map((cl) => ({
                    label: cl.cuttingLotNumber,
                    values: [cl.cut, cl.packed],
                  }))}
                  meterLabels={[t("analytics.cut"), t("analytics.packed")]}
                  formatValue={(v) => fmtQtyCompact(t, v)}
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {isLoading && <p className="text-muted-foreground">{t("common.loading")}</p>}

      {data && (
        <div className="space-y-3">
          <LotTotalsCard data={data} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("analytics.stageTotals")}</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart groups={stageChartGroups(data, t)} formatValue={(v) => fmtQtyCompact(t, v)} />
            </CardContent>
          </Card>
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
