import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Button,
  Badge,
  MultiSelectChips,
} from "@/components/ui";
import {
  useEmployees,
  useActiveCuttingLots,
  useCuttingLotColors,
  useStretchingTypes,
  useStretchingFlows,
  useQuotaInfo,
  useInvalidateEntries,
} from "@/lib/data";
import { api } from "@/lib/api";
import { toastError } from "@/lib/notify";
import { todayIso, fmtQty, blockDecimal, clampPieces } from "@/lib/utils";
import { EntryLog } from "@/components/EntryLog";
import { Combobox } from "@/components/Combobox";
import { FlowStepPicker } from "@/components/FlowStepPicker";

type Stage = "pouch" | "stretching" | "pichiru" | "packing";

/**
 * Live quota for one selected color. A self-contained child so the parent can
 * render a variable number of these without breaking the rules of hooks.
 */
function QuotaRow({
  cuttingLotId,
  color,
  stage,
  stretchingTypeId,
}: {
  cuttingLotId: number;
  color: string;
  stage: Stage;
  stretchingTypeId?: number;
}) {
  const { t } = useTranslation();
  const { data: quota } = useQuotaInfo({ cuttingLotId, color, stage, stretchingTypeId });
  if (!quota) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm rounded-md bg-muted px-3 py-2">
      <Badge tone={quota.remaining > 0 ? "success" : "warning"}>{color}</Badge>
      <span>
        {t("common.remaining")}: {fmtQty(t, quota.remaining)}
      </span>
      <span className="text-muted-foreground">
        {t("common.quota")} {fmtQty(t, quota.quota)} · {t("common.used")} {fmtQty(t, quota.used)}
      </span>
    </div>
  );
}

export function StageForm({ stage }: { stage: Stage }) {
  const { t } = useTranslation();
  const { data: employees } = useEmployees(true);
  const { data: lots } = useActiveCuttingLots();
  const { data: types } = useStretchingTypes(true);
  // All flows (not just active): a lot keeps its flow even after deactivation.
  const { data: flows } = useStretchingFlows();
  const invalidate = useInvalidateEntries();

  const [cuttingLotId, setCuttingLotId] = useState("");
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [stretchingTypeId, setStretchingTypeId] = useState("");
  const [dozen, setDozen] = useState("");
  const [pieces, setPieces] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);

  const lotId = cuttingLotId ? Number(cuttingLotId) : undefined;
  const { data: colors } = useCuttingLotColors(lotId);

  // Job-work-given-outside lots skip pouch/stretching/kainool — hide them there.
  const visibleLots = lots?.filter(
    (l) => stage === "packing" || l.fabricationLot.type !== "job_given_out"
  );

  const needsType = stage === "stretching";
  const typeId = stretchingTypeId ? Number(stretchingTypeId) : undefined;

  // Effective stretching rate for the chosen lot's size: matching size-range
  // slab wins, otherwise the type's "without size" rate.
  const selectedLot = visibleLots?.find((l) => l.id === lotId);
  const rateFor = (ty: { amountPerDozen: number; slabs?: { minSize: number; maxSize: number; pricePerDozen: number }[] }) => {
    const raw = selectedLot?.size.name.trim();
    const n = raw ? Number(raw) : NaN;
    const hit = Number.isFinite(n)
      ? ty.slabs?.find((s) => n >= s.minSize && n <= s.maxSize)
      : undefined;
    return hit?.pricePerDozen ?? ty.amountPerDozen;
  };
  // A lot created with a stretching flow lists ONLY the flow's steps, in order.
  const lotFlow =
    needsType && selectedLot?.stretchingFlowId
      ? flows?.find((f) => f.id === selectedLot.stretchingFlowId)
      : undefined;

  const reqQty = Number(dozen || 0) + Number(pieces || 0) / 12;
  const canSave =
    !!lotId &&
    selectedColors.length > 0 &&
    reqQty > 0 &&
    employeeId &&
    (!needsType || stretchingTypeId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || !lotId) return;
    setSaving(true);
    try {
      const results = await Promise.allSettled(
        selectedColors.map((color) => {
          const payload: any = {
            cuttingLotId: lotId,
            color,
            dozen: Number(dozen || 0),
            employeeId: Number(employeeId),
            date,
          };
          if (pieces) payload.pieces = Number(pieces);
          if (needsType) payload.stretchingTypeId = Number(stretchingTypeId);
          return api.post(`/api/${stage}`, payload);
        })
      );

      const failed = selectedColors.filter((_, i) => results[i].status === "rejected");
      const okCount = selectedColors.length - failed.length;

      if (failed.length === 0) {
        toast.success(t("toast.entriesSaved", { count: okCount }));
        setDozen("");
        setPieces("");
        setSelectedColors([]);
      } else if (okCount === 0) {
        toastError((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason, t);
      } else {
        toast.warning(t("toast.entriesPartial", { ok: okCount, colors: failed.join(", ") }));
        setSelectedColors(failed);
      }
      invalidate();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>{t(`section.${stage}`)}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <Field label={t("cuttingLot.number")}>
            <Combobox
              value={cuttingLotId}
              onChange={(v) => {
                setCuttingLotId(v);
                setSelectedColors([]);
                // The old type may not be a step of the new lot's flow.
                if (needsType) setStretchingTypeId("");
              }}
              placeholder={t("cuttingLot.select")}
              options={(visibleLots ?? []).map((l) => ({
                value: String(l.id),
                label: `${l.cuttingLotNumber} · ${l.fabricationLot.lotNumber} · ${l.category.name}/${l.size.name}`,
              }))}
            />
          </Field>

          <Field label={t("common.color")} hint={lotId ? t("form.selectColors") : undefined}>
            <MultiSelectChips
              options={colors ?? []}
              selected={selectedColors}
              onChange={setSelectedColors}
              disabled={!lotId}
              emptyLabel={lotId ? t("form.noColors") : t("form.selectColor")}
              selectAllLabel={t("form.allColors")}
            />
          </Field>

          {needsType && (
            <Field label={lotFlow ? t("form.flowSteps") : t("nav.stretching")}>
              {lotFlow ? (
                <FlowStepPicker
                  cuttingLotId={lotId}
                  steps={lotFlow.steps.map((s) => ({
                    typeId: s.stretchingTypeId,
                    position: s.position,
                    name: s.stretchingType.name,
                  }))}
                  value={stretchingTypeId}
                  onChange={setStretchingTypeId}
                />
              ) : (
                <Combobox
                  value={stretchingTypeId}
                  onChange={setStretchingTypeId}
                  placeholder={t("form.selectType")}
                  options={(types ?? []).map((ty) => ({
                    value: String(ty.id),
                    label: `${ty.name} · ${rateFor(ty)}`,
                  }))}
                />
              )}
            </Field>
          )}

          {lotId && (!needsType || stretchingTypeId) && selectedColors.length > 0 && (
            <div className="space-y-2">
              {selectedColors.map((c) => (
                <QuotaRow
                  key={c}
                  cuttingLotId={lotId}
                  color={c}
                  stage={stage}
                  stretchingTypeId={typeId}
                />
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label={t("common.dozen")}>
              <Input
                type="number"
                min="0"
                step="1"
                onKeyDown={blockDecimal}
                value={dozen}
                onChange={(e) => setDozen(e.target.value)}
                placeholder={t("form.enterDozen")}
              />
            </Field>
            <Field label={t("common.pieces")}>
              <Input
                type="number"
                min="0"
                max="11"
                step="1"
                onKeyDown={blockDecimal}
                value={pieces}
                onChange={(e) => setPieces(clampPieces(e.target.value))}
                placeholder="0"
              />
            </Field>
            <Field label={t("common.date")}>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>

          <Field label={t("common.employee")}>
            <Combobox
              value={employeeId}
              onChange={setEmployeeId}
              placeholder={t("form.selectEmployee")}
              options={(employees ?? []).map((emp) => ({
                value: String(emp.id),
                label: emp.name,
              }))}
            />
          </Field>

          <Button type="submit" disabled={!canSave || saving} className="w-full">
            {t("common.save")}
          </Button>
        </form>
      </CardContent>
    </Card>

      <EntryLog stage={stage} cuttingLotId={lotId} onChanged={invalidate} />
    </div>
  );
}
