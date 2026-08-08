import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Factory, ArrowLeft, Lock, LockOpen, Pencil, Trash2, Check, X, Plus, FileText, FileSpreadsheet, Send } from "lucide-react";
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
import { useFabricationLot, useSettings, type FabricationRoll } from "@/lib/data";
import { FABRICATION_TYPE, type FabricationType } from "@erp/shared";
import { api } from "@/lib/api";
import { toastError } from "@/lib/notify";
import { PageTitle } from "@/pages/_parts";
import { statusTone } from "@/pages/Fabrication";
import { exportFabricationExcel, exportFabricationPdf, fabricationWhatsappText, openWhatsapp } from "@/lib/export";

export default function FabricationUpdatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const id = Number(useParams().id);
  const { data: lot, isLoading } = useFabricationLot(id);
  const { data: settings } = useSettings();

  const [roll, setRoll] = useState({ dia: "", rollCount: "", weight: "", texturePinnal: "" });
  const [addingSaving, setAddingSaving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["fabricationLot", id] });
    qc.invalidateQueries({ queryKey: ["fabricationLots"] });
    qc.invalidateQueries({ queryKey: ["readyFabricationLots"] });
  };

  async function toggleLock() {
    if (!lot) return;
    try {
      await api.put(`/api/fabrication-lots/${id}/lock`, { locked: !lot.locked });
      invalidate();
    } catch (err) {
      toastError(err, t);
    }
  }

  async function saveName() {
    const next = nameValue.trim();
    if (!next || next === lot?.lotNumber) {
      setRenaming(false);
      return;
    }
    setRenameSaving(true);
    try {
      await api.put(`/api/fabrication-lots/${id}/name`, { lotNumber: next });
      toast.success(t("toast.saved"));
      setRenaming(false);
      invalidate();
    } catch (err) {
      toastError(err, t);
    } finally {
      setRenameSaving(false);
    }
  }

  async function changeType(type: FabricationType) {
    try {
      await api.put(`/api/fabrication-lots/${id}/type`, { type });
      toast.success(t("toast.saved"));
      invalidate();
    } catch (err) {
      toastError(err, t);
    }
  }

  async function addRoll(e: React.FormEvent) {
    e.preventDefault();
    if (!roll.dia.trim() || !(Number(roll.rollCount) > 0) || !roll.texturePinnal.trim()) return;
    setAddingSaving(true);
    try {
      await api.post(`/api/fabrication-lots/${id}/rolls`, {
        dia: roll.dia.trim(),
        rollCount: Number(roll.rollCount),
        weight: Number(roll.weight) || 0,
        texturePinnal: roll.texturePinnal.trim(),
      });
      setRoll({ dia: "", rollCount: "", weight: "", texturePinnal: "" });
      invalidate();
    } catch (err) {
      toastError(err, t);
    } finally {
      setAddingSaving(false);
    }
  }

  if (isLoading) return <p className="text-muted-foreground">{t("common.loading")}</p>;
  if (!lot) return <p className="text-muted-foreground">{t("error.fabrication_lot_not_found")}</p>;

  const locked = lot.locked;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/fabrication")} aria-label={t("common.back")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        {renaming ? (
          <div className="flex flex-1 items-center gap-2">
            <div className="h-11 w-11 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Factory className="h-6 w-6" />
            </div>
            <Input
              autoFocus
              className="max-w-xs text-lg font-semibold"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") setRenaming(false);
              }}
            />
            <button onClick={saveName} disabled={renameSaving} aria-label={t("common.save")}>
              <Check className="h-5 w-5 text-emerald-600" />
            </button>
            <button onClick={() => setRenaming(false)} aria-label={t("common.cancel")}>
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        ) : (
          <>
            <PageTitle icon={Factory} title={lot.lotNumber} subtitle={t("fabrication.updateHint")} />
            {!locked && (
              <button
                onClick={() => {
                  setNameValue(lot.lotNumber);
                  setRenaming(true);
                }}
                aria-label={t("fabrication.rename")}
                title={t("fabrication.rename")}
              >
                <Pencil className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => exportFabricationPdf(lot, settings?.companyName)}>
          <FileText className="h-4 w-4" />{t("export.pdf")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportFabricationExcel(lot)}>
          <FileSpreadsheet className="h-4 w-4" />{t("export.excel")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => openWhatsapp(fabricationWhatsappText(lot))}>
          <Send className="h-4 w-4" />{t("export.whatsapp")}
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            {t("fabrication.status")}:
            <Badge tone={statusTone(lot.status)}>{t(`fabStatus.${lot.status}`)}</Badge>
          </CardTitle>
          <Button size="sm" variant={locked ? "destructive" : "outline"} onClick={toggleLock}>
            {locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
            {locked ? t("fabrication.locked") : t("fabrication.lock")}
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {locked && <Badge tone="warning">{t("fabrication.lockedHint")}</Badge>}

          <Field label={t("fabType.label")} hint={lot.type === "job_given_out" ? t("fabType.shortFlowHint") : undefined}>
            <Select
              className="max-w-xs"
              value={lot.type}
              disabled={locked}
              onChange={(e) => changeType(e.target.value as FabricationType)}
            >
              {FABRICATION_TYPE.map((ty) => (
                <option key={ty} value={ty}>
                  {t(`fabType.${ty}`)}
                </option>
              ))}
            </Select>
          </Field>

          <div className="overflow-x-auto">
            <table className="w-full text-sm [&_th]:px-2 [&_td]:px-2 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 font-medium">{t("fabrication.dia")}</th>
                  <th className="py-2 font-medium text-right">{t("fabrication.rollCount")}</th>
                  <th className="py-2 font-medium text-right">{t("fabrication.weight")}</th>
                  <th className="py-2 font-medium">{t("fabrication.texturePinnal")}</th>
                  <th className="py-2 font-medium text-right">{t("fabrication.stage1")}</th>
                  <th className="py-2 font-medium text-right">{t("fabrication.stage2")}</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {lot.rolls.map((r) => (
                  <RollRow key={r.id} roll={r} disabled={locked} onSaved={invalidate} />
                ))}
                {!lot.rolls.length && (
                  <tr>
                    <td colSpan={7} className="py-3 text-muted-foreground">
                      {t("fabrication.noRolls")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {!locked && (
            <form onSubmit={addRoll} className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 border-t border-border">
              <Field label={t("fabrication.dia")}>
                <Input value={roll.dia} onChange={(e) => setRoll({ ...roll, dia: e.target.value })} />
              </Field>
              <Field label={t("fabrication.rollCount")}>
                <Input type="number" step="1" min="1" value={roll.rollCount} onChange={(e) => setRoll({ ...roll, rollCount: e.target.value })} />
              </Field>
              <Field label={t("fabrication.weight")}>
                <Input type="number" step="0.01" min="0" autoComplete="off" value={roll.weight} onChange={(e) => setRoll({ ...roll, weight: e.target.value })} />
              </Field>
              <Field label={t("fabrication.texturePinnal")}>
                <Input value={roll.texturePinnal} onChange={(e) => setRoll({ ...roll, texturePinnal: e.target.value })} />
              </Field>
              <div className="flex items-end">
                <Button type="submit" variant="outline" disabled={addingSaving} className="w-full">
                  <Plus className="h-4 w-4" />
                  {t("fabrication.addRoll")}
                </Button>
              </div>
            </form>
          )}

          <p className="text-xs text-muted-foreground">{t("fabrication.autoStatusHint")}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function RollRow({
  roll,
  disabled,
  onSaved,
}: {
  roll: FabricationRoll;
  disabled: boolean;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [fab, setFab] = useState(roll.fabricationWeight?.toString() ?? "");
  const [dye, setDye] = useState(roll.dyeingWeight?.toString() ?? "");
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({
    dia: roll.dia,
    rollCount: String(roll.rollCount),
    weight: String(roll.weight),
    texturePinnal: roll.texturePinnal,
  });

  async function saveStage(stage: "stage1" | "stage2") {
    try {
      const body =
        stage === "stage1"
          ? { fabricationWeight: Number(fab) || 0 }
          : { dyeingWeight: Number(dye) || 0 };
      await api.put(`/api/rolls/${roll.id}/${stage}`, body);
      toast.success(t("toast.saved"));
      onSaved();
    } catch (err) {
      toastError(err, t);
    }
  }

  async function saveEdit() {
    try {
      await api.put(`/api/rolls/${roll.id}`, {
        dia: edit.dia.trim(),
        rollCount: Number(edit.rollCount),
        weight: Number(edit.weight) || 0,
        texturePinnal: edit.texturePinnal.trim(),
      });
      toast.success(t("toast.saved"));
      setEditing(false);
      onSaved();
    } catch (err) {
      toastError(err, t);
    }
  }

  async function del() {
    try {
      await api.del(`/api/rolls/${roll.id}`);
      toast.success(t("toast.saved"));
      onSaved();
    } catch (err) {
      toastError(err, t);
    }
  }

  const weightInput = (
    value: string,
    set: (v: string) => void,
    onBlur: () => void
  ) => (
    <Input
      type="number"
      step="0.01"
      min="0"
      autoComplete="off"
      className="h-8 w-20"
      value={value}
      disabled={disabled}
      onChange={(e) => set(e.target.value)}
      onBlur={onBlur}
    />
  );

  if (editing) {
    return (
      <tr className="border-b border-border/60 bg-muted/40">
        <td className="py-2"><Input className="h-8 w-16" value={edit.dia} onChange={(e) => setEdit({ ...edit, dia: e.target.value })} /></td>
        <td className="py-2"><Input type="number" min="1" className="h-8 w-16" value={edit.rollCount} onChange={(e) => setEdit({ ...edit, rollCount: e.target.value })} /></td>
        <td className="py-2"><Input type="number" step="0.01" min="0" autoComplete="off" className="h-8 w-20" value={edit.weight} onChange={(e) => setEdit({ ...edit, weight: e.target.value })} /></td>
        <td className="py-2"><Input className="h-8 w-24" value={edit.texturePinnal} onChange={(e) => setEdit({ ...edit, texturePinnal: e.target.value })} /></td>
        <td className="py-2 text-muted-foreground text-right tabular-nums">{roll.fabricationWeight ?? "—"}</td>
        <td className="py-2 text-muted-foreground text-right tabular-nums">{roll.dyeingWeight ?? "—"}</td>
        <td className="py-2">
          <div className="flex gap-1 justify-end">
            <button onClick={saveEdit} aria-label={t("common.save")}><Check className="h-4 w-4 text-emerald-600" /></button>
            <button onClick={() => setEditing(false)} aria-label={t("common.cancel")}><X className="h-4 w-4 text-muted-foreground" /></button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border/60">
      <td className="py-2 font-medium">{roll.dia}</td>
      <td className="py-2 text-right tabular-nums">{roll.rollCount}</td>
      <td className="py-2 text-right tabular-nums">{roll.weight}</td>
      <td className="py-2">{roll.texturePinnal}</td>
      <td className="py-2"><div className="flex justify-end">{weightInput(fab, setFab, () => fab !== (roll.fabricationWeight?.toString() ?? "") && saveStage("stage1"))}</div></td>
      <td className="py-2"><div className="flex justify-end">{weightInput(dye, setDye, () => dye !== (roll.dyeingWeight?.toString() ?? "") && saveStage("stage2"))}</div></td>
      <td className="py-2">
        {!disabled && (
          <div className="flex gap-1 justify-end">
            <button onClick={() => setEditing(true)} aria-label={t("common.edit")}><Pencil className="h-4 w-4 text-muted-foreground" /></button>
            <button onClick={del} aria-label={t("common.delete")}><Trash2 className="h-4 w-4 text-destructive" /></button>
          </div>
        )}
      </td>
    </tr>
  );
}
