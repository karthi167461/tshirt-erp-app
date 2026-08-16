import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  SalaryBreakdown,
  LotAnalytics,
  WeekAnalytics,
  QuotaInfo,
  LotColorQuota,
  FlowColorStatus,
  FabricationAnalytics,
  WeekSalarySheet,
  RipInfo,
  FabricationType,
  Section,
  Paginated,
} from "@erp/shared";
import { api } from "./api";

/* ---------------- Types (server shapes) ---------------- */

export interface Settings {
  id: number;
  companyName: string;
  themeColor: string;
  cuttingPricePerDozen: number;
  qcPricePerDozen: number;
  packingPricePerDozen: number;
  telegramChatId?: string;
  telegramConfigured?: boolean;
}
export interface Employee {
  id: number;
  name: string;
  phone?: string | null;
  role: string;
  salaryType: "piece" | "shift";
  shiftRate: number;
  advance: number;
  active: boolean;
}
export interface WeekShift {
  weekStart: string;
  employees: { employeeId: number; name: string; shiftRate: number; shifts: number }[];
}
export interface Size {
  id: number;
  categoryId: number;
  name: string;
  active: boolean;
}
export interface Category {
  id: number;
  name: string;
  active: boolean;
  sizes: Size[];
}
export interface Color {
  id: number;
  name: string;
  active: boolean;
}
export interface FabricationRoll {
  id: number;
  fabricationLotId: number;
  dia: string;
  rollCount: number;
  weight: number;
  texturePinnal: string;
  fabricationWeight: number | null;
  dyeingWeight: number | null;
  createdAt: string;
}
export interface FabricationLot {
  id: number;
  lotNumber: string;
  type: FabricationType;
  status: "draft" | "dyeing" | "ready";
  locked: boolean;
  createdAt: string;
  rolls: FabricationRoll[];
}
export interface EmployeeAdvance {
  id: number;
  employeeId: number;
  date: string;
  amount: number;
  note: string | null;
  createdAt: string;
}
export interface StretchingSlab {
  id: number;
  stretchingTypeId: number;
  minSize: number;
  maxSize: number;
  pricePerDozen: number;
}
export interface StretchingType {
  id: number;
  name: string;
  amountPerDozen: number;
  active: boolean;
  slabs: StretchingSlab[];
}
export interface StretchingFlowStep {
  id: number;
  flowId: number;
  position: number;
  stretchingTypeId: number;
  stretchingType: { id: number; name: string; amountPerDozen: number };
}
export interface StretchingFlow {
  id: number;
  name: string;
  skipKainool: boolean;
  active: boolean;
  steps: StretchingFlowStep[];
  _count?: { cuttingLots: number };
}
export interface CuttingLotRef {
  id: number;
  cuttingLotNumber: string;
  dia: string;
  status: "active" | "completed";
  fabricationLotId: number;
  categoryId: number;
  sizeId: number;
  category: { id: number; name: string };
  size: { id: number; name: string };
  fabricationLot: { id: number; lotNumber: string; locked: boolean; status: string; type: FabricationType };
  /** Null on legacy and short-flow lots. Steps come from useStretchingFlows (join by id). */
  stretchingFlowId: number | null;
  stretchingFlow: { id: number; name: string; skipKainool: boolean } | null;
  createdAt: string;
}
export interface CuttingLotLite {
  id: number;
  cuttingLotNumber: string;
  fabricationLotNumber: string;
  status: "active" | "completed";
  createdAt: string;
}
export interface BackupStatus {
  lastRunAt: string | null;
  lastFile: string | null;
  lastSizeBytes: number | null;
  telegram: "sent" | "skipped" | "failed" | null;
  ok: boolean | null;
  error: string | null;
}

/* ---------------- Queries ---------------- */

export const useSettings = () =>
  useQuery({ queryKey: ["settings"], queryFn: () => api.get<Settings>("/api/settings") });

export const useEmployees = (activeOnly = false) =>
  useQuery({
    queryKey: ["employees", activeOnly],
    queryFn: () =>
      api.get<Employee[]>(`/api/employees${activeOnly ? "?active=1" : ""}`),
  });

export const useStretchingTypes = (activeOnly = false) =>
  useQuery({
    queryKey: ["stretchingTypes", activeOnly],
    queryFn: () =>
      api.get<StretchingType[]>(
        `/api/stretching-types${activeOnly ? "?active=1" : ""}`
      ),
  });

export const useStretchingFlows = (activeOnly = false) =>
  useQuery({
    queryKey: ["stretchingFlows", activeOnly],
    queryFn: () =>
      api.get<StretchingFlow[]>(
        `/api/stretching-flows${activeOnly ? "?active=1" : ""}`
      ),
  });

/** Per-colour, per-step standing of a flow lot — feeds the ordered step picker. */
export const useLotFlowStatus = (cuttingLotId?: number) =>
  useQuery({
    queryKey: ["lotFlowStatus", cuttingLotId],
    queryFn: () =>
      api.get<FlowColorStatus[]>(
        `/api/stretching-flows/status?cuttingLotId=${cuttingLotId}`
      ),
    enabled: !!cuttingLotId,
  });

export const useCategories = (activeOnly = false) =>
  useQuery({
    queryKey: ["categories", activeOnly],
    queryFn: () =>
      api.get<Category[]>(`/api/categories${activeOnly ? "?active=1" : ""}`),
  });

export const useSizes = (categoryId?: number, activeOnly = false) =>
  useQuery({
    queryKey: ["sizes", categoryId, activeOnly],
    queryFn: () => {
      const q = new URLSearchParams();
      if (categoryId) q.set("categoryId", String(categoryId));
      if (activeOnly) q.set("active", "1");
      const qs = q.toString();
      return api.get<Size[]>(`/api/sizes${qs ? `?${qs}` : ""}`);
    },
  });

export const useMasterColors = (activeOnly = false) =>
  useQuery({
    queryKey: ["masterColors", activeOnly],
    queryFn: () =>
      api.get<Color[]>(`/api/colors${activeOnly ? "?active=1" : ""}`),
  });

/**
 * Every colour of a lot with what's left at one stage — one request for the
 * whole lot, instead of the per-colour `useQuotaInfo` calls it replaces.
 */
export const useLotColorQuotas = (params: {
  cuttingLotId?: number;
  stage: "cutting" | "pouch" | "stretching" | "pichiru" | "packing";
  stretchingTypeId?: number;
}) => {
  const { cuttingLotId, stage, stretchingTypeId } = params;
  const ready = !!cuttingLotId && (stage !== "stretching" || !!stretchingTypeId);
  return useQuery({
    queryKey: ["lotColorQuotas", cuttingLotId, stage, stretchingTypeId],
    enabled: ready,
    queryFn: () => {
      const q = new URLSearchParams({ cuttingLotId: String(cuttingLotId), stage });
      if (stretchingTypeId) q.set("stretchingTypeId", String(stretchingTypeId));
      return api.get<LotColorQuota[]>(`/api/quota/lot?${q.toString()}`);
    },
  });
};

/** Payroll for a whole week: every employee's gross, deduction and net. */
export const useWeekSalarySheet = (date: string) =>
  useQuery({
    queryKey: ["weekSalarySheet", date],
    queryFn: () => api.get<WeekSalarySheet>(`/api/salary/week?date=${date}`),
  });

export interface DiaSizeLink {
  id: number;
  dia: string;
  categoryId: number;
  sizeId: number;
  category: { id: number; name: string };
  size: { id: number; name: string };
}

/** The whole (small) mapping table — resolved client-side so picking a dia
 *  costs no round trip. */
export const useDiaSizeLinks = () =>
  useQuery({
    queryKey: ["diaSizeLinks"],
    queryFn: () => api.get<DiaSizeLink[]>("/api/dia-size-links"),
  });

/**
 * What a chosen dia implies. A dia may map to several (category, size) pairs —
 * live data has dia "80" across nine — so this reports the candidates and only
 * marks it resolvable when exactly one link matches.
 */
export function resolveDia(links: DiaSizeLink[] | undefined, dia: string) {
  const key = dia.trim();
  const matches = key ? (links ?? []).filter((l) => l.dia.trim() === key) : [];
  return {
    matches,
    /** Exactly one link → safe to auto-fill both category and size. */
    exact: matches.length === 1 ? matches[0] : null,
    categoryIds: [...new Set(matches.map((l) => l.categoryId))],
    /** Sizes linked for this dia within one category. */
    sizeIdsFor: (categoryId: number) =>
      matches.filter((l) => l.categoryId === categoryId).map((l) => l.sizeId),
  };
}

export interface PageParams {
  search?: string;
  page: number;
  pageSize: number;
}

function pageQuery(params: PageParams & { status?: string }): string {
  const q = new URLSearchParams();
  q.set("page", String(params.page));
  q.set("pageSize", String(params.pageSize));
  if (params.search) q.set("search", params.search);
  if (params.status) q.set("status", params.status);
  return q.toString();
}

export const useFabricationLotsPaged = (params: PageParams & { status?: string }) =>
  useQuery({
    queryKey: ["fabricationLots", params],
    queryFn: () =>
      api.get<Paginated<FabricationLot>>(`/api/fabrication-lots?${pageQuery(params)}`),
  });

export const useEmployeesPaged = (params: PageParams) =>
  useQuery({
    queryKey: ["employeesPaged", params],
    queryFn: () =>
      api.get<Paginated<Employee>>(`/api/employees/paged?${pageQuery(params)}`),
  });

export interface EmployeeLedger {
  employee: { id: number; name: string };
  given: { id: number; date: string; amount: number; note: string | null }[];
  deducted: { id: number; weekStart: string; weekEnd: string; amount: number }[];
  periodGiven: number;
  periodDeducted: number;
  totalGiven: number;
  totalDeducted: number;
  balance: number;
}

export const useEmployeeLedger = (employeeId: number | undefined, month?: string) =>
  useQuery({
    queryKey: ["ledger", employeeId, month ?? "all"],
    queryFn: () =>
      api.get<EmployeeLedger>(
        `/api/employees/${employeeId}/ledger${month ? `?month=${encodeURIComponent(month)}` : ""}`
      ),
    enabled: !!employeeId,
  });

export const useFabricationLot = (id: number | undefined) =>
  useQuery({
    queryKey: ["fabricationLot", id],
    queryFn: () => api.get<FabricationLot>(`/api/fabrication-lots/${id}`),
    enabled: !!id,
  });

export const useEmployeeAdvances = (employeeId: number | undefined) =>
  useQuery({
    queryKey: ["advances", employeeId],
    queryFn: () => api.get<EmployeeAdvance[]>(`/api/employees/${employeeId}/advances`),
    enabled: !!employeeId,
  });

/** Ready fabrication lots (unpaginated) for the cutting-lot creation picker. */
export const useReadyFabricationLots = () =>
  useQuery({
    queryKey: ["readyFabricationLots"],
    queryFn: () => api.get<FabricationLot[]>("/api/fabrication-lots/ready"),
  });

/* ---------------- Rip cutting ---------------- */

export interface RipLotRef {
  id: number;
  lotNumber: string;
  type: FabricationType;
  status: string;
}

/** Fabrication lots that have a 12-dia (rip material) roll — the rip picker. */
export const useRipLots = () =>
  useQuery({
    queryKey: ["ripLots"],
    queryFn: () => api.get<RipLotRef[]>("/api/rip/lots"),
  });

/** Rip ledger (material / used / remaining + entries) for one fabrication lot. */
export const useRipInfo = (fabricationLotId: number | undefined) =>
  useQuery({
    queryKey: ["rip", fabricationLotId],
    queryFn: () => api.get<RipInfo>(`/api/rip?fabricationLotId=${fabricationLotId}`),
    enabled: !!fabricationLotId,
  });

export const useCuttingLotsPaged = (params: PageParams & { status?: string }) =>
  useQuery({
    queryKey: ["cuttingLots", params],
    queryFn: () =>
      api.get<Paginated<CuttingLotRef>>(`/api/cutting-lots?${pageQuery(params)}`),
  });

/** Active cutting lots (unpaginated) for downstream stage pickers. */
export const useActiveCuttingLots = () =>
  useQuery({
    queryKey: ["activeCuttingLots"],
    queryFn: () => api.get<CuttingLotRef[]>("/api/cutting-lots/active"),
  });

export const useCuttingLot = (id: number | undefined) =>
  useQuery({
    queryKey: ["cuttingLot", id],
    queryFn: () => api.get<CuttingLotRef>(`/api/cutting-lots/${id}`),
    enabled: !!id,
  });

export const useCuttingLotColors = (cuttingLotId: number | undefined) =>
  useQuery({
    queryKey: ["cuttingLotColors", cuttingLotId],
    queryFn: () => api.get<string[]>(`/api/cutting-lots/${cuttingLotId}/colors`),
    enabled: !!cuttingLotId,
  });

export const useCuttingLotsList = () =>
  useQuery({
    queryKey: ["cuttingLotsList"],
    queryFn: () => api.get<CuttingLotLite[]>("/api/cutting-lots-analytics"),
  });

export const useQuotaInfo = (params: {
  cuttingLotId?: number;
  color?: string;
  stage: "pouch" | "stretching" | "pichiru" | "packing";
  stretchingTypeId?: number;
}) => {
  const { cuttingLotId, color, stage, stretchingTypeId } = params;
  const ready =
    !!cuttingLotId && !!color && (stage !== "stretching" || !!stretchingTypeId);
  const q = new URLSearchParams({
    cuttingLotId: cuttingLotId ? String(cuttingLotId) : "",
    color: color ?? "",
    stage,
  });
  if (stretchingTypeId) q.set("stretchingTypeId", String(stretchingTypeId));
  return useQuery({
    queryKey: ["quota", cuttingLotId, color, stage, stretchingTypeId],
    queryFn: () => api.get<QuotaInfo>(`/api/quota?${q.toString()}`),
    enabled: ready,
  });
};

export const useCuttingLotAnalytics = (cuttingLotId: number | undefined) =>
  useQuery({
    queryKey: ["analytics", cuttingLotId],
    queryFn: () =>
      api.get<LotAnalytics>(`/api/analytics/cutting-lot/${cuttingLotId}`),
    enabled: !!cuttingLotId,
  });

/** Fabrication drill-down: the lot, its rolls, per-cutting-lot cut/packed rollups. */
export const useFabricationAnalytics = (fabricationLotId: number | undefined) =>
  useQuery({
    queryKey: ["fabricationAnalytics", fabricationLotId],
    queryFn: () =>
      api.get<FabricationAnalytics>(`/api/analytics/fabrication-lot/${fabricationLotId}`),
    enabled: !!fabricationLotId,
  });

export interface StageEntry {
  id: number;
  cuttingLotId: number;
  color: string;
  dozen: number;
  pieces: number | null;
  employeeId: number;
  date: string;
  employee: { id: number; name: string };
  stretchingType?: { id: number; name: string };
}

export const useStageEntries = (
  stage: string,
  cuttingLotId: number | undefined,
  opts?: { page?: number; pageSize?: number; employeeId?: number }
) =>
  useQuery({
    queryKey: ["stageEntries", stage, cuttingLotId, opts?.page ?? 1, opts?.employeeId],
    queryFn: () => {
      const q = new URLSearchParams({ cuttingLotId: String(cuttingLotId) });
      q.set("page", String(opts?.page ?? 1));
      if (opts?.pageSize) q.set("pageSize", String(opts.pageSize));
      if (opts?.employeeId) q.set("employeeId", String(opts.employeeId));
      return api.get<Paginated<StageEntry>>(`/api/${stage}?${q.toString()}`);
    },
    enabled: !!cuttingLotId,
  });

export const useSalary = (employeeId: number | undefined, date: string) =>
  useQuery({
    queryKey: ["salary", employeeId, date],
    queryFn: () =>
      api.get<SalaryBreakdown>(`/api/salary?employeeId=${employeeId}&date=${date}`),
    enabled: !!employeeId,
  });

export interface CuttingPrice {
  id: number;
  categoryId: number;
  sizeId: number;
  pricePerDozen: number;
  category: { id: number; name: string };
  size: { id: number; name: string };
}
export interface PouchPrice {
  id: number;
  categoryId: number;
  pricePerDozen: number;
  category: { id: number; name: string };
}

export const useCuttingPrices = () =>
  useQuery({ queryKey: ["cuttingPrices"], queryFn: () => api.get<CuttingPrice[]>("/api/prices/cutting") });

export const usePouchPrices = () =>
  useQuery({ queryKey: ["pouchPrices"], queryFn: () => api.get<PouchPrice[]>("/api/prices/pouch") });

export const useWeekAnalytics = (date: string) =>
  useQuery({
    queryKey: ["weekAnalytics", date],
    queryFn: () => api.get<WeekAnalytics>(`/api/analytics/week?date=${date}`),
  });

export const useWeekShifts = (date: string) =>
  useQuery({
    queryKey: ["weekShifts", date],
    queryFn: () => api.get<WeekShift>(`/api/shifts?date=${date}`),
  });

export const useBackupStatus = () =>
  useQuery({
    queryKey: ["backupStatus"],
    queryFn: () => api.get<BackupStatus>("/api/backup/status"),
  });

/* ---------------- Mutations ---------------- */

export function useInvalidateEntries() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["cuttingLots"] });
    qc.invalidateQueries({ queryKey: ["activeCuttingLots"] });
    qc.invalidateQueries({ queryKey: ["cuttingLotColors"] });
    qc.invalidateQueries({ queryKey: ["quota"] });
    // Saving at one stage moves the next stage's ceiling too, so the whole-lot
    // remaining view has to be refetched, not just the row that was edited.
    qc.invalidateQueries({ queryKey: ["lotColorQuotas"] });
    qc.invalidateQueries({ queryKey: ["lotFlowStatus"] });
    qc.invalidateQueries({ queryKey: ["stageEntries"] });
    qc.invalidateQueries({ queryKey: ["analytics"] });
    qc.invalidateQueries({ queryKey: ["fabricationAnalytics"] });
    qc.invalidateQueries({ queryKey: ["salary"] });
  };
}
