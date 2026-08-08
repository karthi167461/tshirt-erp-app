import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Keyboard, ScanLine, Plus } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
  Field,
  Badge,
  Button,
  MultiSelectChips,
} from "@/components/ui";
import {
  useEmployees,
  useActiveCuttingLots,
  useStretchingTypes,
  useCuttingLotColors,
  useMasterColors,
  useCategories,
  useSizes,
  useReadyFabricationLots,
  useFabricationLot,
  useLotColorQuotas,
  useDiaSizeLinks,
  useInvalidateEntries,
  resolveDia,
} from "@/lib/data";
import { api } from "@/lib/api";
import { toastError } from "@/lib/notify";
import { todayIso, fmtQty, blockDecimal, clampPieces } from "@/lib/utils";
import { PageTitle } from "@/pages/_parts";
import { EntryLog } from "@/components/EntryLog";
import { useNumpadNav } from "@/hooks/useNumpadNav";
import { useBarcodeScanner, type ScanHit } from "@/hooks/useBarcodeScanner";
import { NUMPAD } from "@/lib/keyboard";
import { encodeBarcode, SHORT_FLOW_TYPES } from "@erp/shared";

/* -------------------------------------------------------------------------- *
 * Master Entry — all six entry forms on one screen, driven from the numpad.
 *
 * Only the ACTIVE panel is mounted. That keeps exactly one <form> in the DOM
 * (so Numpad Enter is unambiguous and forms never nest), keeps the tab ring
 * small, and avoids firing a quota request for every colour of every stage —
 * useQuotaInfo costs one round trip per (colour × stage).
 * -------------------------------------------------------------------------- */

type EntryStage = "cutting" | "pouch" | "stretching" | "pichiru" | "packing";
const PANELS = ["lotCreate", "cutting", "pouch", "stretching", "pichiru", "packing"] as const;
type Panel = (typeof PANELS)[number];

interface Draft {
  colors: string[];
  dozen: string;
  pieces: string;
  stretchingTypeId: string;
}
const emptyDraft = (): Draft => ({ colors: [], dozen: "", pieces: "", stretchingTypeId: "" });

/** Elements in the numpad focus ring: panel fields plus every colour chip. */
const RING_SELECTOR = '[data-ring], [role="group"] button';

export default function MasterEntryPage() {
  const { t } = useTranslation();
  const invalidate = useInvalidateEntries();

  const [active, setActive] = useState<Panel>("lotCreate");
  // Shared across panels on purpose: switching stage must not make the operator
  // re-pick the lot, the worker and the date.
  const [cuttingLotId, setCuttingLotId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(todayIso());
  // Drafts live here so unmounting a panel never loses typed work.
  const [drafts, setDrafts] = useState<Record<EntryStage, Draft>>({
    cutting: emptyDraft(),
    pouch: emptyDraft(),
    stretching: emptyDraft(),
    pichiru: emptyDraft(),
    packing: emptyDraft(),
  });
  const [lastScan, setLastScan] = useState<string | null>(null);

  const { data: lots } = useActiveCuttingLots();
  const { data: employees } = useEmployees(true);
  // Also read by the panels — react-query dedupes on the shared key, so these
  // cost nothing extra and let a scan be resolved without reaching into a child.
  const { data: masterColors } = useMasterColors(true);
  const { data: stretchingTypes } = useStretchingTypes(true);
  const { data: lotColors } = useCuttingLotColors(cuttingLotId ? Number(cuttingLotId) : undefined);

  const formRef = useRef<HTMLFormElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const setDraft = useCallback((stage: EntryStage, patch: Partial<Draft>) => {
    setDrafts((d) => ({ ...d, [stage]: { ...d[stage], ...patch } }));
  }, []);

  /** Changing the lot invalidates every downstream colour selection: those
   *  colours come from the lot's own cutting entries, not the master list. */
  const selectLot = useCallback((id: string) => {
    setCuttingLotId(id);
    setDrafts((d) => {
      const next = { ...d };
      for (const s of Object.keys(next) as EntryStage[]) next[s] = { ...next[s], colors: [] };
      return next;
    });
  }, []);

  /* ----------------------------- barcode ----------------------------- */
  const onScan = useCallback(
    (hit: ScanHit) => {
      if (hit.kind === "cuttingLot") {
        const lot = lots?.find((l) => l.id === hit.id);
        if (!lot) return toast.error(t("scan.lotNotFound"));
        selectLot(String(lot.id));
        setLastScan(lot.cuttingLotNumber);
        toast.success(t("scan.lotSelected", { lot: lot.cuttingLotNumber }));
        return;
      }

      if (hit.kind === "employee") {
        const emp = employees?.find((e) => e.id === hit.id);
        if (!emp) return toast.error(t("scan.employeeNotFound"));
        setEmployeeId(String(emp.id));
        setLastScan(emp.name);
        toast.success(t("scan.employeeSelected", { name: emp.name }));
        return;
      }

      if (hit.kind === "stretchingType") {
        const ty = stretchingTypes?.find((x) => x.id === hit.id);
        if (!ty) return toast.error(t("scan.typeNotFound"));
        setDrafts((d) => ({ ...d, stretching: { ...d.stretching, stretchingTypeId: String(ty.id) } }));
        setLastScan(ty.name);
        // A stretching-type label is only meaningful on the stretching panel, so
        // scanning one is a statement of intent — go there rather than setting a
        // value the operator can't see.
        setActive("stretching");
        toast.success(t("scan.typeSelected", { name: ty.name }));
        return;
      }

      // Colour — toggles the chip on whichever entry panel is open.
      const col = masterColors?.find((c) => c.id === hit.id);
      if (!col) return toast.error(t("scan.colorNotFound"));
      if (active === "lotCreate") return toast.info(t("scan.colorNeedsStage"));
      const stage = active as EntryStage;
      if (!cuttingLotId) return toast.error(t("scan.colorNeedsLot"));
      // Downstream stages may only use colours the lot was actually cut in.
      const allowed =
        stage === "cutting" ? (masterColors ?? []).map((c) => c.name) : (lotColors ?? []);
      if (!allowed.includes(col.name)) return toast.error(t("scan.colorNotAvailable", { name: col.name }));

      // Toggle, so re-scanning a colour removes it. The state write stays a
      // functional update, but the toast is decided out here — an updater can be
      // invoked more than once and would fire the toast twice.
      const on = drafts[stage].colors.includes(col.name);
      setDrafts((d) => ({
        ...d,
        [stage]: {
          ...d[stage],
          colors: on
            ? d[stage].colors.filter((c) => c !== col.name)
            : [...d[stage].colors.filter((c) => c !== col.name), col.name],
        },
      }));
      setLastScan(col.name);
      toast.success(t(on ? "scan.colorRemoved" : "scan.colorAdded", { name: col.name }));
    },
    [lots, employees, masterColors, stretchingTypes, lotColors, active, cuttingLotId, drafts, selectLot, t]
  );

  const { scanBoxProps, focusScanBox } = useBarcodeScanner(onScan, {
    onUnrecognised: () => toast.info(t("scan.unknown")),
  });

  /* --------------------------- numpad wiring --------------------------- */
  const ringElements = () =>
    Array.from(panelRef.current?.querySelectorAll<HTMLElement>(RING_SELECTOR) ?? []);

  const step = useCallback((delta: number) => {
    const els = ringElements();
    if (!els.length) return;
    const i = els.indexOf(document.activeElement as HTMLElement);
    const next = els[(i + delta + els.length) % els.length];
    next?.focus();
    if (next instanceof HTMLInputElement) next.select();
  }, []);

  useNumpadNav(true, {
    onPanel: (i) => setActive(PANELS[i]),
    onSave: () => formRef.current?.requestSubmit(),
    onNextField: () => step(1),
    onPrevField: () => step(-1),
    onNextGroup: () => {
      // Jump clear of the colour chips instead of walking them one by one.
      const els = ringElements();
      const i = els.indexOf(document.activeElement as HTMLElement);
      const rest = els.slice(i + 1).find((el) => !el.closest('[role="group"]'));
      (rest ?? els[0])?.focus();
    },
    onToggle: () => {
      const el = document.activeElement;
      if (el instanceof HTMLElement && el.closest('[role="group"]')) el.click();
    },
    onCommand: focusScanBox,
  });

  const afterSave = useCallback(() => {
    invalidate();
    focusScanBox();
  }, [invalidate, focusScanBox]);

  const lot = lots?.find((l) => String(l.id) === cuttingLotId);
  const employee = employees?.find((e) => String(e.id) === employeeId);

  return (
    <div className="space-y-4">
      <PageTitle icon={Keyboard} title={t("masterEntry.title")} subtitle={t("masterEntry.subtitle")} />

      {/* Scan bar — the fastest way to set the lot and the worker. */}
      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="relative flex-1">
              <ScanLine className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input {...scanBoxProps} className="pl-9" placeholder={t("scan.placeholder")} aria-label={t("scan.label")} />
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge tone={lot ? "success" : "muted"}>
                {t("masterEntry.currentLot")}: {lot ? lot.cuttingLotNumber : t("masterEntry.noLot")}
              </Badge>
              <Badge tone={employee ? "success" : "muted"}>
                {t("masterEntry.currentEmployee")}: {employee ? employee.name : "—"}
              </Badge>
              {lastScan && <Badge tone="default">{lastScan}</Badge>}
            </div>
          </div>
          <ShortcutLegend />
        </CardContent>
      </Card>

      {/* Panel tabs — click, or Numpad 1-6 */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("masterEntry.title")}>
        {PANELS.map((p, i) => (
          <button
            key={p}
            role="tab"
            aria-selected={active === p}
            onClick={() => setActive(p)}
            className={
              "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 " +
              (active === p
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-input bg-card hover:bg-muted")
            }
          >
            <span className="tabular-nums opacity-70">{i + 1}</span>
            {t(`masterEntry.panel_${p}`)}
          </button>
        ))}
      </div>

      <div ref={panelRef}>
        {active === "lotCreate" ? (
          <LotCreatePanel formRef={formRef} onSaved={afterSave} />
        ) : (
          <EntryPanel
            key={active}
            stage={active as EntryStage}
            formRef={formRef}
            cuttingLotId={cuttingLotId}
            onCuttingLot={selectLot}
            employeeId={employeeId}
            onEmployee={setEmployeeId}
            date={date}
            onDate={setDate}
            draft={drafts[active as EntryStage]}
            onDraft={(patch) => setDraft(active as EntryStage, patch)}
            onSaved={afterSave}
          />
        )}
      </div>
    </div>
  );
}

function ShortcutLegend() {
  const { t } = useTranslation();
  const items = [
    ["1–6", t("masterEntry.keyPanel")],
    ["Enter", t("masterEntry.keySave")],
    ["+ / −", t("masterEntry.keyNextPrev")],
    ["*", t("masterEntry.keyGroup")],
    [".", t("masterEntry.keyToggle")],
    ["/", t("masterEntry.keyCommand")],
  ] as const;
  return (
    <p className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
      <span className="font-medium">{t("masterEntry.shortcuts")}:</span>
      {items.map(([k, label]) => (
        <span key={k}>
          <kbd className="rounded border border-border bg-muted px-1 font-mono">{k}</kbd> {label}
        </span>
      ))}
    </p>
  );
}

/* -------------------------------------------------------------------------- *
 * Panel 1 — create a cutting lot (with the dia → category/size hint)
 * -------------------------------------------------------------------------- */
function LotCreatePanel({
  formRef,
  onSaved,
}: {
  formRef: React.RefObject<HTMLFormElement>;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { data: readyLots } = useReadyFabricationLots();
  const { data: categories } = useCategories(true);
  const { data: diaLinks } = useDiaSizeLinks();

  const [cuttingLotNumber, setCuttingLotNumber] = useState("");
  const [fabricationLotId, setFabricationLotId] = useState("");
  const [dia, setDia] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sizeId, setSizeId] = useState("");
  const [autoFilled, setAutoFilled] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: fabLot } = useFabricationLot(fabricationLotId ? Number(fabricationLotId) : undefined);
  const dias = Array.from(new Set((fabLot?.rolls ?? []).map((r) => r.dia)));
  const { data: sizes } = useSizes(categoryId ? Number(categoryId) : undefined, true);

  const resolved = resolveDia(diaLinks, dia);
  const narrowed = resolved.matches.length > 0;

  function pickDia(value: string) {
    setDia(value);
    setShowAll(false);
    const r = resolveDia(diaLinks, value);
    if (r.exact) {
      setCategoryId(String(r.exact.categoryId));
      setSizeId(String(r.exact.sizeId));
      setAutoFilled(true);
      return;
    }
    setAutoFilled(false);
    const keep = categoryId && r.categoryIds.includes(Number(categoryId));
    if (!keep) setCategoryId(r.categoryIds.length === 1 ? String(r.categoryIds[0]) : "");
    setSizeId("");
  }

  // Narrowing is a default, never a cage: a dia's links may not cover the case
  // in front of the operator, and this is the screen they use all day.
  const categoryOptions =
    narrowed && !showAll
      ? categories?.filter((c) => resolved.categoryIds.includes(c.id))
      : categories;
  const linkedSizeIds = categoryId ? resolved.sizeIdsFor(Number(categoryId)) : [];
  const sizeOptions =
    narrowed && !showAll && linkedSizeIds.length
      ? sizes?.filter((s) => linkedSizeIds.includes(s.id))
      : sizes;

  const canSave = !!(cuttingLotNumber.trim() && fabricationLotId && dia && categoryId && sizeId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await api.post("/api/cutting-lots", {
        cuttingLotNumber: cuttingLotNumber.trim(),
        fabricationLotId: Number(fabricationLotId),
        dia,
        categoryId: Number(categoryId),
        sizeId: Number(sizeId),
      });
      toast.success(t("toast.saved"));
      setCuttingLotNumber("");
      setDia("");
      setAutoFilled(false);
      onSaved();
    } catch (err) {
      toastError(err, t);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>{t("masterEntry.panel_lotCreate")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={submit} className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
          <Field label={t("cuttingLot.number")}>
            <Input data-ring value={cuttingLotNumber} onChange={(e) => setCuttingLotNumber(e.target.value)} placeholder="CUT-1001" />
          </Field>
          <Field label={t("cuttingLot.fabricationLot")}>
            <Select data-ring value={fabricationLotId} onChange={(e) => { setFabricationLotId(e.target.value); setDia(""); }}>
              <option value="">{t("cuttingLot.selectFabrication")}</option>
              {readyLots?.map((l) => <option key={l.id} value={l.id}>{l.lotNumber}</option>)}
            </Select>
          </Field>
          <Field label={t("fabrication.dia")}>
            <Select data-ring value={dia} onChange={(e) => pickDia(e.target.value)} disabled={!fabricationLotId}>
              <option value="">{t("cuttingLot.selectDia")}</option>
              {dias.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </Field>
          <Field
            label={t("settings.categories")}
            hint={narrowed && !showAll ? t("cuttingLot.diaNarrowed") : undefined}
          >
            <Select data-ring value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSizeId(""); setAutoFilled(false); }}>
              <option value="">{t("cuttingLot.selectCategory")}</option>
              {categoryOptions?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label={t("settings.sizeName")} hint={autoFilled ? t("cuttingLot.diaAutoFilled") : undefined}>
            <Select data-ring value={sizeId} onChange={(e) => { setSizeId(e.target.value); setAutoFilled(false); }} disabled={!categoryId}>
              <option value="">{t("cuttingLot.selectSize")}</option>
              {sizeOptions?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          {narrowed && (
            <div className="col-span-2 sm:col-span-3 -mt-1">
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? t("cuttingLot.diaShowLinked") : t("cuttingLot.diaShowAll")}
              </button>
            </div>
          )}
          <div className="col-span-2 sm:col-span-3">
            <Button data-ring type="submit" disabled={!canSave || saving}>
              <Plus className="h-4 w-4" />
              {t("cuttingLot.create")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- *
 * Panels 2-6 — the five stage entries
 * -------------------------------------------------------------------------- */
/**
 * Whole-lot standing: every colour the lot was cut in, with what is left to do
 * at the open stage. Shown as soon as a lot is picked — before any colour is
 * selected — so the operator can see where the work is rather than having to
 * guess and check. One request for the lot, not one per colour.
 */
function LotColorSummary({
  cuttingLotId,
  stage,
  stretchingTypeId,
  selected,
  onToggle,
}: {
  cuttingLotId: number;
  stage: EntryStage;
  stretchingTypeId?: number;
  selected: string[];
  onToggle: (color: string) => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading } = useLotColorQuotas({ cuttingLotId, stage, stretchingTypeId });

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (!data?.length) return <p className="text-sm text-muted-foreground">{t("form.noColors")}</p>;

  return (
    <div className="rounded-md border border-border bg-muted/40 divide-y divide-border">
      {data.map((c) => {
        const on = selected.includes(c.color);
        // A zero ceiling is NOT "finished" — it means the stage feeding this one
        // hasn't produced anything yet, so there is nothing to enter against.
        // Only a ceiling that exists and has been consumed counts as done.
        const blocked = c.ceiling !== null && c.ceiling <= 0;
        const done = !blocked && c.remaining !== null && c.remaining <= 0;
        return (
          <button
            key={c.color}
            type="button"
            onClick={() => onToggle(c.color)}
            className={
              "w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors " +
              (on ? "bg-primary/10" : "hover:bg-muted")
            }
            aria-pressed={on}
          >
            <span className="flex items-center gap-2 min-w-0">
              <span
                className="h-3.5 w-3.5 rounded-full border border-border shrink-0"
                style={{ background: c.color.toLowerCase() }}
              />
              <span className={on ? "font-semibold" : "font-medium"}>{c.color}</span>
            </span>
            <span className="flex items-center gap-2 shrink-0 tabular-nums">
              {c.remaining === null ? (
                <span className="text-muted-foreground text-xs">
                  {t("masterEntry.cutSoFar")} {fmtQty(t, c.used)}
                </span>
              ) : blocked ? (
                <Badge tone="muted">{t("analytics.notStarted")}</Badge>
              ) : (
                <>
                  <span className="text-muted-foreground text-xs">
                    {fmtQty(t, c.used)} / {fmtQty(t, c.ceiling ?? 0)}
                  </span>
                  <Badge tone={done ? "muted" : "success"}>
                    {done ? t("masterEntry.colorDone") : fmtQty(t, c.remaining)}
                  </Badge>
                </>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function EntryPanel({
  stage,
  formRef,
  cuttingLotId,
  onCuttingLot,
  employeeId,
  onEmployee,
  date,
  onDate,
  draft,
  onDraft,
  onSaved,
}: {
  stage: EntryStage;
  formRef: React.RefObject<HTMLFormElement>;
  cuttingLotId: string;
  onCuttingLot: (id: string) => void;
  employeeId: string;
  onEmployee: (id: string) => void;
  date: string;
  onDate: (d: string) => void;
  draft: Draft;
  onDraft: (patch: Partial<Draft>) => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const { data: employees } = useEmployees(true);
  const { data: lots } = useActiveCuttingLots();
  const { data: types } = useStretchingTypes(true);

  const isCutting = stage === "cutting";
  const needsType = stage === "stretching";
  const lotId = cuttingLotId ? Number(cuttingLotId) : undefined;

  // Cutting ESTABLISHES the quota, so it picks from the master colour list;
  // downstream stages may only use colours the lot was actually cut in.
  const { data: masterColors } = useMasterColors(true);
  const { data: lotColors } = useCuttingLotColors(isCutting ? undefined : lotId);
  const colorOptions = isCutting ? (masterColors ?? []).map((c) => c.name) : (lotColors ?? []);

  // Job-work-given-outside lots skip the middle stages entirely.
  const visibleLots = useMemo(
    () =>
      lots?.filter(
        (l) =>
          isCutting ||
          stage === "packing" ||
          !(SHORT_FLOW_TYPES as readonly string[]).includes(l.fabricationLot.type)
      ),
    [lots, isCutting, stage]
  );

  const reqQty = Number(draft.dozen || 0) + Number(draft.pieces || 0) / 12;
  const canSave =
    !!lotId && draft.colors.length > 0 && reqQty > 0 && !!employeeId && (!needsType || !!draft.stretchingTypeId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || !lotId || saving) return;
    setSaving(true);
    try {
      // One POST per colour — the server validates each against its own quota,
      // so a partial failure must keep the failed colours selected for retry.
      const results = await Promise.allSettled(
        draft.colors.map((color) => {
          const payload: Record<string, unknown> = {
            cuttingLotId: lotId,
            color,
            dozen: Number(draft.dozen || 0),
            employeeId: Number(employeeId),
            date,
          };
          if (draft.pieces) payload.pieces = Number(draft.pieces);
          if (needsType) payload.stretchingTypeId = Number(draft.stretchingTypeId);
          return api.post(`/api/${stage}`, payload);
        })
      );
      const failed = draft.colors.filter((_, i) => results[i].status === "rejected");
      const okCount = draft.colors.length - failed.length;

      if (failed.length === 0) {
        toast.success(t("toast.entriesSaved", { count: okCount }));
        onDraft({ dozen: "", pieces: "", colors: [] });
      } else if (okCount === 0) {
        toastError((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason, t);
      } else {
        toast.warning(t("toast.entriesPartial", { ok: okCount, colors: failed.join(", ") }));
        onDraft({ colors: failed });
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>{t(`section.${stage}`)}</CardTitle>
        </CardHeader>
        <CardContent>
          <form ref={formRef} onSubmit={submit} className="space-y-4">
            <Field label={t("cuttingLot.number")}>
              <Select data-ring value={cuttingLotId} onChange={(e) => onCuttingLot(e.target.value)}>
                <option value="">{t("cuttingLot.select")}</option>
                {visibleLots?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.cuttingLotNumber} · {l.fabricationLot.lotNumber} · {l.category.name}/{l.size.name}
                  </option>
                ))}
              </Select>
            </Field>

            {needsType && (
              <Field label={t("nav.stretching")}>
                <Select data-ring value={draft.stretchingTypeId} onChange={(e) => onDraft({ stretchingTypeId: e.target.value })}>
                  <option value="">{t("form.selectType")}</option>
                  {types?.map((ty) => <option key={ty.id} value={ty.id}>{ty.name}</option>)}
                </Select>
              </Field>
            )}

            <Field label={t("common.color")} hint={lotId ? t("form.selectColors") : undefined}>
              <MultiSelectChips
                options={colorOptions}
                selected={draft.colors}
                onChange={(colors) => onDraft({ colors })}
                disabled={!lotId}
                emptyLabel={lotId ? t("form.noColors") : t("form.selectColor")}
              />
            </Field>

            {lotId && (!needsType || draft.stretchingTypeId) && (
              <Field label={t("masterEntry.lotStanding")} hint={t("masterEntry.lotStandingHint")}>
                <LotColorSummary
                  cuttingLotId={lotId}
                  stage={stage}
                  stretchingTypeId={needsType ? Number(draft.stretchingTypeId) : undefined}
                  selected={draft.colors}
                  onToggle={(color) =>
                    onDraft({
                      colors: draft.colors.includes(color)
                        ? draft.colors.filter((c) => c !== color)
                        : [...draft.colors, color],
                    })
                  }
                />
              </Field>
            )}

            <div className="grid grid-cols-3 gap-3">
              <Field label={t("common.dozen")}>
                <Input
                  data-ring
                  type="number"
                  inputMode="numeric"
                  min={0}
                  autoComplete="off"
                  value={draft.dozen}
                  onKeyDown={blockDecimal}
                  onChange={(e) => onDraft({ dozen: e.target.value })}
                />
              </Field>
              <Field label={t("common.pieces")}>
                <Input
                  data-ring
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={11}
                  autoComplete="off"
                  value={draft.pieces}
                  onKeyDown={blockDecimal}
                  onChange={(e) => onDraft({ pieces: clampPieces(e.target.value) })}
                />
              </Field>
              <Field label={t("common.date")}>
                <Input data-ring type="date" value={date} onChange={(e) => onDate(e.target.value)} />
              </Field>
            </div>

            <Field label={t("common.employee")}>
              <Select data-ring value={employeeId} onChange={(e) => onEmployee(e.target.value)}>
                <option value="">{t("form.selectEmployee")}</option>
                {employees?.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} · {encodeBarcode("employee", emp.id)}
                  </option>
                ))}
              </Select>
            </Field>

            <Button data-ring type="submit" className="w-full" disabled={!canSave || saving}>
              {t("common.save")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <EntryLog stage={stage} cuttingLotId={lotId} onChanged={onSaved} />
    </div>
  );
}
