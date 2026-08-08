import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Boxes, ArrowLeft, Pencil, Trash2, Check, X, Printer } from "lucide-react";
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
  Progress,
} from "@/components/ui";
import {
  useCuttingLot,
  useCuttingLotAnalytics,
  useCategories,
  useSizes,
  useReadyFabricationLots,
} from "@/lib/data";
import { api } from "@/lib/api";
import { toastError } from "@/lib/notify";
import { fmtQty } from "@/lib/utils";
import { PageTitle } from "@/pages/_parts";
import { Barcode } from "@/components/Barcode";
import { PrintSheet } from "@/components/PrintSheet";
import { encodeBarcode, type StageProgress } from "@erp/shared";

export default function CuttingLotDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const id = Number(useParams().id);

  const { data: lot } = useCuttingLot(id);
  const { data: analytics } = useCuttingLotAnalytics(id);
  const { data: categories } = useCategories(true);
  const { data: readyLots } = useReadyFabricationLots();

  const [editing, setEditing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [form, setForm] = useState({ cuttingLotNumber: "", fabricationLotId: "", dia: "", categoryId: "", sizeId: "" });
  const { data: sizes } = useSizes(form.categoryId ? Number(form.categoryId) : undefined, true);

  useEffect(() => {
    if (lot)
      setForm({
        cuttingLotNumber: lot.cuttingLotNumber,
        fabricationLotId: String(lot.fabricationLotId),
        dia: lot.dia,
        categoryId: String(lot.categoryId),
        sizeId: String(lot.sizeId),
      });
  }, [lot?.id]);

  // Ready+unlocked lots are the pickable options; keep the current lot in the
  // list too so it stays selectable even after it's been locked.
  const fabOptions = [
    ...(lot && !(readyLots ?? []).some((l) => l.id === lot.fabricationLot.id)
      ? [{ id: lot.fabricationLot.id, lotNumber: lot.fabricationLot.lotNumber }]
      : []),
    ...(readyLots ?? []).map((l) => ({ id: l.id, lotNumber: l.lotNumber })),
  ];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["cuttingLot", id] });
    qc.invalidateQueries({ queryKey: ["cuttingLots"] });
    qc.invalidateQueries({ queryKey: ["activeCuttingLots"] });
    qc.invalidateQueries({ queryKey: ["cuttingLotsList"] });
  };

  async function save() {
    try {
      await api.put(`/api/cutting-lots/${id}`, {
        cuttingLotNumber: form.cuttingLotNumber.trim(),
        fabricationLotId: Number(form.fabricationLotId),
        dia: form.dia.trim(),
        categoryId: Number(form.categoryId),
        sizeId: Number(form.sizeId),
      });
      toast.success(t("toast.saved"));
      setEditing(false);
      invalidate();
    } catch (err) {
      toastError(err, t);
    }
  }

  async function del() {
    try {
      await api.del(`/api/cutting-lots/${id}`);
      toast.success(t("toast.saved"));
      qc.invalidateQueries({ queryKey: ["cuttingLots"] });
      navigate("/cutting-lots");
    } catch (err) {
      toastError(err, t);
    }
  }

  async function toggleComplete() {
    if (!lot) return;
    try {
      await api.post("/api/cutting-lots/complete", {
        cuttingLotIds: [id],
        completed: lot.status !== "completed",
      });
      toast.success(t("toast.saved"));
      invalidate();
    } catch (err) {
      toastError(err, t);
    }
  }

  if (!lot) return <p className="text-muted-foreground">{t("common.loading")}</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/cutting-lots")} aria-label={t("common.back")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <PageTitle icon={Boxes} title={lot.cuttingLotNumber} subtitle={`${t("cuttingLot.fabricationLot")}: ${lot.fabricationLot.lotNumber}`} />
      </div>

      {/* Header / edit */}
      <Card className="max-w-2xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("cuttingLot.details")}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge tone={lot.status === "completed" ? "muted" : "success"}>
              {lot.status === "completed" ? t("cuttingLot.statusCompleted") : t("cuttingLot.statusActive")}
            </Badge>
            {!editing && (
              <Button size="sm" variant="outline" onClick={toggleComplete}>
                {lot.status === "completed" ? t("cuttingLot.revert") : t("cuttingLot.markCompleted")}
              </Button>
            )}
            {!editing ? (
              <>
                <button onClick={() => setEditing(true)} aria-label={t("common.edit")}><Pencil className="h-4 w-4 text-muted-foreground" /></button>
                <button onClick={del} aria-label={t("common.delete")}><Trash2 className="h-4 w-4 text-destructive" /></button>
              </>
            ) : (
              <>
                <button onClick={save} aria-label={t("common.save")}><Check className="h-4 w-4 text-emerald-600" /></button>
                <button onClick={() => setEditing(false)} aria-label={t("common.cancel")}><X className="h-4 w-4 text-muted-foreground" /></button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!editing ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Info label={t("cuttingLot.number")} value={lot.cuttingLotNumber} />
              <Info label={t("cuttingLot.fabricationLot")} value={lot.fabricationLot.lotNumber} />
              <Info label={t("fabrication.dia")} value={lot.dia} />
              <Info label={t("settings.categories")} value={`${lot.category.name} / ${lot.size.name}`} />
            </dl>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label={t("cuttingLot.number")}>
                <Input value={form.cuttingLotNumber} onChange={(e) => setForm({ ...form, cuttingLotNumber: e.target.value })} />
              </Field>
              <Field label={t("cuttingLot.fabricationLot")}>
                <Select value={form.fabricationLotId} onChange={(e) => setForm({ ...form, fabricationLotId: e.target.value })}>
                  {fabOptions.map((l) => (
                    <option key={l.id} value={l.id}>{l.lotNumber}</option>
                  ))}
                </Select>
              </Field>
              <Field label={t("fabrication.dia")}>
                <Input value={form.dia} onChange={(e) => setForm({ ...form, dia: e.target.value })} />
              </Field>
              <Field label={t("settings.categories")}>
                <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value, sizeId: "" })}>
                  {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label={t("settings.sizeName")}>
                <Select value={form.sizeId} onChange={(e) => setForm({ ...form, sizeId: e.target.value })}>
                  <option value="">{t("cuttingLot.selectSize")}</option>
                  {sizes?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Barcode — scan this on Master Entry to select the lot */}
      {lot && (
        <Card className="max-w-2xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("barcode.title")}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setPrinting(true)}>
              <Printer className="h-4 w-4 mr-1.5" />
              {t("barcode.print")}
            </Button>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <div className="rounded-md border border-border bg-white p-2">
              <Barcode value={encodeBarcode("cuttingLot", lot.id)} />
            </div>
            <div className="text-sm">
              <p className="text-muted-foreground">{t("barcode.code")}</p>
              <p className="font-mono font-semibold">{encodeBarcode("cuttingLot", lot.id)}</p>
            </div>
          </CardContent>
        </Card>
      )}
      {printing && lot && (
        <PrintSheet
          labels={[
            {
              code: encodeBarcode("cuttingLot", lot.id),
              title: lot.cuttingLotNumber,
              subtitle: `${lot.fabricationLot.lotNumber} · ${lot.category.name}/${lot.size.name}`,
            },
          ]}
          onDone={() => setPrinting(false)}
        />
      )}

      {/* Progress by color */}
      {analytics && analytics.colors.length > 0 && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="text-base">{t("analytics.colorProgress")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {analytics.colors.map((c) => (
              <div key={c.color} className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="font-medium flex items-center gap-1.5">
                    {c.color}
                    {c.allStagesComplete && (
                      <Badge tone="success">{t("analytics.allStagesComplete")}</Badge>
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    {t("common.quota")} {fmtQty(t, c.quota)}
                  </span>
                </div>
                {c.shortFlow ? (
                  <Bar label={t("section.packing")} p={c.packing} />
                ) : (
                  <>
                    <Bar label={t("section.pouch")} p={c.pouch} />
                    {/* only types actually applied to this lot */}
                    {c.stretching.filter((s) => s.used).map((s) => (
                      <Bar key={s.typeId} label={s.typeName} p={s} />
                    ))}
                    <Bar label={t("section.pichiru")} p={c.pichiru} />
                    <Bar label={t("section.packing")} p={c.packing} />
                  </>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

/** Progress against the stage's own ceiling; a zero ceiling = upstream not started. */
function Bar({ label, p }: { label: string; p: StageProgress }) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="flex justify-between text-xs text-muted-foreground gap-2">
        <span>{label}</span>
        <span className="tabular-nums shrink-0">
          {p.ceiling > 0
            ? `${fmtQty(t, p.done)} / ${fmtQty(t, p.ceiling)} (${p.percent}%)`
            : t("analytics.notStarted")}
        </span>
      </div>
      <Progress value={p.percent} />
    </div>
  );
}
