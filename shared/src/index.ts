import { z } from "zod";

/* ------------------------------------------------------------------ *
 * Shared enums / constants
 * ------------------------------------------------------------------ */

export const SECTIONS = ["cutting", "pouch", "stretching", "pichiru", "packing"] as const;
export type Section = (typeof SECTIONS)[number];

/** Stages that validate against a cutting-lot quota (used by the quota endpoint). */
export const QUOTA_STAGES = ["pouch", "stretching", "pichiru", "packing"] as const;
export type QuotaStage = (typeof QUOTA_STAGES)[number];

export const ROLES = SECTIONS;
export type Role = Section;

/** Fabrication lot lifecycle: draft → dyeing → ready (ready lots appear in Cutting). */
export const FABRICATION_STATUS = ["draft", "dyeing", "ready"] as const;
export type FabricationStatus = (typeof FABRICATION_STATUS)[number];

/**
 * Fabrication lot type. Only `job_given_out` uses the short flow (cutting →
 * packing, packing capped by cutting); every other type uses the full chain.
 */
export const FABRICATION_TYPE = [
  "own",
  "job_given_out",
  "job_from_out_own",
  "job_worker_out",
] as const;
export type FabricationType = (typeof FABRICATION_TYPE)[number];

/** Fabrication types that skip pouch/stretching/kainool (cutting → packing only). */
export const SHORT_FLOW_TYPES: readonly FabricationType[] = ["job_given_out"];

/** Cutting lot lifecycle: active → completed (completed drops off downstream lists). */
export const CUTTING_STATUS = ["active", "completed"] as const;
export type CuttingStatus = (typeof CUTTING_STATUS)[number];

/** Error codes are returned by the API as i18n keys; the client translates them. */
export const ErrorCode = {
  LOT_NOT_FOUND: "error.lot_not_found",
  COLOR_NOT_FOUND: "error.color_not_found",
  NO_CUTTING_QUOTA: "error.no_cutting_quota",
  QUOTA_EXCEEDED: "error.quota_exceeded",
  EMPLOYEE_NOT_FOUND: "error.employee_not_found",
  STRETCHING_TYPE_NOT_FOUND: "error.stretching_type_not_found",
  DUPLICATE_LOT: "error.duplicate_lot",
  DUPLICATE: "error.duplicate",
  INVALID_PIN: "error.invalid_pin",
  VALIDATION: "error.validation",
  INTERNAL: "error.internal",
  // Fabrication / masters (Phase 1)
  FABRICATION_LOT_NOT_FOUND: "error.fabrication_lot_not_found",
  FABRICATION_ROLL_NOT_FOUND: "error.fabrication_roll_not_found",
  CATEGORY_NOT_FOUND: "error.category_not_found",
  SIZE_NOT_FOUND: "error.size_not_found",
  // Cutting hierarchy / quota chain (Phase 2)
  CUTTING_LOT_NOT_FOUND: "error.cutting_lot_not_found",
  FABRICATION_NOT_READY: "error.fabrication_not_ready",
  LOT_LOCKED: "error.lot_locked",
  NO_PICHIRU_TOTAL: "error.no_pichiru_total",
  ENTRY_NOT_FOUND: "error.entry_not_found",
  ADVANCE_EXCEEDED: "error.advance_exceeded",
  IN_USE: "error.in_use",
  DIA_LINK_NOT_FOUND: "error.dia_link_not_found",
  // Sequential quota chain: upstream stage has no quantity yet
  NO_POUCH_TOTAL: "error.no_pouch_total",
  NO_STRETCHING_TOTAL: "error.no_stretching_total",
  // Fabrication type flow + rip cutting
  STAGE_NOT_ALLOWED: "error.stage_not_allowed",
  NO_RIP_MATERIAL: "error.no_rip_material",
  RIP_EXCEEDED: "error.rip_exceeded",
  // Stretching size-range slabs
  SLAB_OVERLAP: "error.slab_overlap",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/* ------------------------------------------------------------------ *
 * Reusable field schemas
 * ------------------------------------------------------------------ */

const id = z.coerce.number().int().positive();
/** Dozen may be 0 for a pieces-only entry; a positive total is enforced per entry. */
const dozen = z.coerce.number().int().min(0, { message: ErrorCode.VALIDATION }).default(0);
const color = z.string().trim().min(1).max(60);
const lotNumber = z.string().trim().min(1).max(60);
/** Store dates as ISO yyyy-mm-dd (local business day). */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: ErrorCode.VALIDATION });

/* ------------------------------------------------------------------ *
 * Employees
 * ------------------------------------------------------------------ */

export const SALARY_TYPES = ["piece", "shift"] as const;
export type SalaryType = (typeof SALARY_TYPES)[number];

export const employeeInput = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(20).optional(),
  role: z.string().trim().min(1).max(40),
  salaryType: z.enum(SALARY_TYPES).default("piece"),
  shiftRate: z.coerce.number().nonnegative().default(0),
  advance: z.coerce.number().nonnegative().default(0),
  active: z.boolean().default(true),
});
export type EmployeeInput = z.infer<typeof employeeInput>;

/** Save a week's shift counts for shift-type employees (bulk upsert). */
export const shiftSaveInput = z.object({
  date: isoDate,
  entries: z.array(
    z.object({ employeeId: id, shifts: z.coerce.number().nonnegative() })
  ),
});
export type ShiftSaveInput = z.infer<typeof shiftSaveInput>;

/** A dated advance credit for an employee. */
export const advanceInput = z.object({
  date: isoDate,
  amount: z.coerce.number().positive({ message: ErrorCode.VALIDATION }),
  note: z.string().trim().max(120).optional(),
});
export type AdvanceInput = z.infer<typeof advanceInput>;

/* ------------------------------------------------------------------ *
 * Masters — categories / sizes / colors (settings)
 * ------------------------------------------------------------------ */

export const categoryInput = z.object({
  name: z.string().trim().min(1).max(80),
  active: z.boolean().default(true),
});
export type CategoryInput = z.infer<typeof categoryInput>;

export const sizeInput = z.object({
  categoryId: id,
  name: z.string().trim().min(1).max(40),
  active: z.boolean().default(true),
});
export type SizeInput = z.infer<typeof sizeInput>;

export const colorInput = z.object({
  name: z.string().trim().min(1).max(60),
  active: z.boolean().default(true),
});
export type ColorInput = z.infer<typeof colorInput>;

/** Same `dia` constraint as fabricationRollInput/cuttingLotInput, so any dia
 *  string that already exists in the data can be mapped. */
export const diaSizeLinkInput = z.object({
  dia: z.string().trim().min(1).max(40),
  categoryId: id,
  sizeId: id,
});
export type DiaSizeLinkInput = z.infer<typeof diaSizeLinkInput>;

/* ------------------------------------------------------------------ *
 * Pricing — cutting by (category, size); pouch by category
 * ------------------------------------------------------------------ */

export const cuttingPriceInput = z.object({
  categoryId: id,
  sizeId: id,
  pricePerDozen: z.coerce.number().nonnegative(),
});
export type CuttingPriceInput = z.infer<typeof cuttingPriceInput>;

export const pouchPriceInput = z.object({
  categoryId: id,
  pricePerDozen: z.coerce.number().nonnegative(),
});
export type PouchPriceInput = z.infer<typeof pouchPriceInput>;

/* ------------------------------------------------------------------ *
 * Fabrication — lot + rolls + two-stage weight updates
 * ------------------------------------------------------------------ */

export const fabricationLotInput = z.object({
  lotNumber: z.string().trim().min(1).max(60),
  type: z.enum(FABRICATION_TYPE).default("own"),
});
export type FabricationLotInput = z.infer<typeof fabricationLotInput>;

export const fabricationTypeInput = z.object({
  type: z.enum(FABRICATION_TYPE),
});
export type FabricationTypeInput = z.infer<typeof fabricationTypeInput>;

/** Rip cutting: a weight consumed against a fabrication lot's 12-dia dyeing weight. */
export const ripCuttingInput = z.object({
  fabricationLotId: id,
  weight: z.coerce.number().positive(),
});
export type RipCuttingInput = z.infer<typeof ripCuttingInput>;

export const fabricationRollInput = z.object({
  dia: z.string().trim().min(1).max(40),
  rollCount: z.coerce.number().int().positive(),
  weight: z.coerce.number().nonnegative(),
  texturePinnal: z.string().trim().min(1).max(60),
});
export type FabricationRollInput = z.infer<typeof fabricationRollInput>;

export const fabricationStage1Input = z.object({
  fabricationWeight: z.coerce.number().nonnegative(),
});
export type FabricationStage1Input = z.infer<typeof fabricationStage1Input>;

export const fabricationStage2Input = z.object({
  dyeingWeight: z.coerce.number().nonnegative(),
});
export type FabricationStage2Input = z.infer<typeof fabricationStage2Input>;

export const fabricationStatusInput = z.object({
  status: z.enum(FABRICATION_STATUS),
});
export type FabricationStatusInput = z.infer<typeof fabricationStatusInput>;

export const fabricationLockInput = z.object({
  locked: z.boolean(),
});
export type FabricationLockInput = z.infer<typeof fabricationLockInput>;

/** Rename a lot (edit its lot number). Unique across lots; unlocked only. */
export const fabricationRenameInput = z.object({
  lotNumber: z.string().trim().min(1).max(60),
});
export type FabricationRenameInput = z.infer<typeof fabricationRenameInput>;

/* ------------------------------------------------------------------ *
 * Stretching types (settings)
 * ------------------------------------------------------------------ */

export const stretchingTypeInput = z.object({
  name: z.string().trim().min(1).max(80),
  amountPerDozen: z.coerce.number().nonnegative().default(0), // set on the Pricing page
  active: z.boolean().default(true),
});
export type StretchingTypeInput = z.infer<typeof stretchingTypeInput>;

/**
 * Size-range price slabs for a stretching type. A lot whose numeric size falls
 * in [minSize, maxSize] (inclusive) earns pricePerDozen; anything else falls
 * back to StretchingType.amountPerDozen (the "without size" rate).
 */
export const stretchingSlabInput = z
  .object({
    minSize: z.coerce.number().nonnegative(),
    maxSize: z.coerce.number().nonnegative(),
    pricePerDozen: z.coerce.number().nonnegative(),
  })
  .refine((s) => s.minSize <= s.maxSize, { message: ErrorCode.VALIDATION, path: ["maxSize"] });
export type StretchingSlabInput = z.infer<typeof stretchingSlabInput>;

export const stretchingSlabsInput = z
  .object({
    slabs: z.array(stretchingSlabInput).max(50),
  })
  .superRefine((v, ctx) => {
    // Bounds are inclusive, so touching ranges (18-24, 24-30) also overlap.
    const sorted = [...v.slabs].sort((a, b) => a.minSize - b.minSize);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].minSize <= sorted[i - 1].maxSize) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: ErrorCode.SLAB_OVERLAP, path: ["slabs"] });
        return;
      }
    }
  });
export type StretchingSlabsInput = z.infer<typeof stretchingSlabsInput>;

/* ------------------------------------------------------------------ *
 * Settings (single row)
 * ------------------------------------------------------------------ */

export const settingsInput = z.object({
  companyName: z.string().trim().min(1).max(120),
  themeColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{6})$/, { message: ErrorCode.VALIDATION }),
  cuttingPricePerDozen: z.coerce.number().nonnegative(),
  qcPricePerDozen: z.coerce.number().nonnegative(),
  packingPricePerDozen: z.coerce.number().nonnegative(),
  adminPin: z.string().trim().min(4).max(12).optional(),
  telegramBotToken: z.string().trim().max(120).optional(),
  telegramChatId: z.string().trim().max(60).optional(),
});
export type SettingsInput = z.infer<typeof settingsInput>;

/* ------------------------------------------------------------------ *
 * Work entries
 * ------------------------------------------------------------------ */

/** 12 pieces = 1 dozen; effective qty = dozen + pieces/12. Optional on every entry. */
const pieces = z.coerce.number().int().min(0).max(11).optional();

/** Every work entry needs a positive quantity somewhere (dozen and/or pieces). */
const requirePositiveQty = (v: { dozen?: number; pieces?: number }) =>
  (v.dozen ?? 0) + (v.pieces ?? 0) > 0;
const positiveQtyOpts = { message: ErrorCode.VALIDATION, path: ["dozen"] };

export const cuttingLotInput = z.object({
  cuttingLotNumber: z.string().trim().min(1).max(60),
  fabricationLotId: id,
  dia: z.string().trim().min(1).max(40),
  categoryId: id,
  sizeId: id,
});
export type CuttingLotInput = z.infer<typeof cuttingLotInput>;

/** Bulk set cutting lots completed (default) or revert them to active. */
export const cuttingCompleteInput = z.object({
  cuttingLotIds: z.array(id).min(1),
  completed: z.boolean().default(true),
});
export type CuttingCompleteInput = z.infer<typeof cuttingCompleteInput>;

export const cuttingEntryInput = z
  .object({
    cuttingLotId: id,
    color,
    dozen,
    pieces,
    employeeId: id,
    date: isoDate,
  })
  .refine(requirePositiveQty, positiveQtyOpts);
export type CuttingEntryInput = z.infer<typeof cuttingEntryInput>;

export const stretchingEntryInput = z
  .object({
    cuttingLotId: id,
    color,
    stretchingTypeId: id,
    dozen,
    pieces,
    employeeId: id,
    date: isoDate,
  })
  .refine(requirePositiveQty, positiveQtyOpts);
export type StretchingEntryInput = z.infer<typeof stretchingEntryInput>;

/** Pouch, Pichiru and Packing share the same shape (no sub-type). */
export const stageEntryInput = z
  .object({
    cuttingLotId: id,
    color,
    dozen,
    pieces,
    employeeId: id,
    date: isoDate,
  })
  .refine(requirePositiveQty, positiveQtyOpts);
export type StageEntryInput = z.infer<typeof stageEntryInput>;

/**
 * Editing an entry adjusts quantities/employee/date only; the color (and
 * stretching sub-type) stay fixed — delete + re-add to change the bucket.
 */
export const entryEditInput = z
  .object({
    dozen,
    pieces,
    employeeId: id,
    date: isoDate,
  })
  .refine(requirePositiveQty, positiveQtyOpts);
export type EntryEditInput = z.infer<typeof entryEditInput>;

/* ------------------------------------------------------------------ *
 * Auth
 * ------------------------------------------------------------------ */

export const pinInput = z.object({ pin: z.string().trim().min(1).max(12) });
export type PinInput = z.infer<typeof pinInput>;

/* ------------------------------------------------------------------ *
 * API response types (shared with the web client)
 * ------------------------------------------------------------------ */

export interface ApiError {
  code: ErrorCode | string;
  /** Optional interpolation values for the translated message, e.g. { remaining: 3 }. */
  params?: Record<string, string | number>;
  message?: string;
}

/** A page of results plus the total count (for list-by-count pagination). */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface QuotaInfo {
  cuttingLotId: number;
  color: string;
  quota: number;
  used: number;
  remaining: number;
}

/**
 * One colour's standing at a stage, for the whole-lot overview. Returned for
 * EVERY colour the lot was cut in, so the operator can see what is left to do
 * before picking anything.
 *
 * `ceiling`/`remaining` are null for cutting, which has no upstream bound —
 * cutting is what creates the quota, so "remaining" would be meaningless there
 * rather than zero.
 */
export interface LotColorQuota {
  color: string;
  ceiling: number | null;
  used: number;
  remaining: number | null;
}

/**
 * A stage's upstream bound in the sequential chain, plus the error code to raise
 * when that bound is zero (nothing upstream has been entered yet). The empty code
 * is stage-specific — packing alone varies by lot type — so it travels with the
 * ceiling rather than being re-derived at each call site.
 */
export interface StageCeiling {
  ceiling: number;
  emptyCode: string;
}

/* --- Barcodes ------------------------------------------------------------ *
 * Codes are DERIVED from the row id, not stored: none of these tables carries a
 * unique human key that is safe to encode (cuttingLotNumber's unique index was
 * dropped, employees can share a name, and colour/type names are renameable), so
 * the autoincrement id is the only stable handle. That also means every existing
 * row already has a valid barcode with no backfill — and renaming a colour keeps
 * its printed label valid.
 *
 * Prefixes must stay distinct and, once printed, must never be reassigned:
 *   C = cutting lot · E = employee · L = colour · S = stretching type
 * ------------------------------------------------------------------------- */

export const BARCODE_KIND = {
  cuttingLot: "C",
  employee: "E",
  color: "L",
  stretchingType: "S",
} as const;
export type BarcodeKind = keyof typeof BARCODE_KIND;

/** Reverse map, so the parser can never drift from the encoder. */
const BARCODE_PREFIX_TO_KIND = Object.fromEntries(
  Object.entries(BARCODE_KIND).map(([kind, prefix]) => [prefix, kind as BarcodeKind])
) as Record<string, BarcodeKind>;

/** Padding width. Keep EVEN: with the 1-char prefix in Code 128 subset B, an
 *  even digit run pairs cleanly into subset C and stays compact. */
export const BARCODE_ID_DIGITS = 6;

/** Prefix + zero-padded id, e.g. cuttingLot 123 → "C000123". */
export function encodeBarcode(kind: BarcodeKind, id: number): string {
  return BARCODE_KIND[kind] + String(id).padStart(BARCODE_ID_DIGITS, "0");
}

/**
 * Parse a scanned or typed code. Tolerant of surrounding whitespace, lower case
 * (scanners differ on whether they send Shift with the letter) and any number of
 * leading zeros. Returns null for anything unrecognised — callers must treat
 * that as "not a barcode" rather than guessing.
 */
export function parseBarcode(raw: string): { kind: BarcodeKind; id: number } | null {
  const s = String(raw ?? "").trim().toUpperCase();
  const m = /^([A-Z])(\d{1,9})$/.exec(s);
  if (!m) return null;
  const kind = BARCODE_PREFIX_TO_KIND[m[1]];
  if (!kind) return null;
  const id = Number(m[2]);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return { kind, id };
}

/** Rip cutting ledger for a fabrication lot: 12-dia dyeing weight vs consumed. */
export interface RipInfo {
  fabricationLotId: number;
  material: number; // Σ dyeing weight of the lot's 12-dia rolls
  used: number; // Σ entered rip weights
  remaining: number; // material − used
  entries: { id: number; weight: number; createdAt: string }[];
}

/**
 * One stage's progress for a (lot, color). `percent` is measured against
 * `ceiling` — this stage's own upstream bound in the sequential chain — NOT
 * against the cutting quota, so a stage that has caught up with the stage
 * feeding it reads 100% even when the lot as a whole is only part-done.
 * A `ceiling` of 0 means "upstream hasn't started", not "nothing to do".
 */
export interface StageProgress {
  done: number;
  percent: number;
  ceiling: number;
  complete: boolean;
}
export interface StretchingProgress extends StageProgress {
  typeId: number;
  typeName: string;
  /** False for master types never applied to this lot — they never block completion. */
  used: boolean;
}

/** Σ over every colour of a cutting lot, in dozen-equivalents. */
export interface LotTotals {
  quota: number;
  pouch: number;
  stretching: { typeId: number; typeName: string; done: number }[];
  pichiru: number;
  packing: number;
  colorsComplete: number;
  colorsTotal: number;
}

/** Analytics view for one cutting lot. */
export interface LotAnalytics {
  cuttingLotId: number;
  cuttingLotNumber: string;
  fabricationLotNumber: string;
  colors: ColorAnalytics[];
  /** Job-work-given-outside: pouch/stretching/kainool never apply. */
  shortFlow: boolean;
  totals: LotTotals;
}
export interface ColorAnalytics {
  color: string;
  quota: number;
  pouch: StageProgress;
  stretching: StretchingProgress[];
  pichiru: StageProgress;
  packing: StageProgress;
  /** Packing has reached the ORIGINAL cutting quota — the whole colour is done. */
  completed: boolean;
  /** Kainool's ceiling: min across the stretching types actually used. */
  stretchCompleted: number;
  shortFlow: boolean;
  /** Every stage that applies to this lot has caught up with its own ceiling. */
  allStagesComplete: boolean;
}

/** Weekly salary breakdown for one employee (day-wise, per rate bucket). */
export interface SalaryBreakdown {
  employeeId: number;
  employeeName: string;
  weekStart: string; // ISO yyyy-mm-dd (Monday)
  weekEnd: string; // ISO yyyy-mm-dd (Sunday)
  salaryType: SalaryType;
  shifts: number; // total shifts this week (shift type)
  shiftRate: number; // per-shift rate (shift type)
  lines: SalaryLine[]; // day-wise piece lines (piece type)
  grossTotal: number;
  advanceDeducted: number; // saved deduction for this week (0 if unsaved)
  netTotal: number; // grossTotal − advanceDeducted
  advanceBalance: number; // overall balance = Σ advances − Σ deductions (all weeks)
  saved: boolean;
}
/** One employee's line on the all-employee week sheet (payroll view). */
export interface WeekSalaryRow {
  employeeId: number;
  employeeName: string;
  salaryType: SalaryType;
  shifts: number; // shift-type only
  shiftRate: number; // shift-type only
  totalDozen: number; // dozen-equivalent worked (piece-type only)
  grossTotal: number;
  advanceDeducted: number; // saved deduction for this week (0 if unsaved)
  netTotal: number;
  advanceBalance: number; // Σ advances − Σ deductions across all weeks
  saved: boolean; // a WeeklySalary snapshot exists for this week
  active: boolean; // false = kept on the sheet only because they worked/were paid
}

/** Payroll for one week across every employee, plus the totals to pay out. */
export interface WeekSalarySheet {
  weekStart: string;
  weekEnd: string;
  rows: WeekSalaryRow[];
  totals: {
    gross: number;
    advanceDeducted: number;
    net: number;
    employees: number; // rows with any gross this week
  };
}

export interface SalaryLine {
  date: string; // yyyy-mm-dd
  section: Section;
  label: string; // e.g. "Panian/S" or stretching type name
  dozen: number; // dozen-equivalent (dozen + pieces/12)
  rate: number;
  amount: number;
}

/** Save a week's salary: persists the snapshot and the advance deduction. */
export const salarySaveInput = z.object({
  employeeId: id,
  date: isoDate,
  advanceDeducted: z.coerce.number().nonnegative(),
});
export type SalarySaveInput = z.infer<typeof salarySaveInput>;

/** Week-wise progress across fabrication + cutting lots. */
export interface WeekAnalytics {
  weekStart: string;
  weekEnd: string;
  fabrication: WeekGroup;
  cutting: WeekGroup;
}
export interface WeekGroup {
  total: number;
  completed: number;
  inProgress: number;
  lots: { id: number; number: string; status: string; completed: boolean }[];
}

/* ------------------------------------------------------------------ *
 * Week helpers (Mon–Sun business week), timezone-free ISO date math
 * ------------------------------------------------------------------ */

/** Returns the Monday (ISO) of the week containing the given yyyy-mm-dd. */
export function weekStartOf(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00`);
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - day);
  return toIso(d);
}

export function weekEndOf(dateIso: string): string {
  const start = new Date(`${weekStartOf(dateIso)}T00:00:00`);
  start.setDate(start.getDate() + 6);
  return toIso(start);
}

export function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
