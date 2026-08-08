import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Factory, Plus, Trash2, ArrowLeft } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
  Button,
} from "@/components/ui";
import { api } from "@/lib/api";
import { toastError } from "@/lib/notify";
import { PageTitle } from "@/pages/_parts";
import type { FabricationLot } from "@/lib/data";
import { FABRICATION_TYPE, type FabricationType } from "@erp/shared";

interface RollDraft {
  dia: string;
  rollCount: string;
  weight: string;
  texturePinnal: string;
}

const emptyRoll: RollDraft = {
  dia: "",
  rollCount: "",
  weight: "",
  texturePinnal: "",
};

export default function FabricationCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [lotNumber, setLotNumber] = useState("");
  const [type, setType] = useState<FabricationType>("own");
  const [rolls, setRolls] = useState<RollDraft[]>([]);
  const [roll, setRoll] = useState<RollDraft>(emptyRoll);
  const [saving, setSaving] = useState(false);

  const canAddRoll =
    roll.dia.trim() && Number(roll.rollCount) > 0 && roll.texturePinnal.trim();

  function addRoll() {
    if (!canAddRoll) return;
    setRolls((r) => [...r, roll]);
    setRoll(emptyRoll);
  }

  function removeRoll(i: number) {
    setRolls((r) => r.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (!lotNumber.trim() || !rolls.length) return;
    setSaving(true);
    try {
      const lot = await api.post<FabricationLot>("/api/fabrication-lots", {
        lotNumber: lotNumber.trim(),
        type,
      });
      for (const r of rolls) {
        await api.post(`/api/fabrication-lots/${lot.id}/rolls`, {
          dia: r.dia.trim(),
          rollCount: Number(r.rollCount),
          weight: Number(r.weight) || 0,
          texturePinnal: r.texturePinnal.trim(),
        });
      }
      toast.success(t("toast.saved"));
      navigate(`/fabrication/${lot.id}`);
    } catch (err) {
      toastError(err, t);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/fabrication")} aria-label={t("common.back")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <PageTitle icon={Factory} title={t("fabrication.newLot")} subtitle={t("fabrication.createHint")} />
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>{t("fabrication.lotDetails")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
            <Field label={t("fabrication.lotNumber")}>
              <Input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} placeholder="FAB-1001" />
            </Field>
            <Field label={t("fabType.label")} hint={type === "job_given_out" ? t("fabType.shortFlowHint") : undefined}>
              <Select value={type} onChange={(e) => setType(e.target.value as FabricationType)}>
                {FABRICATION_TYPE.map((ty) => (
                  <option key={ty} value={ty}>
                    {t(`fabType.${ty}`)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {/* Added rolls */}
          {rolls.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm [&_th]:px-2 [&_td]:px-2 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-2 font-medium">{t("fabrication.dia")}</th>
                    <th className="py-2 font-medium text-right">{t("fabrication.rollCount")}</th>
                    <th className="py-2 font-medium text-right">{t("fabrication.weight")}</th>
                    <th className="py-2 font-medium">{t("fabrication.texturePinnal")}</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rolls.map((r, i) => (
                    <tr key={i} className="border-b border-border/60">
                      <td className="py-2 font-medium">{r.dia}</td>
                      <td className="py-2 text-right tabular-nums">{r.rollCount}</td>
                      <td className="py-2 text-right tabular-nums">{r.weight || 0}</td>
                      <td className="py-2">{r.texturePinnal}</td>
                      <td className="py-2 text-right">
                        <button onClick={() => removeRoll(i)} aria-label={t("common.delete")}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add roll */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border">
            <Field label={t("fabrication.dia")}>
              <Input value={roll.dia} onChange={(e) => setRoll({ ...roll, dia: e.target.value })} />
            </Field>
            <Field label={t("fabrication.rollCount")}>
              <Input type="number" step="1" min="1" value={roll.rollCount} onChange={(e) => setRoll({ ...roll, rollCount: e.target.value })} />
            </Field>
            <Field label={t("fabrication.weight")}>
              <Input type="number" step="0.01" min="0" value={roll.weight} onChange={(e) => setRoll({ ...roll, weight: e.target.value })} />
            </Field>
            <Field label={t("fabrication.texturePinnal")}>
              <Input value={roll.texturePinnal} onChange={(e) => setRoll({ ...roll, texturePinnal: e.target.value })} />
            </Field>
            <div className="col-span-2 sm:col-span-4">
              <Button variant="outline" onClick={addRoll} disabled={!canAddRoll}>
                <Plus className="h-4 w-4" />
                {t("fabrication.addRoll")}
              </Button>
            </div>
          </div>

          <div className="pt-2 border-t border-border">
            <Button onClick={save} disabled={!lotNumber.trim() || !rolls.length || saving}>
              {t("fabrication.saveLot")}
            </Button>
            {!rolls.length && (
              <p className="text-xs text-muted-foreground mt-2">{t("fabrication.addRollFirst")}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
