import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Tag, Ruler, Scissors, Package, ShieldCheck, PackageCheck, Plus, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Field,
  Button,
  Select,
} from "@/components/ui";
import {
  useCategories,
  useCuttingPrices,
  usePouchPrices,
  useStretchingTypes,
  useSettings,
  type StretchingType,
} from "@/lib/data";
import { api } from "@/lib/api";
import { toastError } from "@/lib/notify";
import { PageTitle } from "@/pages/_parts";
import { PinGate } from "@/components/PinGate";

/** Number input that saves on blur when changed. */
function PriceInput({
  initial,
  onSave,
  label,
}: {
  initial: number;
  onSave: (v: number) => Promise<void>;
  label?: string;
}) {
  const [v, setV] = useState(String(initial));
  const inner = (
    <Input
      type="number"
      step="0.5"
      min="0"
      className="h-9"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => Number(v) !== initial && onSave(Number(v) || 0)}
    />
  );
  return label ? <Field label={label}>{inner}</Field> : inner;
}

/** Selectable slab bounds: garment sizes run 50–100 in steps of 5. */
const SLAB_SIZES = Array.from({ length: 11 }, (_, i) => 50 + i * 5);

/** One stretching type: "without size" fallback rate + size-range slab editor. */
function StretchingTypeSlabs({
  ty,
  onSaveFallback,
}: {
  ty: StretchingType;
  onSaveFallback: (id: number, amountPerDozen: number) => Promise<void>;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [rows, setRows] = useState(
    ty.slabs.map((s) => ({ minSize: String(s.minSize), maxSize: String(s.maxSize), pricePerDozen: String(s.pricePerDozen) }))
  );
  const [saving, setSaving] = useState(false);

  const parsed = rows.map((r) => ({
    minSize: Number(r.minSize),
    maxSize: Number(r.maxSize),
    pricePerDozen: Number(r.pricePerDozen),
  }));
  const rowBad =
    rows.some((r) => r.minSize === "" || r.maxSize === "" || r.pricePerDozen === "") ||
    parsed.some(
      (r) =>
        !Number.isFinite(r.minSize) || !Number.isFinite(r.maxSize) || !Number.isFinite(r.pricePerDozen) ||
        r.minSize < 0 || r.pricePerDozen < 0 || r.minSize > r.maxSize
    );
  const sorted = [...parsed].sort((a, b) => a.minSize - b.minSize);
  const overlap = !rowBad && sorted.some((r, i) => i > 0 && r.minSize <= sorted[i - 1].maxSize);
  const invalid = rowBad || overlap;
  const dirty =
    rows.length !== ty.slabs.length ||
    ty.slabs.some(
      (s, i) => s.minSize !== parsed[i]?.minSize || s.maxSize !== parsed[i]?.maxSize || s.pricePerDozen !== parsed[i]?.pricePerDozen
    );

  const setRow = (i: number, patch: Partial<(typeof rows)[number]>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function saveSlabs() {
    setSaving(true);
    try {
      await api.put(`/api/stretching-types/${ty.id}/slabs`, { slabs: parsed });
      await qc.invalidateQueries({ queryKey: ["stretchingTypes"] });
      toast.success(t("toast.saved"));
    } catch (err) {
      toastError(err, t);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm font-medium">{ty.name}</p>
        <div className="w-40">
          <PriceInput
            label={t("pricing.withoutSize")}
            initial={ty.amountPerDozen}
            onSave={(v) => onSaveFallback(ty.id, v)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{t("pricing.sizeRanges")} — {t("pricing.rangesHint")}</p>
        {rows.map((r, i) => (
          <div key={i} className="flex items-end gap-2">
            <Field label={i === 0 ? t("pricing.minSize") : undefined}>
              <Select className="h-9 w-24" value={r.minSize}
                onChange={(e) => setRow(i, { minSize: e.target.value })}>
                <option value="">—</option>
                {SLAB_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label={i === 0 ? t("pricing.maxSize") : undefined}>
              <Select className="h-9 w-24" value={r.maxSize}
                onChange={(e) => setRow(i, { maxSize: e.target.value })}>
                <option value="">—</option>
                {SLAB_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label={i === 0 ? t("pricing.ratePerDozen") : undefined}>
              <Input type="number" step="0.5" min="0" className="h-9 w-28" value={r.pricePerDozen}
                onChange={(e) => setRow(i, { pricePerDozen: e.target.value })} />
            </Field>
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" title={t("pricing.removeRange")}
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {!rows.length && <p className="text-xs text-muted-foreground">{t("pricing.noRanges")}</p>}
        {invalid && <p className="text-xs text-destructive">{t("pricing.rangesInvalid")}</p>}
        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm"
            onClick={() => setRows((rs) => [...rs, { minSize: "", maxSize: "", pricePerDozen: "" }])}>
            <Plus className="h-4 w-4 mr-1" />{t("pricing.addRange")}
          </Button>
          <Button size="sm" disabled={invalid || saving || !dirty} onClick={saveSlabs}>
            {t("pricing.saveRanges")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PricingInner() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: categories } = useCategories(true);
  const { data: cuttingPrices } = useCuttingPrices();
  const { data: pouchPrices } = usePouchPrices();
  const { data: types } = useStretchingTypes();
  const { data: settings } = useSettings();

  const cutMap = new Map((cuttingPrices ?? []).map((p) => [`${p.categoryId}:${p.sizeId}`, p.pricePerDozen]));
  const pouchMap = new Map((pouchPrices ?? []).map((p) => [p.categoryId, p.pricePerDozen]));

  async function saveCutting(categoryId: number, sizeId: number, pricePerDozen: number) {
    try {
      await api.put("/api/prices/cutting", { categoryId, sizeId, pricePerDozen });
      await qc.invalidateQueries({ queryKey: ["cuttingPrices"] });
      toast.success(t("toast.saved"));
    } catch (err) { toastError(err, t); }
  }
  async function savePouch(categoryId: number, pricePerDozen: number) {
    try {
      await api.put("/api/prices/pouch", { categoryId, pricePerDozen });
      await qc.invalidateQueries({ queryKey: ["pouchPrices"] });
      toast.success(t("toast.saved"));
    } catch (err) { toastError(err, t); }
  }
  async function saveType(id: number, amountPerDozen: number) {
    try {
      await api.put(`/api/stretching-types/${id}`, { amountPerDozen });
      await qc.invalidateQueries({ queryKey: ["stretchingTypes"] });
      toast.success(t("toast.saved"));
    } catch (err) { toastError(err, t); }
  }
  async function saveSettings(patch: Record<string, number>) {
    try {
      await api.put("/api/settings", patch);
      await qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success(t("toast.saved"));
    } catch (err) { toastError(err, t); }
  }

  return (
    <div className="space-y-6">
      <PageTitle icon={Tag} title={t("pricing.title")} subtitle={t("pricing.subtitle")} />

      {/* Cutting: category → size grid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Scissors className="h-5 w-5" />{t("pricing.cutting")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {categories?.map((c) => (
            <div key={c.id}>
              <p className="text-sm font-medium mb-2">{c.name}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {c.sizes.map((s) => (
                  <PriceInput
                    key={s.id}
                    label={s.name}
                    initial={cutMap.get(`${c.id}:${s.id}`) ?? 0}
                    onSave={(v) => saveCutting(c.id, s.id, v)}
                  />
                ))}
                {!c.sizes.length && <p className="text-xs text-muted-foreground">{t("settings.noSizes")}</p>}
              </div>
            </div>
          ))}
          {!categories?.length && <p className="text-muted-foreground">{t("common.noData")}</p>}
        </CardContent>
      </Card>

      {/* Pouch: per category */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" />{t("pricing.pouch")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {categories?.map((c) => (
              <PriceInput key={c.id} label={c.name} initial={pouchMap.get(c.id) ?? 0} onSave={(v) => savePouch(c.id, v)} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Stretching: per type × size-range slabs, with a "without size" fallback rate */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Ruler className="h-5 w-5" />{t("pricing.stretching")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {types?.map((ty) => (
            <StretchingTypeSlabs
              key={`${ty.id}:${JSON.stringify(ty.slabs)}`}
              ty={ty}
              onSaveFallback={saveType}
            />
          ))}
          {!types?.length && <p className="text-muted-foreground">{t("common.noData")}</p>}
        </CardContent>
      </Card>

      {/* Pichiru + Packing flat */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />{t("pricing.flat")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 max-w-md">
            {settings && (
              <>
                <PriceInput label={t("section.pichiru")} initial={settings.qcPricePerDozen} onSave={(v) => saveSettings({ qcPricePerDozen: v })} />
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <PriceInput label={t("section.packing")} initial={settings.packingPricePerDozen} onSave={(v) => saveSettings({ packingPricePerDozen: v })} />
                  </div>
                  <PackageCheck className="h-5 w-5 text-muted-foreground mb-2.5" />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PricingPage() {
  return (
    <PinGate>
      <PricingInner />
    </PinGate>
  );
}
