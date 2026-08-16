import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { KeyboardEvent } from "react";

/** Prevent decimal/scientific keystrokes in integer-only number inputs. */
export function blockDecimal(e: KeyboardEvent<HTMLInputElement>) {
  if ([".", ",", "e", "E", "+", "-"].includes(e.key)) e.preventDefault();
}

/** Clamp a pieces-input string to 0–11 (12 pieces = 1 dozen). Keeps "" empty. */
export function clampPieces(raw: string): string {
  if (raw === "") return "";
  const n = Math.floor(Number(raw));
  if (Number.isNaN(n)) return "";
  if (n < 0) return "0";
  if (n > 11) return "11";
  return String(n);
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** yyyy-mm-dd for a Date in local time. */
export function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayIso(): string {
  return toIso(new Date());
}

/** Add days to an ISO date string, returning a new ISO date. */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

export function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(n);
}

/** Format a dozen quantity as "N dz M pcs" (pieces shown clearly, no decimals). */
export function fmtQty(t: (k: string, o?: any) => string, qty: number): string {
  const { dozens, pieces } = splitDozenPieces(qty);
  return t("common.dzPcs", { dz: dozens, pcs: pieces });
}

/** Like fmtQty but omits a zero pieces part — for tight spots (chart labels). */
export function fmtQtyCompact(t: (k: string, o?: any) => string, qty: number): string {
  const { dozens, pieces } = splitDozenPieces(qty);
  return pieces > 0
    ? t("common.dzPcs", { dz: dozens, pcs: pieces })
    : t("common.dzOnly", { dz: dozens });
}

/** Split a dozen quantity (e.g. 5.5) into whole dozens + remaining pieces (12/dozen). */
export function splitDozenPieces(qty: number): { dozens: number; pieces: number } {
  const safe = Math.max(0, qty);
  let dozens = Math.floor(safe + 1e-9);
  let pieces = Math.round((safe - dozens) * 12);
  if (pieces >= 12) {
    dozens += 1;
    pieces -= 12;
  }
  return { dozens, pieces };
}
