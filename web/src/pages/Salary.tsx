import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Wallet, ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { weekStartOf, weekEndOf, type SalaryLine } from "@erp/shared";
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
import { useEmployees, useSalary, useSettings, useWeekSalarySheet } from "@/lib/data";
import { api } from "@/lib/api";
import { toastError } from "@/lib/notify";
import { exportSalaryPdf } from "@/lib/export";
import { PageTitle } from "@/pages/_parts";
import { PinGate } from "@/components/PinGate";
import { todayIso, addDaysIso, formatMoney, splitDozenPieces } from "@/lib/utils";

function SalaryInner() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: employees } = useEmployees();
  const { data: settings } = useSettings();
  const [employeeId, setEmployeeId] = useState("");
  const [dateInWeek, setDateInWeek] = useState(todayIso());
  // Payroll first: the common question is "what do I pay everyone this week",
  // and a single employee's payslip is one click from any row.
  const [mode, setMode] = useState<"sheet" | "one">("sheet");

  const { data, isLoading } = useSalary(employeeId ? Number(employeeId) : undefined, dateInWeek);

  const [deduct, setDeduct] = useState("0");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data) setDeduct(String(data.advanceDeducted));
  }, [data?.employeeId, data?.weekStart, data?.advanceDeducted]);

  const weekStart = weekStartOf(dateInWeek);
  const weekEnd = weekEndOf(dateInWeek);
  const fmtDz = (v: number) => {
    const { dozens, pieces } = splitDozenPieces(v);
    return t("common.dzPcs", { dz: dozens, pcs: pieces });
  };

  // Group day-wise lines by date.
  const byDate: Record<string, SalaryLine[]> = {};
  for (const l of data?.lines ?? []) (byDate[l.date] ??= []).push(l);
  const dates = Object.keys(byDate).sort();

  const net = data ? Math.round((data.grossTotal - (Number(deduct) || 0)) * 100) / 100 : 0;
  // Sum of dozen across the week's piece-rate lines (shift employees have none).
  const totalDozen = (data?.lines ?? []).reduce((s, l) => s + l.dozen, 0);

  async function save() {
    if (!employeeId) return;
    setSaving(true);
    try {
      await api.post("/api/salary", {
        employeeId: Number(employeeId),
        date: dateInWeek,
        advanceDeducted: Number(deduct) || 0,
      });
      await qc.invalidateQueries({ queryKey: ["salary"] });
      await qc.invalidateQueries({ queryKey: ["ledger"] });
      // The week sheet shows this deduction and the payout total, so it has to
      // refresh too — otherwise going back to payroll shows a stale net.
      await qc.invalidateQueries({ queryKey: ["weekSalarySheet"] });
      toast.success(t("salary.saved"));
    } catch (err) {
      toastError(err, t);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle icon={Wallet} title={t("salary.title")} />

      {/* Whole-week payroll vs one employee's payslip */}
      <div className="flex rounded-md border border-input overflow-hidden w-fit text-sm">
        {(["sheet", "one"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={mode === m ? "bg-primary text-primary-foreground px-3 py-1.5" : "px-3 py-1.5 hover:bg-muted"}
          >
            {t(m === "sheet" ? "salary.allEmployees" : "salary.oneEmployee")}
          </button>
        ))}
      </div>

      <Card className="max-w-3xl">
        <CardContent className="pt-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            {mode === "one" && (
              <Field label={t("common.employee")}>
                <Combobox
                  value={employeeId}
                  onChange={setEmployeeId}
                  placeholder={t("salary.selectEmployee")}
                  options={(employees ?? []).map((emp) => ({
                    value: String(emp.id),
                    label: emp.name,
                  }))}
                />
              </Field>
            )}
            <Field label={t("salary.week")}>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="icon" onClick={() => setDateInWeek(addDaysIso(dateInWeek, -7))} aria-label={t("salary.prevWeek")}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1 text-center text-sm rounded-md border border-input bg-card py-2 tabular-nums">
                  {weekStart} → {weekEnd}
                </div>
                <Button type="button" variant="outline" size="icon" onClick={() => setDateInWeek(addDaysIso(dateInWeek, 7))} aria-label={t("salary.nextWeek")}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </Field>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setDateInWeek(todayIso())}>
            {t("salary.thisWeek")}
          </Button>
        </CardContent>
      </Card>

      {mode === "sheet" && (
        <WeekSheet
          dateInWeek={dateInWeek}
          onPick={(id) => {
            setEmployeeId(String(id));
            setMode("one");
          }}
        />
      )}

      {mode === "one" && employeeId && isLoading && (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      )}

      {mode === "one" && data && (
        <Card className="max-w-3xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{data.employeeName}</CardTitle>
            <div className="flex items-center gap-2">
              {data.saved && <Badge tone="success">{t("salary.savedBadge")}</Badge>}
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportSalaryPdf(data, Number(deduct) || 0, settings?.companyName)}
              >
                <Printer className="h-4 w-4" />
                {t("salary.print")}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.salaryType === "shift" ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-2 font-medium">{t("employees.type_shift")}</th>
                      <th className="py-2 font-medium text-right">{t("shift.shifts")}</th>
                      <th className="py-2 font-medium text-right">{t("common.rate")}</th>
                      <th className="py-2 font-medium text-right">{t("common.amount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border/60">
                      <td className="py-2">{t("shift.title")}</td>
                      <td className="py-2 text-right tabular-nums">{data.shifts}</td>
                      <td className="py-2 text-right tabular-nums">{formatMoney(data.shiftRate)}</td>
                      <td className="py-2 text-right tabular-nums font-medium">{formatMoney(data.grossTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : dates.length === 0 ? (
              <p className="text-muted-foreground py-4">{t("salary.noEntries")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm [&_th]:px-2 [&_td]:px-2 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-2 font-medium">{t("common.date")}</th>
                      <th className="py-2 font-medium">{t("common.actions")}</th>
                      <th className="py-2 font-medium text-right">{t("common.dozen")}</th>
                      <th className="py-2 font-medium text-right">{t("common.rate")}</th>
                      <th className="py-2 font-medium text-right">{t("common.amount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dates.map((d) => {
                      const dayTotal = byDate[d].reduce((s, l) => s + l.amount, 0);
                      return byDate[d].map((l, i) => (
                        <tr key={d + i} className="border-b border-border/60">
                          <td className="py-2 tabular-nums text-muted-foreground">{i === 0 ? d : ""}</td>
                          <td className="py-2">
                            <span className="text-muted-foreground text-xs uppercase mr-2">{t(`section.${l.section}`)}</span>
                            {l.label.startsWith("section.") ? t(l.label) : l.label}
                          </td>
                          <td className="py-2 text-right tabular-nums">{fmtDz(l.dozen)}</td>
                          <td className="py-2 text-right tabular-nums">{formatMoney(l.rate)}</td>
                          <td className="py-2 text-right tabular-nums font-medium">
                            {formatMoney(l.amount)}
                            {i === byDate[d].length - 1 && byDate[d].length > 1 && (
                              <span className="block text-xs text-muted-foreground">{t("salary.dayTotal")} {formatMoney(dayTotal)}</span>
                            )}
                          </td>
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totals + advance deduction */}
            <div className="border-t border-border pt-4 space-y-2 max-w-sm ml-auto text-sm">
              {data.salaryType !== "shift" && (
                <Row label={t("salary.totalDozen")} value={fmtDz(totalDozen)} />
              )}
              <Row label={t("salary.gross")} value={formatMoney(data.grossTotal)} />
              <div className="flex items-center justify-between gap-3">
                <span>{t("salary.deductAdvance")}</span>
                <Input type="number" step="1" min="0" className="h-9 w-32 text-right" value={deduct} onChange={(e) => setDeduct(e.target.value)} />
              </div>
              <Row label={t("salary.net")} value={formatMoney(net)} strong />
              <div className="flex items-center justify-between text-muted-foreground text-xs">
                <span>{t("salary.advanceBalance")}</span>
                <span className="tabular-nums">{formatMoney(data.advanceBalance)}</span>
              </div>
              <Button onClick={save} disabled={saving} className="w-full mt-2">
                {t("salary.save")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Payroll for the week: every employee, with the totals to pay out. */
function WeekSheet({
  dateInWeek,
  onPick,
}: {
  dateInWeek: string;
  onPick: (employeeId: number) => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading } = useWeekSalarySheet(dateInWeek);

  if (isLoading) return <p className="text-muted-foreground">{t("common.loading")}</p>;
  if (!data) return null;

  // Everyone is listed so nobody is missed, but the people who actually earned
  // this week come first — that's who payroll is about.
  const rows = [...data.rows].sort(
    (a, b) => b.grossTotal - a.grossTotal || a.employeeName.localeCompare(b.employeeName)
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("salary.allEmployees")}</CardTitle>
        <Badge tone="muted">
          {t("salary.paidEmployees", { count: data.totals.employees, total: data.rows.length })}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm [&_th]:px-2 [&_td]:px-2 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 font-medium">{t("common.employee")}</th>
                <th className="py-2 font-medium text-right">{t("salary.workDone")}</th>
                <th className="py-2 font-medium text-right">{t("salary.gross")}</th>
                <th className="py-2 font-medium text-right">{t("salary.deductAdvance")}</th>
                <th className="py-2 font-medium text-right">{t("salary.net")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.employeeId}
                  onClick={() => onPick(r.employeeId)}
                  className={
                    "border-b border-border/60 cursor-pointer hover:bg-muted/60 " +
                    (r.grossTotal === 0 ? "text-muted-foreground" : "")
                  }
                >
                  <td className="py-2">
                    <span className="font-medium">{r.employeeName}</span>
                    {!r.active && <Badge tone="muted" className="ml-2">{t("common.inactive")}</Badge>}
                    {r.saved && <Badge tone="success" className="ml-2">{t("salary.savedBadge")}</Badge>}
                  </td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground text-xs">
                    {r.salaryType === "shift"
                      ? t("salary.shiftsCount", { count: r.shifts })
                      : fmtDozen(t, r.totalDozen)}
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(r.grossTotal)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {r.advanceDeducted ? `− ${formatMoney(r.advanceDeducted)}` : "—"}
                  </td>
                  <td className="py-2 text-right tabular-nums font-medium">{formatMoney(r.netTotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold">
                <td className="py-3">{t("salary.totalToPay")}</td>
                <td />
                <td className="py-3 text-right tabular-nums">{formatMoney(data.totals.gross)}</td>
                <td className="py-3 text-right tabular-nums">
                  {data.totals.advanceDeducted ? `− ${formatMoney(data.totals.advanceDeducted)}` : "—"}
                </td>
                <td className="py-3 text-right tabular-nums text-lg text-primary">
                  {formatMoney(data.totals.net)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-xs text-muted-foreground pt-3">{t("salary.sheetHint")}</p>
      </CardContent>
    </Card>
  );
}

function fmtDozen(t: (k: string, o?: any) => string, v: number) {
  const { dozens, pieces } = splitDozenPieces(v);
  return t("common.dzPcs", { dz: dozens, pcs: pieces });
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? "font-semibold" : ""}>{label}</span>
      <span className={`tabular-nums ${strong ? "font-bold text-lg text-primary" : ""}`}>{value}</span>
    </div>
  );
}

export default function SalaryPage() {
  return (
    <PinGate>
      <SalaryInner />
    </PinGate>
  );
}
