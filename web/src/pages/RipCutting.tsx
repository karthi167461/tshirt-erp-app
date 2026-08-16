import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Layers, Plus, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Button,
  Badge,
} from "@/components/ui";
import { Combobox } from "@/components/Combobox";
import { useRipLots, useRipInfo } from "@/lib/data";
import { api } from "@/lib/api";
import { toastError } from "@/lib/notify";
import { PageTitle } from "@/pages/_parts";

export default function RipCuttingPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: lots } = useRipLots();

  const [lotId, setLotId] = useState("");
  const [weight, setWeight] = useState("");
  const [saving, setSaving] = useState(false);

  const fabricationLotId = lotId ? Number(lotId) : undefined;
  const { data: info } = useRipInfo(fabricationLotId);

  const reqWeight = Number(weight || 0);
  const canSave = !!fabricationLotId && reqWeight > 0;

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["rip", fabricationLotId] });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      await api.post("/api/rip", { fabricationLotId, weight: reqWeight });
      toast.success(t("toast.saved"));
      setWeight("");
      invalidate();
    } catch (err) {
      toastError(err, t);
    } finally {
      setSaving(false);
    }
  }

  async function del(id: number) {
    try {
      await api.del(`/api/rip/${id}`);
      toast.success(t("toast.saved"));
      invalidate();
    } catch (err) {
      toastError(err, t);
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle icon={Layers} title={t("ripCutting.title")} subtitle={t("ripCutting.subtitle")} />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{t("ripCutting.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <Field label={t("ripCutting.lot")}>
              <Combobox
                value={lotId}
                onChange={setLotId}
                placeholder={t("ripCutting.selectLot")}
                options={(lots ?? []).map((l) => ({
                  value: String(l.id),
                  label: `${l.lotNumber}${l.type !== "own" ? ` · ${t(`fabType.${l.type}`)}` : ""}`,
                }))}
              />
              {lots && !lots.length && (
                <p className="text-xs text-muted-foreground mt-1">{t("ripCutting.noLots")}</p>
              )}
            </Field>

            {info && (
              <div className="flex flex-wrap items-center gap-2 text-sm rounded-md bg-muted px-3 py-2">
                <Badge tone={info.remaining > 0 ? "success" : "warning"}>
                  {t("ripCutting.remaining")}: {info.remaining}
                </Badge>
                <span className="text-muted-foreground">
                  {t("ripCutting.material")} {info.material} · {t("ripCutting.used")} {info.used}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Field label={t("ripCutting.weight")}>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  autoComplete="off"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="0"
                />
              </Field>
              <div className="flex items-end">
                <Button type="submit" disabled={!canSave || saving} className="w-full">
                  <Plus className="h-4 w-4" />
                  {t("ripCutting.add")}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {fabricationLotId && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="text-base">{t("ripCutting.entries")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm [&_th]:px-2 [&_td]:px-2 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-2 font-medium">{t("common.date")}</th>
                    <th className="py-2 font-medium text-right">{t("ripCutting.weight")}</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {info?.entries.map((e) => (
                    <tr key={e.id} className="border-b border-border/60">
                      <td className="py-2">{e.createdAt.slice(0, 10)}</td>
                      <td className="py-2 text-right tabular-nums">{e.weight}</td>
                      <td className="py-2 text-right">
                        <button onClick={() => del(e.id)} aria-label={t("common.delete")}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {info && !info.entries.length && (
                    <tr>
                      <td colSpan={3} className="py-3 text-muted-foreground">
                        {t("ripCutting.noEntries")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
