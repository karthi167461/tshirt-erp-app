import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ListOrdered,
  Plus,
  ArrowUp,
  ArrowDown,
  X,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
  Button,
  Field,
  Badge,
} from "@/components/ui";
import { useStretchingTypes, useStretchingFlows, type StretchingFlow } from "@/lib/data";
import { api } from "@/lib/api";
import { toastError } from "@/lib/notify";
import { PageTitle } from "@/pages/_parts";

/**
 * Master screen for stretching flows: a named, ORDERED list of stretching types
 * plus whether kainool applies after the last step. The order is the quota
 * chain — step 1 is bounded by pouch, step i by step i-1 (see server quota.ts).
 */
export default function StretchingFlowsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: flows } = useStretchingFlows();
  const { data: types } = useStretchingTypes(true);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [skipKainool, setSkipKainool] = useState(false);
  const [steps, setSteps] = useState<number[]>([]);
  const [nextType, setNextType] = useState("");

  const typeName = new Map((types ?? []).map((ty) => [ty.id, ty.name]));
  // A type can appear only once per flow; hide ones already picked.
  const addable = (types ?? []).filter((ty) => !steps.includes(ty.id));
  const canSave = name.trim().length > 0 && steps.length > 0;

  function resetForm() {
    setEditingId(null);
    setName("");
    setSkipKainool(false);
    setSteps([]);
    setNextType("");
  }

  function startEdit(flow: StretchingFlow) {
    setEditingId(flow.id);
    setName(flow.name);
    setSkipKainool(flow.skipKainool);
    setSteps(flow.steps.map((s) => s.stretchingTypeId));
    setNextType("");
  }

  function addStep() {
    const id = Number(nextType);
    if (!id || steps.includes(id)) return;
    setSteps((s) => [...s, id]);
    setNextType("");
  }

  function move(index: number, delta: -1 | 1) {
    setSteps((s) => {
      const to = index + delta;
      if (to < 0 || to >= s.length) return s;
      const next = [...s];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }

  async function save() {
    if (!canSave) return;
    const body = { name: name.trim(), skipKainool, steps };
    try {
      if (editingId) await api.put(`/api/stretching-flows/${editingId}`, body);
      else await api.post("/api/stretching-flows", body);
      await qc.invalidateQueries({ queryKey: ["stretchingFlows"] });
      toast.success(t("flows.saved"));
      resetForm();
    } catch (err) {
      toastError(err, t);
    }
  }

  async function toggleActive(flow: StretchingFlow) {
    try {
      await api.put(`/api/stretching-flows/${flow.id}`, { active: !flow.active });
      await qc.invalidateQueries({ queryKey: ["stretchingFlows"] });
    } catch (err) {
      toastError(err, t);
    }
  }

  async function del(id: number) {
    try {
      await api.del(`/api/stretching-flows/${id}`);
      await qc.invalidateQueries({ queryKey: ["stretchingFlows"] });
      toast.success(t("flows.deleted"));
      if (editingId === id) resetForm();
    } catch (err) {
      toastError(err, t);
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle icon={ListOrdered} title={t("flows.title")} subtitle={t("flows.subtitle")} />

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        {/* Create / edit */}
        <Card>
          <CardHeader>
            <CardTitle>
              {editingId ? t("flows.editing", { name }) : t("flows.new")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label={t("flows.name")}>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-primary"
                checked={skipKainool}
                onChange={(e) => setSkipKainool(e.target.checked)}
              />
              <span>
                <span className="font-medium text-sm">{t("flows.skipKainool")}</span>
                <span className="block text-xs text-muted-foreground">
                  {t("flows.skipKainoolHint")}
                </span>
              </span>
            </label>

            <Field label={t("flows.steps")}>
              <div className="space-y-2">
                {steps.map((typeId, i) => (
                  <div
                    key={typeId}
                    className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
                  >
                    <span className="h-6 w-6 shrink-0 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center tabular-nums">
                      {i + 1}
                    </span>
                    <span className="flex-1 min-w-0 truncate font-medium text-sm">
                      {typeName.get(typeId) ?? `#${typeId}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="disabled:opacity-30"
                      aria-label={t("flows.moveUp")}
                    >
                      <ArrowUp className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === steps.length - 1}
                      className="disabled:opacity-30"
                      aria-label={t("flows.moveDown")}
                    >
                      <ArrowDown className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSteps((s) => s.filter((x) => x !== typeId))}
                      aria-label={t("flows.removeStep")}
                    >
                      <X className="h-4 w-4 text-destructive" />
                    </button>
                  </div>
                ))}
                {!steps.length && (
                  <p className="text-sm text-muted-foreground">{t("flows.noSteps")}</p>
                )}
                <div className="flex gap-2">
                  <Select value={nextType} onChange={(e) => setNextType(e.target.value)}>
                    <option value="">{t("flows.selectType")}</option>
                    {addable.map((ty) => (
                      <option key={ty.id} value={ty.id}>
                        {ty.name}
                      </option>
                    ))}
                  </Select>
                  <Button type="button" variant="outline" onClick={addStep} disabled={!nextType}>
                    <Plus className="h-4 w-4" />
                    {t("flows.addStep")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t("flows.firstStepHint")}</p>
              </div>
            </Field>

            <div className="flex gap-2">
              <Button onClick={save} disabled={!canSave}>
                {editingId ? t("flows.saveChanges") : t("flows.create")}
              </Button>
              {editingId && (
                <Button variant="outline" onClick={resetForm}>
                  {t("flows.cancelEdit")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* List */}
        <Card>
          <CardHeader>
            <CardTitle>{t("flows.list")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {flows?.map((flow) => (
                <div key={flow.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{flow.name}</span>
                      <Badge tone={flow.skipKainool ? "warning" : "muted"}>
                        {flow.skipKainool ? t("flows.skipKainool") : t("flows.withKainool")}
                      </Badge>
                      {!!flow._count?.cuttingLots && (
                        <Badge tone="muted">
                          {t("flows.usedByLots", { count: flow._count.cuttingLots })}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1 truncate">
                      {flow.steps.map((s) => `${s.position}. ${s.stretchingType.name}`).join(" → ")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => toggleActive(flow)}>
                      <Badge tone={flow.active ? "success" : "muted"}>
                        {flow.active ? t("common.active") : t("common.inactive")}
                      </Badge>
                    </button>
                    <button onClick={() => startEdit(flow)} aria-label={t("common.edit")}>
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <button onClick={() => del(flow.id)} aria-label={t("common.delete")}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </button>
                  </div>
                </div>
              ))}
              {!flows?.length && (
                <p className="text-muted-foreground py-2">{t("flows.noFlows")}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
