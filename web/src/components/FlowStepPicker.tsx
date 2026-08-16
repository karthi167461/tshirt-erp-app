import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui";
import { useLotFlowStatus } from "@/lib/data";
import { fmtQty } from "@/lib/utils";

/**
 * The stretching-type picker for a lot that carries a flow: its steps, in
 * order, each with the lot-wide standing (Σ across colours). Selecting a row
 * sets the stretchingTypeId for the entry form.
 *
 * Blocked steps stay selectable on purpose — ceilings are per colour and the
 * server is the authority; a row here is information, not a gate. No
 * `role="group"` (MasterEntry's * and . handlers key off it); rows take
 * `data-ring` via the `ring` prop so the +/− focus ring can reach them.
 */
export function FlowStepPicker({
  cuttingLotId,
  steps,
  value,
  onChange,
  ring = false,
}: {
  cuttingLotId?: number;
  steps: { typeId: number; position: number; name: string }[];
  value: string;
  onChange: (stretchingTypeId: string) => void;
  ring?: boolean;
}) {
  const { t } = useTranslation();
  const { data: status } = useLotFlowStatus(cuttingLotId);

  // Lot-wide standing per step: sum the per-colour rows from /status.
  const byType = new Map<number, { total: number; ceiling: number; remaining: number }>();
  for (const color of status ?? []) {
    for (const s of color.steps) {
      const agg = byType.get(s.typeId) ?? { total: 0, ceiling: 0, remaining: 0 };
      agg.total += s.total;
      agg.ceiling += s.ceiling;
      agg.remaining += Math.max(0, s.remaining);
      byType.set(s.typeId, agg);
    }
  }

  return (
    <div className="rounded-md border border-border bg-muted/40 divide-y divide-border">
      {steps.map((step) => {
        const on = value === String(step.typeId);
        const agg = byType.get(step.typeId);
        const blocked = !!agg && agg.ceiling <= 0;
        const done = !!agg && agg.ceiling > 0 && agg.remaining <= 0;
        return (
          <button
            key={step.typeId}
            type="button"
            {...(ring ? { "data-ring": true } : {})}
            onClick={() => onChange(String(step.typeId))}
            aria-pressed={on}
            className={
              "w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors " +
              (on ? "bg-primary/10" : "hover:bg-muted")
            }
          >
            <span className="flex items-center gap-2 min-w-0">
              <span className="h-6 w-6 shrink-0 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center tabular-nums">
                {step.position}
              </span>
              <span className={on ? "font-semibold" : "font-medium"}>{step.name}</span>
            </span>
            <span className="flex items-center gap-2 shrink-0 tabular-nums">
              {agg && (
                <span className="text-muted-foreground text-xs">
                  {fmtQty(t, agg.total)} / {fmtQty(t, agg.ceiling)}
                </span>
              )}
              {blocked ? (
                <Badge tone="muted">{t("form.stepBlocked")}</Badge>
              ) : done ? (
                <Badge tone="muted">{t("form.stepDone")}</Badge>
              ) : agg ? (
                <Badge tone="success">{fmtQty(t, agg.remaining)}</Badge>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
