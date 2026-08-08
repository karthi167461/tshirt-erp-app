import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { weekStartOf, weekEndOf } from "@erp/shared";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Button,
} from "@/components/ui";
import { useWeekShifts } from "@/lib/data";
import { api } from "@/lib/api";
import { toastError } from "@/lib/notify";
import { PageTitle } from "@/pages/_parts";
import { PinGate } from "@/components/PinGate";
import { todayIso, addDaysIso, formatMoney } from "@/lib/utils";

function ShiftInner() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [dateInWeek, setDateInWeek] = useState(todayIso());
  const { data } = useWeekShifts(dateInWeek);

  // local edits keyed by employeeId
  const [shifts, setShifts] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data) setShifts(Object.fromEntries(data.employees.map((e) => [e.employeeId, String(e.shifts)])));
  }, [data?.weekStart, data?.employees.length]);

  async function save() {
    if (!data) return;
    setSaving(true);
    try {
      await api.post("/api/shifts", {
        date: dateInWeek,
        entries: data.employees.map((e) => ({
          employeeId: e.employeeId,
          shifts: Number(shifts[e.employeeId]) || 0,
        })),
      });
      await qc.invalidateQueries({ queryKey: ["weekShifts"] });
      await qc.invalidateQueries({ queryKey: ["salary"] });
      toast.success(t("toast.saved"));
    } catch (err) {
      toastError(err, t);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle icon={CalendarClock} title={t("shift.title")} subtitle={t("shift.subtitle")} />

      <Card className="max-w-2xl">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">{t("shift.week")}</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setDateInWeek(addDaysIso(dateInWeek, -7))} aria-label={t("salary.prevWeek")}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm rounded-md border border-input bg-card px-3 py-2 tabular-nums">
              {weekStartOf(dateInWeek)} → {weekEndOf(dateInWeek)}
            </div>
            <Button variant="outline" size="icon" onClick={() => setDateInWeek(addDaysIso(dateInWeek, 7))} aria-label={t("salary.nextWeek")}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm [&_th]:px-2 [&_td]:px-2 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 font-medium">{t("common.employee")}</th>
                  <th className="py-2 font-medium text-right">{t("employees.shiftRate")}</th>
                  <th className="py-2 font-medium text-right">{t("shift.shifts")}</th>
                  <th className="py-2 font-medium text-right">{t("common.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {data?.employees.map((e) => {
                  const s = Number(shifts[e.employeeId]) || 0;
                  return (
                    <tr key={e.employeeId} className="border-b border-border/60">
                      <td className="py-2 font-medium">{e.name}</td>
                      <td className="py-2 text-right tabular-nums">{formatMoney(e.shiftRate)}</td>
                      <td className="py-2 text-right">
                        <Input
                          type="number"
                          step="0.25"
                          min="0"
                          className="h-8 w-20 ml-auto"
                          value={shifts[e.employeeId] ?? ""}
                          onChange={(ev) => setShifts({ ...shifts, [e.employeeId]: ev.target.value })}
                        />
                      </td>
                      <td className="py-2 text-right tabular-nums font-medium">{formatMoney(s * e.shiftRate)}</td>
                    </tr>
                  );
                })}
                {data && !data.employees.length && (
                  <tr><td colSpan={4} className="py-3 text-muted-foreground">{t("shift.noEmployees")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {!!data?.employees.length && (
            <div className="pt-4">
              <Button onClick={save} disabled={saving}>{t("shift.save")}</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function WeeklyShiftPage() {
  return (
    <PinGate>
      <ShiftInner />
    </PinGate>
  );
}
