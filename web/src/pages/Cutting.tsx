import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Scissors } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
  Button,
  MultiSelectChips,
} from "@/components/ui";
import {
  useEmployees,
  useActiveCuttingLots,
  useMasterColors,
  useInvalidateEntries,
} from "@/lib/data";
import { api } from "@/lib/api";
import { toastError } from "@/lib/notify";
import { todayIso, blockDecimal, clampPieces } from "@/lib/utils";
import { PageTitle } from "@/pages/_parts";
import { EntryLog } from "@/components/EntryLog";

export default function CuttingPage() {
  const { t } = useTranslation();
  const { data: employees } = useEmployees(true);
  const { data: lots } = useActiveCuttingLots();
  const { data: colors } = useMasterColors(true);
  const invalidate = useInvalidateEntries();

  const [cuttingLotId, setCuttingLotId] = useState("");
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [dozen, setDozen] = useState("");
  const [pieces, setPieces] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);

  const reqQty = Number(dozen || 0) + Number(pieces || 0) / 12;
  const canSave = cuttingLotId && selectedColors.length > 0 && reqQty > 0 && employeeId;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      const results = await Promise.allSettled(
        selectedColors.map((color) => {
          const payload: any = {
            cuttingLotId: Number(cuttingLotId),
            color,
            dozen: Number(dozen || 0),
            employeeId: Number(employeeId),
            date,
          };
          if (pieces) payload.pieces = Number(pieces);
          return api.post("/api/cutting", payload);
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
      <PageTitle icon={Scissors} title={t("nav.cutting")} subtitle={t("cutting.entryHint")} />
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{t("section.cutting")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <Field label={t("cuttingLot.number")}>
              <Select
                value={cuttingLotId}
                onChange={(e) => setCuttingLotId(e.target.value)}
              >
                <option value="">{t("cuttingLot.select")}</option>
                {lots?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.cuttingLotNumber} · {l.fabricationLot.lotNumber} · {l.category.name}/{l.size.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={t("common.color")} hint={t("form.selectColors")}>
              <MultiSelectChips
                options={colors?.map((c) => c.name) ?? []}
                selected={selectedColors}
                onChange={setSelectedColors}
                emptyLabel={t("form.noColors")}
              />
            </Field>

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
              <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">{t("form.selectEmployee")}</option>
                {employees?.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Button type="submit" disabled={!canSave || saving} className="w-full">
              {t("common.save")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <EntryLog
        stage="cutting"
        cuttingLotId={cuttingLotId ? Number(cuttingLotId) : undefined}
        onChanged={invalidate}
      />
    </div>
  );
}
