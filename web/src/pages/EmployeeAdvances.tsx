import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Wallet, ArrowLeft, Plus } from "lucide-react";
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
import { useEmployeeLedger } from "@/lib/data";
import { api } from "@/lib/api";
import { toastError } from "@/lib/notify";
import { PageTitle } from "@/pages/_parts";
import { PinGate } from "@/components/PinGate";
import { todayIso, formatMoney } from "@/lib/utils";

function AdvancesInner() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const id = Number(useParams().id);

  const [month, setMonth] = useState(""); // "" = all
  const { data: ledger } = useEmployeeLedger(id, month || undefined);

  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["ledger", id] });

  async function add() {
    if (!(Number(amount) > 0)) return;
    setSaving(true);
    try {
      await api.post(`/api/employees/${id}/advances`, {
        date,
        amount: Number(amount),
        note: note.trim() || undefined,
      });
      await invalidate();
      setAmount("");
      setNote("");
      toast.success(t("toast.saved"));
    } catch (err) {
      toastError(err, t);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/employees")} aria-label={t("common.back")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <PageTitle icon={Wallet} title={ledger?.employee.name ?? t("employees.advances")} subtitle={t("advances.subtitle")} />
      </div>

      {/* Balance summary */}
      <div className="grid grid-cols-3 gap-3 max-w-xl">
        <SummaryCard label={t("advances.totalGiven")} value={ledger?.totalGiven ?? 0} />
        <SummaryCard label={t("advances.totalDeducted")} value={ledger?.totalDeducted ?? 0} />
        <SummaryCard label={t("advances.balance")} value={ledger?.balance ?? 0} highlight />
      </div>

      {/* Add advance */}
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{t("advances.addAdvance")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
            <Field label={t("common.date")}>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label={t("employees.advanceAmount")}>
              <Input type="number" step="1" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label={t("employees.note")}>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="—" />
            </Field>
            <Button onClick={add} disabled={saving || !(Number(amount) > 0)}>
              <Plus className="h-4 w-4" />
              {t("common.add")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Month filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{t("advances.filterMonth")}</span>
        <Input type="month" className="max-w-[10rem]" value={month} onChange={(e) => setMonth(e.target.value)} />
        {month && (
          <Button size="sm" variant="ghost" onClick={() => setMonth("")}>
            {t("advances.showAll")}
          </Button>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Given */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("advances.given")}</CardTitle>
            <Badge tone="success">{formatMoney(ledger?.periodGiven ?? 0)}</Badge>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {ledger?.given.map((g) => (
                <div key={g.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="tabular-nums text-muted-foreground">{g.date}</span>
                  <span className="flex-1 px-3 text-muted-foreground truncate">{g.note}</span>
                  <span className="tabular-nums font-medium">{formatMoney(g.amount)}</span>
                </div>
              ))}
              {ledger && !ledger.given.length && (
                <p className="text-muted-foreground text-sm py-2">{t("employees.noAdvances")}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Deducted */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("advances.deducted")}</CardTitle>
            <Badge tone="warning">{formatMoney(ledger?.periodDeducted ?? 0)}</Badge>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {ledger?.deducted.map((d) => (
                <div key={d.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="tabular-nums text-muted-foreground">{d.weekStart} → {d.weekEnd}</span>
                  <span className="tabular-nums font-medium">{formatMoney(d.amount)}</span>
                </div>
              ))}
              {ledger && !ledger.deducted.length && (
                <p className="text-muted-foreground text-sm py-2">{t("advances.noDeductions")}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-xl font-bold tabular-nums ${highlight ? "text-primary" : ""}`}>
          {formatMoney(value)}
        </p>
      </CardContent>
    </Card>
  );
}

export default function EmployeeAdvancesPage() {
  return (
    <PinGate>
      <AdvancesInner />
    </PinGate>
  );
}
