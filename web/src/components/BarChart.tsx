/**
 * Minimal hand-rolled SVG bar chart — no chart library on purpose (bundle is
 * already heavy and the needs are small). Two variants:
 *
 * - "bars":  one horizontal bar per group (single series) — magnitude readout,
 *            e.g. dozens per stage. Single hue (--primary), no legend needed.
 * - "meter": each group carries [total, done] — done is a solid --primary fill
 *            drawn over the total as a light track of the SAME hue, the meter
 *            pattern, so it reads correctly whatever theme colour the user has
 *            configured in Settings (no second categorical hue to clash).
 *
 * Every bar gets its value labelled at the tip (counts here are small) in text
 * ink — never in the series colour — plus a native <title> tooltip. Bars are
 * 16px thick with a 4px rounded data-end and a square baseline end.
 */
import { useTranslation } from "react-i18next";

export interface BarChartGroup {
  label: string;
  /** "bars": [value]. "meter": [total, done]. */
  values: number[];
}

const BAR_H = 16;
const LABEL_H = 16;
const ROW_GAP = 14;
const CHART_W = 600;
const FONT = 11;

/** Horizontal bar path: square at the baseline (left), 4px rounded data-end. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w);
  return `M ${x} ${y} h ${w - r} a ${r} ${r} 0 0 1 ${r} ${r} v ${h - 2 * r} a ${r} ${r} 0 0 1 ${-r} ${r} h ${-(w - r)} Z`;
}

export function BarChart({
  groups,
  variant = "bars",
  formatValue = (v) => String(v),
  meterLabels,
  className,
}: {
  groups: BarChartGroup[];
  variant?: "bars" | "meter";
  formatValue?: (v: number) => string;
  /** Legend labels for the meter variant: [track (total), fill (done)]. */
  meterLabels?: [string, string];
  className?: string;
}) {
  const { t } = useTranslation();
  if (!groups.length) {
    return <p className="text-sm text-muted-foreground">{t("common.noData")}</p>;
  }

  const max = Math.max(1e-9, ...groups.flatMap((g) => g.values));
  // Room for the tip label — the meter's "done / total" runs twice as long.
  const rightPad = variant === "meter" ? 150 : 80;
  const innerW = CHART_W - rightPad;
  const rowH = LABEL_H + BAR_H + ROW_GAP;
  const height = groups.length * rowH;
  const scale = (v: number) => Math.max(0, (v / max) * innerW);

  return (
    <div className={className}>
      {variant === "meter" && meterLabels && (
        <div className="flex gap-4 mb-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ background: "var(--primary)", opacity: 0.2 }}
            />
            {meterLabels[0]}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--primary)" }} />
            {meterLabels[1]}
          </span>
        </div>
      )}
      <svg
        viewBox={`0 0 ${CHART_W} ${height}`}
        width="100%"
        role="img"
        style={{ maxWidth: CHART_W }}
      >
        {groups.map((g, i) => {
          const y0 = i * rowH;
          const barY = y0 + LABEL_H;
          const total = g.values[0] ?? 0;
          const done = g.values[1] ?? 0;
          const tip = variant === "meter" ? scale(total) : scale(g.values[0] ?? 0);
          const valueText =
            variant === "meter"
              ? `${formatValue(done)} / ${formatValue(total)}`
              : formatValue(g.values[0] ?? 0);
          return (
            <g key={g.label + i}>
              <text
                x={0}
                y={y0 + FONT}
                fontSize={FONT}
                fill="var(--muted-foreground)"
              >
                {g.label}
              </text>
              {/* hairline baseline tick keeps zero-value rows visible */}
              <rect x={0} y={barY} width={1} height={BAR_H} fill="var(--border)" />
              {variant === "meter" ? (
                <>
                  {total > 0 && (
                    <path d={barPath(0, barY, scale(total), BAR_H)} fill="var(--primary)" opacity={0.2}>
                      <title>{`${g.label} — ${meterLabels?.[0] ?? ""}: ${formatValue(total)}`}</title>
                    </path>
                  )}
                  {done > 0 && (
                    <path d={barPath(0, barY, scale(done), BAR_H)} fill="var(--primary)">
                      <title>{`${g.label} — ${meterLabels?.[1] ?? ""}: ${formatValue(done)}`}</title>
                    </path>
                  )}
                </>
              ) : (
                (g.values[0] ?? 0) > 0 && (
                  <path d={barPath(0, barY, scale(g.values[0] ?? 0), BAR_H)} fill="var(--primary)">
                    <title>{`${g.label}: ${valueText}`}</title>
                  </path>
                )
              )}
              <text
                x={tip + 8}
                y={barY + BAR_H / 2 + FONT / 2 - 1.5}
                fontSize={FONT}
                fill="var(--foreground)"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {valueText}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
