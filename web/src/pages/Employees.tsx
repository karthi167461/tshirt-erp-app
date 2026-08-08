import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Users, Plus, Wallet, Pencil, Check, X, Power, Printer } from "lucide-react";
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
import { useEmployeesPaged, type Employee } from "@/lib/data";
import { api } from "@/lib/api";
import { toastError } from "@/lib/notify";
import { PageTitle, SearchBox, Pagination } from "@/pages/_parts";
import { PinGate } from "@/components/PinGate";
import { PrintSheet, type PrintLabel } from "@/components/PrintSheet";
import { SECTIONS, SALARY_TYPES, encodeBarcode } from "@erp/shared";

const PAGE_SIZE = 20;

function EmployeesInner() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [form, setForm] = useState({ name: "", phone: "", role: "cutting", salaryType: "piece", shiftRate: "" });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [labels, setLabels] = useState<PrintLabel[]>([]);

  const { data } = useEmployeesPaged({ search, page, pageSize: PAGE_SIZE });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["employeesPaged"] });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api.post("/api/employees", {
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        role: form.role,
        salaryType: form.salaryType,
        shiftRate: form.salaryType === "shift" ? Number(form.shiftRate) || 0 : 0,
      });
      toast.success(t("toast.employeeSaved"));
      setForm({ name: "", phone: "", role: form.role, salaryType: form.salaryType, shiftRate: "" });
      invalidate();
    } catch (err) {
      toastError(err, t);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle icon={Users} title={t("employees.title")} subtitle={t("employees.subtitle")} />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{t("employees.add")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
            <Field label={t("common.name")}>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label={t("employees.phone")}>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="—" />
            </Field>
            <Field label={t("common.role")}>
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {SECTIONS.map((s) => (
                  <option key={s} value={s}>{t(`section.${s}`)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("employees.salaryType")}>
              <Select value={form.salaryType} onChange={(e) => setForm({ ...form, salaryType: e.target.value })}>
                {SALARY_TYPES.map((s) => (
                  <option key={s} value={s}>{t(`employees.type_${s}`)}</option>
                ))}
              </Select>
            </Field>
            {form.salaryType === "shift" && (
              <Field label={t("employees.shiftRate")}>
                <Input type="number" step="0.5" min="0" value={form.shiftRate} onChange={(e) => setForm({ ...form, shiftRate: e.target.value })} />
              </Field>
            )}
            <div className="col-span-2 sm:col-span-3">
              <Button type="submit" disabled={!form.name.trim() || saving}>
                <Plus className="h-4 w-4" />
                {t("common.add")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("employees.list")}</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLabels((data?.items ?? []).filter((e) => e.active).map(toLabel))}
          >
            <Printer className="h-4 w-4" />
            {t("barcode.printAll")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={t("employees.searchPlaceholder")} />
          <div className="divide-y divide-border">
            {data?.items.map((emp) => (
              <EmployeeRow
                key={emp.id}
                emp={emp}
                onChanged={invalidate}
                onPrint={(e) => setLabels([toLabel(e)])}
              />
            ))}
            {data && !data.items.length && (
              <p className="text-muted-foreground py-2">{t("common.noData")}</p>
            )}
          </div>
          {data && (
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
          )}
        </CardContent>
      </Card>

      {/* Tamil names print correctly here because this is the live DOM, not a PDF. */}
      {!!labels.length && <PrintSheet labels={labels} onDone={() => setLabels([])} />}
    </div>
  );
}

/** Employee → barcode label. Phone is the subtitle so a supervisor can match faces to labels. */
function toLabel(emp: Employee): PrintLabel {
  return {
    code: encodeBarcode("employee", emp.id),
    title: emp.name,
    subtitle: emp.phone ?? undefined,
  };
}

function EmployeeRow({
  emp,
  onChanged,
  onPrint,
}: {
  emp: Employee;
  onChanged: () => void;
  onPrint: (emp: Employee) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({
    name: emp.name,
    phone: emp.phone ?? "",
    role: emp.role,
    salaryType: emp.salaryType,
    shiftRate: String(emp.shiftRate ?? 0),
  });

  async function update(data: Record<string, unknown>) {
    try {
      await api.put(`/api/employees/${emp.id}`, data);
      onChanged();
    } catch (err) {
      toastError(err, t);
    }
  }

  async function saveEdit() {
    if (!f.name.trim()) return;
    await update({
      name: f.name.trim(),
      phone: f.phone.trim() || undefined,
      role: f.role,
      salaryType: f.salaryType,
      shiftRate: f.salaryType === "shift" ? Number(f.shiftRate) || 0 : 0,
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 py-3 items-end">
        <Field label={t("common.name")}><Input className="h-9" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={t("employees.phone")}><Input className="h-9" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label={t("common.role")}>
          <Select className="h-9" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            {SECTIONS.map((s) => <option key={s} value={s}>{t(`section.${s}`)}</option>)}
          </Select>
        </Field>
        <Field label={t("employees.salaryType")}>
          <Select className="h-9" value={f.salaryType} onChange={(e) => setF({ ...f, salaryType: e.target.value as "piece" | "shift" })}>
            {SALARY_TYPES.map((s) => <option key={s} value={s}>{t(`employees.type_${s}`)}</option>)}
          </Select>
        </Field>
        {f.salaryType === "shift" ? (
          <Field label={t("employees.shiftRate")}><Input type="number" step="0.5" min="0" className="h-9" value={f.shiftRate} onChange={(e) => setF({ ...f, shiftRate: e.target.value })} /></Field>
        ) : <div />}
        <div className="col-span-2 sm:col-span-5 flex gap-2">
          <Button size="sm" onClick={saveEdit}><Check className="h-4 w-4" />{t("common.save")}</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X className="h-4 w-4" />{t("common.cancel")}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <span className="font-medium">{emp.name}</span>
        <span className="text-muted-foreground text-sm ml-2">{t(`section.${emp.role}`)}</span>
        {emp.phone && <span className="text-muted-foreground text-sm ml-2">· {emp.phone}</span>}
        <Badge tone="muted" className="ml-2">
          {t(`employees.type_${emp.salaryType}`)}{emp.salaryType === "shift" ? ` · ${emp.shiftRate}` : ""}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => setEditing(true)} aria-label={t("common.edit")}><Pencil className="h-4 w-4 text-muted-foreground" /></button>
        <button onClick={() => onPrint(emp)} aria-label={t("barcode.print")} title={encodeBarcode("employee", emp.id)}>
          <Printer className="h-4 w-4 text-muted-foreground" />
        </button>
        <Button size="sm" variant="outline" onClick={() => navigate(`/employees/${emp.id}/advances`)}>
          <Wallet className="h-4 w-4" />
          {t("employees.advances")}
        </Button>
        <Badge tone={emp.active ? "success" : "muted"}>
          {emp.active ? t("common.active") : t("common.inactive")}
        </Badge>
        <Button
          size="sm"
          variant={emp.active ? "ghost" : "outline"}
          onClick={() => update({ active: !emp.active })}
        >
          <Power className="h-4 w-4" />
          {emp.active ? t("employees.deactivate") : t("employees.activate")}
        </Button>
      </div>
    </div>
  );
}

export default function EmployeesPage() {
  return (
    <PinGate>
      <EmployeesInner />
    </PinGate>
  );
}
