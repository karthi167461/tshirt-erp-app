import { toast } from "sonner";
import type { TFunction } from "i18next";
import { ApiError } from "./api";
import { splitDozenPieces } from "./utils";

/** Show a translated error toast from any thrown error. */
export function toastError(err: unknown, t: TFunction) {
  if (err instanceof ApiError) {
    const params: Record<string, unknown> = { ...(err.params ?? {}) };
    // Show quota "remaining" as dozen+pieces, not a decimal.
    if (err.code === "error.quota_exceeded" && typeof params.remaining === "number") {
      const { dozens, pieces } = splitDozenPieces(params.remaining);
      params.remaining = t("common.dzPcs", { dz: dozens, pcs: pieces });
    }
    // Validation errors may carry a more specific translatable detail
    // (e.g. error.slab_overlap from a zod refinement) — prefer it.
    const key =
      err.code === "error.validation" && typeof params.detail === "string" && params.detail.startsWith("error.")
        ? params.detail
        : err.code;
    toast.error(t(key, params) as string);
  } else {
    toast.error(t("error.internal") as string);
  }
}

/** Contrasting text color (#fff/#111) for a given hex background. */
export function contrastText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111827" : "#ffffff";
}
