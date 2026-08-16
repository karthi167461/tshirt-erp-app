import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Input } from "@/components/ui";
import { Combobox } from "@/components/Combobox";
import { useStageEntries, useEmployees, type StageEntry } from "@/lib/data";
import { api } from "@/lib/api";
import { toastError } from "@/lib/notify";
import { blockDecimal, clampPieces } from "@/lib/utils";
import { Pagination } from "@/pages/_parts";

const PAGE_SIZE = 20;

/** Log of entries for a stage + cutting lot, with inline edit and delete.
 *  Paginated, filterable to one employee. */
export function EntryLog({
  stage,
  cuttingLotId,
  onChanged,
}: {
  stage: string;
  cuttingLotId: number | undefined;
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const { data: employees } = useEmployees();
  const [page, setPage] = useState(1);
  const [employeeId, setEmployeeId] = useState("");
  const { data: list } = useStageEntries(stage, cuttingLotId, {
    page,
    pageSize: PAGE_SIZE,
    employeeId: employeeId ? Number(employeeId) : undefined,
  });

  // A different lot is a different log — filters from the old one don't apply.
  useEffect(() => {
    setPage(1);
    setEmployeeId("");
  }, [cuttingLotId]);

  if (!cuttingLotId) return null;

  return (
    <Card className="max-w-3xl">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">{t("entryLog.title")}</CardTitle>
        <div className="w-56">
          <Combobox
            className="h-8"
            value={employeeId}
            onChange={(v) => {
              setEmployeeId(v);
              setPage(1);
            }}
            placeholder={t("entryLog.allEmployees")}
            options={[
              { value: "", label: t("entryLog.allEmployees") },
              ...(employees ?? []).map((emp) => ({
                value: String(emp.id),
                label: emp.name,
              })),
            ]}
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm [&_th]:px-2 [&_td]:px-2 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 font-medium">{t("common.date")}</th>
                <th className="py-2 font-medium">{t("common.color")}</th>
                {stage === "stretching" && (
                  <th className="py-2 font-medium">{t("nav.stretching")}</th>
                )}
                <th className="py-2 font-medium text-right">{t("common.dozen")}</th>
                <th className="py-2 font-medium text-right">{t("common.pieces")}</th>
                <th className="py-2 font-medium">{t("common.employee")}</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {list?.items.map((e) => (
                <EntryRow key={e.id} stage={stage} entry={e} onChanged={onChanged} />
              ))}
              {list && !list.items.length && (
                <tr>
                  <td colSpan={stage === "stretching" ? 7 : 6} className="py-3 text-muted-foreground">
                    {t("entryLog.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {list && list.total > 0 && (
          <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={setPage} />
        )}
      </CardContent>
    </Card>
  );
}

function EntryRow({
  stage,
  entry,
  onChanged,
}: {
  stage: string;
  entry: StageEntry;
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: employees } = useEmployees(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    dozen: String(entry.dozen),
    pieces: entry.pieces != null ? String(entry.pieces) : "",
    employeeId: String(entry.employeeId),
    date: entry.date,
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["stageEntries", stage, entry.cuttingLotId] });
    onChanged?.();
  }

  async function save() {
    try {
      const payload: any = {
        dozen: Number(form.dozen || 0),
        employeeId: Number(form.employeeId),
        date: form.date,
      };
      if (form.pieces) payload.pieces = Number(form.pieces);
      await api.put(`/api/${stage}/${entry.id}`, payload);
      toast.success(t("toast.saved"));
      setEditing(false);
      refresh();
    } catch (err) {
      toastError(err, t);
    }
  }

  async function del() {
    try {
      await api.del(`/api/${stage}/${entry.id}`);
      toast.success(t("toast.saved"));
      refresh();
    } catch (err) {
      toastError(err, t);
    }
  }

  if (editing) {
    return (
      <tr className="border-b border-border/60 bg-muted/40">
        <td className="py-2"><Input type="date" className="h-8" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></td>
        <td className="py-2">{entry.color}</td>
        {stage === "stretching" && <td className="py-2">{entry.stretchingType?.name}</td>}
        <td className="py-2"><Input type="number" step="1" min="0" onKeyDown={blockDecimal} className="h-8 w-16" value={form.dozen} onChange={(e) => setForm({ ...form, dozen: e.target.value })} /></td>
        <td className="py-2"><Input type="number" step="1" min="0" max="11" onKeyDown={blockDecimal} className="h-8 w-16" value={form.pieces} onChange={(e) => setForm({ ...form, pieces: clampPieces(e.target.value) })} /></td>
        <td className="py-2 min-w-[10rem]">
          <Combobox
            className="h-8"
            value={form.employeeId}
            onChange={(v) => setForm({ ...form, employeeId: v })}
            options={(employees ?? []).map((emp) => ({
              value: String(emp.id),
              label: emp.name,
            }))}
          />
        </td>
        <td className="py-2">
          <div className="flex gap-1 justify-end">
            <button onClick={save} aria-label={t("common.save")}><Check className="h-4 w-4 text-emerald-600" /></button>
            <button onClick={() => setEditing(false)} aria-label={t("common.cancel")}><X className="h-4 w-4 text-muted-foreground" /></button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border/60">
      <td className="py-2 tabular-nums">{entry.date}</td>
      <td className="py-2">{entry.color}</td>
      {stage === "stretching" && <td className="py-2">{entry.stretchingType?.name}</td>}
      <td className="py-2 text-right tabular-nums">{entry.dozen}</td>
      <td className="py-2 text-right tabular-nums">{entry.pieces ?? 0}</td>
      <td className="py-2">{entry.employee.name}</td>
      <td className="py-2">
        <div className="flex gap-1 justify-end">
          <button onClick={() => setEditing(true)} aria-label={t("common.edit")}><Pencil className="h-4 w-4 text-muted-foreground" /></button>
          <button onClick={del} aria-label={t("common.delete")}><Trash2 className="h-4 w-4 text-destructive" /></button>
        </div>
      </td>
    </tr>
  );
}
