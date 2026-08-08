import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Boxes, Plus, CheckCheck, ChevronRight, RotateCcw, Printer } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
  Button,
  Badge,
} from "@/components/ui";
import {
  useReadyFabricationLots,
  useFabricationLot,
  useCategories,
  useSizes,
  useCuttingLotsPaged,
  useDiaSizeLinks,
  resolveDia,
} from "@/lib/data";
import { api } from "@/lib/api";
import { toastError } from "@/lib/notify";
import { PageTitle, SearchBox, Pagination } from "@/pages/_parts";
import { PrintSheet } from "@/components/PrintSheet";
import { encodeBarcode } from "@erp/shared";

const PAGE_SIZE = 20;

export default function CuttingLotsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: readyLots } = useReadyFabricationLots();
  const { data: categories } = useCategories(true);

  const [cuttingLotNumber, setCuttingLotNumber] = useState("");
  const [fabricationLotId, setFabricationLotId] = useState("");
  const [dia, setDia] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sizeId, setSizeId] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: fabLot } = useFabricationLot(
    fabricationLotId ? Number(fabricationLotId) : undefined
  );
  const dias = Array.from(new Set((fabLot?.rolls ?? []).map((r) => r.dia)));
  const { data: sizes } = useSizes(categoryId ? Number(categoryId) : undefined, true);

  // --- dia → category/size hints (Settings-managed, always overridable) ---
  const { data: diaLinks } = useDiaSizeLinks();
  const [autoFilled, setAutoFilled] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const resolved = resolveDia(diaLinks, dia);
  const narrowed = resolved.matches.length > 0;

  /**
   * One link for this dia → fill category AND size. Several links (dia "80"
   * spans nine pairs in the live data) → fill nothing and narrow the pickers
   * instead, so the operator makes the choice the data can't make for them.
   */
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
    // Keep a still-valid category when narrowing; otherwise clear both.
    const keep = categoryId && r.categoryIds.includes(Number(categoryId));
    if (!keep) setCategoryId(r.categoryIds.length === 1 ? String(r.categoryIds[0]) : "");
    setSizeId("");
  }

  const categoryOptions =
    narrowed && !showAll
      ? categories?.filter((c) => resolved.categoryIds.includes(c.id))
      : categories;
  const linkedSizeIds = categoryId ? resolved.sizeIdsFor(Number(categoryId)) : [];
  const sizeOptions =
    narrowed && !showAll && linkedSizeIds.length
      ? sizes?.filter((s) => linkedSizeIds.includes(s.id))
      : sizes;

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"active" | "completed" | "all">("active");
  const { data: list } = useCuttingLotsPaged({
    search,
    page,
    pageSize: PAGE_SIZE,
    status: statusFilter === "all" ? undefined : statusFilter,
  });
  const [selected, setSelected] = useState<number[]>([]);
  const [printing, setPrinting] = useState(false);

  const allSelected = !!list?.items.length && list.items.every((l) => selected.includes(l.id));
  function toggleSelectAll() {
    if (!list) return;
    setSelected(allSelected ? [] : list.items.map((l) => l.id));
  }

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["cuttingLots"] });
    qc.invalidateQueries({ queryKey: ["activeCuttingLots"] });
  };

  const canSave =
    cuttingLotNumber.trim() && fabricationLotId && dia && categoryId && sizeId;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
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
      invalidate();
    } catch (err) {
      toastError(err, t);
    } finally {
      setSaving(false);
    }
  }

  function toggle(id: number) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function setStatus(completed: boolean) {
    if (!selected.length) return;
    try {
      await api.post("/api/cutting-lots/complete", { cuttingLotIds: selected, completed });
      toast.success(completed ? t("cuttingLot.completed") : t("cuttingLot.reverted"));
      setSelected([]);
      invalidate();
    } catch (err) {
      toastError(err, t);
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle icon={Boxes} title={t("cuttingLot.title")} subtitle={t("cuttingLot.subtitle")} />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{t("cuttingLot.new")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
            <Field label={t("cuttingLot.number")}>
              <Input value={cuttingLotNumber} onChange={(e) => setCuttingLotNumber(e.target.value)} placeholder="CUT-1001" />
            </Field>
            <Field label={t("cuttingLot.fabricationLot")}>
              <Select
                value={fabricationLotId}
                onChange={(e) => {
                  setFabricationLotId(e.target.value);
                  setDia("");
                }}
              >
                <option value="">{t("cuttingLot.selectFabrication")}</option>
                {readyLots?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.lotNumber}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("fabrication.dia")}>
              <Select value={dia} onChange={(e) => pickDia(e.target.value)} disabled={!fabricationLotId}>
                <option value="">{t("cuttingLot.selectDia")}</option>
                {dias.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={t("settings.categories")}
              hint={narrowed && !showAll ? t("cuttingLot.diaNarrowed") : undefined}
            >
              <Select
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setSizeId("");
                  setAutoFilled(false);
                }}
              >
                <option value="">{t("cuttingLot.selectCategory")}</option>
                {categoryOptions?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={t("settings.sizeName")}
              hint={autoFilled ? t("cuttingLot.diaAutoFilled") : undefined}
            >
              <Select
                value={sizeId}
                onChange={(e) => {
                  setSizeId(e.target.value);
                  setAutoFilled(false);
                }}
                disabled={!categoryId}
              >
                <option value="">{t("cuttingLot.selectSize")}</option>
                {sizeOptions?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
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
              <Button type="submit" disabled={!canSave || saving}>
                <Plus className="h-4 w-4" />
                {t("cuttingLot.create")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("cuttingLot.list")}</CardTitle>
          {selected.length > 0 && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setStatus(true)}>
                <CheckCheck className="h-4 w-4" />
                {t("cuttingLot.markCompleted")} ({selected.length})
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setStatus(false)}>
                <RotateCcw className="h-4 w-4" />
                {t("cuttingLot.revert")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPrinting(true)}>
                <Printer className="h-4 w-4" />
                {t("barcode.printSelected", { count: selected.length })}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Status tabs */}
          <div className="flex rounded-md border border-input overflow-hidden w-fit text-sm">
            {(["active", "completed", "all"] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setPage(1); setSelected([]); }}
                className={statusFilter === s ? "bg-primary text-primary-foreground px-3 py-1.5" : "px-3 py-1.5 hover:bg-muted"}
              >
                {t(`cuttingLot.tab_${s}`)}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={t("cuttingLot.search")} />
            {!!list?.items.length && (
              <Button size="sm" variant="ghost" onClick={toggleSelectAll}>
                {allSelected ? t("cuttingLot.clearAll") : t("cuttingLot.selectAll")}
              </Button>
            )}
          </div>
          <div className="divide-y divide-border">
            {list?.items.map((lot) => (
              <div key={lot.id} className="flex items-center gap-3 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={selected.includes(lot.id)}
                  onChange={() => toggle(lot.id)}
                />
                <Link to={`/cutting-lots/${lot.id}`} className="min-w-0 flex-1 group">
                  <span className="font-medium group-hover:underline">{lot.cuttingLotNumber}</span>
                  <span className="text-muted-foreground text-sm ml-2">
                    · {lot.fabricationLot.lotNumber} · {lot.category.name}/{lot.size.name} · {t("fabrication.dia")} {lot.dia}
                  </span>
                </Link>
                <Badge tone={lot.status === "completed" ? "muted" : "success"}>
                  {lot.status === "completed" ? t("cuttingLot.statusCompleted") : t("cuttingLot.statusActive")}
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            ))}
            {list && !list.items.length && (
              <p className="text-muted-foreground py-2">{t("common.noData")}</p>
            )}
          </div>
          {list && (
            <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={setPage} />
          )}
        </CardContent>
      </Card>

      {printing && (
        <PrintSheet
          // Only lots on the current page are in `list`; selection is per-page too.
          labels={(list?.items ?? [])
            .filter((l) => selected.includes(l.id))
            .map((l) => ({
              code: encodeBarcode("cuttingLot", l.id),
              title: l.cuttingLotNumber,
              subtitle: `${l.fabricationLot.lotNumber} · ${l.category.name}/${l.size.name}`,
            }))}
          onDone={() => setPrinting(false)}
        />
      )}
    </div>
  );
}
