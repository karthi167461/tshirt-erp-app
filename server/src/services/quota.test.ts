import { describe, it, expect } from "vitest";
import {
  checkQuota,
  round2,
  minCompleted,
  pickCeiling,
  flowStepCeiling,
  flowStretchCompleted,
  type ChainTotals,
  type ChainOpts,
  type FlowInfo,
} from "./quota.js";
import { ErrorCode, weekStartOf, weekEndOf } from "@erp/shared";

describe("checkQuota", () => {
  it("allows a request within remaining quota", () => {
    expect(checkQuota(10, 4, 6)).toEqual({ ok: true, remaining: 6, wouldBe: 10 });
  });

  it("allows exactly hitting the quota", () => {
    expect(checkQuota(10, 0, 10).ok).toBe(true);
  });

  it("rejects going over the quota", () => {
    const r = checkQuota(10, 8, 3);
    expect(r.ok).toBe(false);
    expect(r.remaining).toBe(2);
  });

  it("tolerates floating point sums", () => {
    // 0.1 + 0.2 style drift must not spuriously reject an exact fill.
    expect(checkQuota(0.3, 0.1, 0.2).ok).toBe(true);
  });

  it("rounds remaining to 2 decimals", () => {
    expect(round2(10 - 3.335)).toBe(6.67);
  });
});

describe("minCompleted (kainool ceiling = min across used stretching types)", () => {
  it("is the common value when all used types are equal", () => {
    expect(minCompleted([10, 10, 10])).toBe(10);
  });

  it("is the slowest type (bottleneck) when they differ", () => {
    // types applied to the lot: 8, 5, 6 → only 5 dozen fully stretched.
    expect(minCompleted([8, 5, 6])).toBe(5);
  });

  it("is 0 when no stretching type has been used yet", () => {
    expect(minCompleted([])).toBe(0);
  });

  it("rounds to 2 decimals", () => {
    expect(minCompleted([5.005, 6])).toBe(5.01);
  });
});

describe("pickCeiling (the sequential chain, written down once)", () => {
  const totals = (over: Partial<ChainTotals> = {}): ChainTotals => ({
    cutting: 0,
    pouch: 0,
    stretchCompleted: 0,
    pichiru: 0,
    ...over,
  });
  const full: ChainOpts = { shortFlow: false, skipKainool: false };
  const short: ChainOpts = { shortFlow: true, skipKainool: false };
  const skipK: ChainOpts = { shortFlow: false, skipKainool: true };

  describe("full flow — each stage is bounded by the one before it", () => {
    it("pouch is bounded by cutting", () => {
      expect(pickCeiling("pouch", totals({ cutting: 10 }), full)).toEqual({
        ceiling: 10,
        emptyCode: ErrorCode.NO_CUTTING_QUOTA,
      });
    });

    it("stretching is bounded by pouch, NOT by cutting", () => {
      expect(pickCeiling("stretching", totals({ cutting: 100, pouch: 6 }), full).ceiling).toBe(6);
    });

    it("kainool is bounded by completed stretching, NOT by pouch", () => {
      expect(
        pickCeiling("pichiru", totals({ pouch: 100, stretchCompleted: 4 }), full).ceiling
      ).toBe(4);
    });

    it("packing is bounded by kainool, NOT by cutting", () => {
      expect(
        pickCeiling("packing", totals({ cutting: 100, pichiru: 3 }), full).ceiling
      ).toBe(3);
    });
  });

  describe("empty upstream — the error code must identify the stalled stage", () => {
    it.each([
      ["pouch", ErrorCode.NO_CUTTING_QUOTA],
      ["stretching", ErrorCode.NO_POUCH_TOTAL],
      ["pichiru", ErrorCode.NO_STRETCHING_TOTAL],
    ] as const)("%s reports %s", (stage, code) => {
      const r = pickCeiling(stage, totals(), full);
      expect(r.ceiling).toBe(0);
      expect(r.emptyCode).toBe(code);
    });

    // Regression: packing's empty code is NOT a function of the stage alone.
    // Before the refactor an explicit pre-check threw NO_PICHIRU_TOTAL for
    // full-flow lots while assertWithinQuota's default covered short-flow ones.
    it("packing on a FULL-flow lot with no kainool reports no_pichiru_total", () => {
      expect(pickCeiling("packing", totals(), full)).toEqual({
        ceiling: 0,
        emptyCode: ErrorCode.NO_PICHIRU_TOTAL,
      });
    });

    it("packing on a SHORT-flow lot with no cutting reports no_cutting_quota", () => {
      expect(pickCeiling("packing", totals(), short)).toEqual({
        ceiling: 0,
        emptyCode: ErrorCode.NO_CUTTING_QUOTA,
      });
    });
  });

  describe("short flow (job work given outside) skips the middle stages", () => {
    it("packs against cutting and ignores an empty kainool", () => {
      expect(pickCeiling("packing", totals({ cutting: 10, pichiru: 0 }), short)).toEqual({
        ceiling: 10,
        emptyCode: ErrorCode.NO_CUTTING_QUOTA,
      });
    });

    it("ignores kainool even when kainool is non-zero", () => {
      expect(
        pickCeiling("packing", totals({ cutting: 10, pichiru: 99 }), short).ceiling
      ).toBe(10);
    });
  });

  describe("skip-kainool flow lots pack against completed stretching", () => {
    it("packs against stretchCompleted and ignores kainool", () => {
      expect(
        pickCeiling("packing", totals({ stretchCompleted: 7, pichiru: 99 }), skipK)
      ).toEqual({ ceiling: 7, emptyCode: ErrorCode.NO_STRETCHING_TOTAL });
    });

    it("reports no_stretching_total when nothing is stretched yet", () => {
      expect(pickCeiling("packing", totals(), skipK)).toEqual({
        ceiling: 0,
        emptyCode: ErrorCode.NO_STRETCHING_TOTAL,
      });
    });

    it("short flow wins over skipKainool (job-work lots never stretch)", () => {
      expect(
        pickCeiling(
          "packing",
          totals({ cutting: 10, stretchCompleted: 99 }),
          { shortFlow: true, skipKainool: true }
        ).ceiling
      ).toBe(10);
    });
  });

  it("passes fractional dozen ceilings through untouched", () => {
    // 5 dozen + 6 pieces = 5.5 — the ceiling must not be rounded to a whole dozen.
    expect(pickCeiling("pouch", totals({ cutting: 5.5 }), full).ceiling).toBe(5.5);
  });
});

describe("flowStepCeiling (ordered steps: step i is bounded by step i-1)", () => {
  // Lock (type 1) → Kainul (type 2) → Final (type 3)
  const flow: FlowInfo = {
    id: 1,
    skipKainool: false,
    steps: [
      { stretchingTypeId: 1, position: 1 },
      { stretchingTypeId: 2, position: 2 },
      { stretchingTypeId: 3, position: 3 },
    ],
  };
  const totals = (m: Record<number, number>) =>
    new Map(Object.entries(m).map(([k, v]) => [Number(k), v]));

  it("step 1 is bounded by the pouch total", () => {
    expect(flowStepCeiling(flow, 1, 50, totals({}))).toEqual({
      ceiling: 50,
      emptyCode: ErrorCode.NO_POUCH_TOTAL,
    });
  });

  it("step 1 with no pouch yet reports no_pouch_total via a 0 ceiling", () => {
    expect(flowStepCeiling(flow, 1, 0, totals({}))).toEqual({
      ceiling: 0,
      emptyCode: ErrorCode.NO_POUCH_TOTAL,
    });
  });

  it("the requirement's example: pouch 50, step 1 done 30 → step 2 may do 30", () => {
    expect(flowStepCeiling(flow, 2, 50, totals({ 1: 30 }))).toEqual({
      ceiling: 30,
      emptyCode: ErrorCode.NO_PREV_STEP_TOTAL,
    });
  });

  it("step 3 is blocked (ceiling 0) while step 2 has not started", () => {
    expect(flowStepCeiling(flow, 3, 50, totals({ 1: 30 }))).toEqual({
      ceiling: 0,
      emptyCode: ErrorCode.NO_PREV_STEP_TOTAL,
    });
  });

  it("step 2 is bounded by step 1, not by pouch", () => {
    expect(flowStepCeiling(flow, 2, 999, totals({ 1: 12, 2: 5 })).ceiling).toBe(12);
  });

  it("rejects a type that is not a step of the flow", () => {
    expect(() => flowStepCeiling(flow, 42, 50, totals({}))).toThrowError(
      expect.objectContaining({ code: ErrorCode.FLOW_STEP_NOT_ALLOWED })
    );
  });

  it("passes fractional totals through (5 dozen 6 pieces = 5.5)", () => {
    expect(flowStepCeiling(flow, 2, 50, totals({ 1: 5.5 })).ceiling).toBe(5.5);
  });
});

describe("flowStretchCompleted (kainool/packing ceiling on flow lots)", () => {
  const flow: FlowInfo = {
    id: 1,
    skipKainool: false,
    steps: [
      { stretchingTypeId: 1, position: 1 },
      { stretchingTypeId: 2, position: 2 },
    ],
  };
  const totals = (m: Record<number, number>) =>
    new Map(Object.entries(m).map(([k, v]) => [Number(k), v]));

  it("is the common value when every step has caught up", () => {
    expect(flowStretchCompleted(flow, totals({ 1: 10, 2: 10 }))).toBe(10);
  });

  it("is 0 while any step has no entries — unlike legacy lots, unused steps count", () => {
    expect(flowStretchCompleted(flow, totals({ 1: 30 }))).toBe(0);
  });

  it("is the minimum under inconsistent data (edited step 1 below step 2)", () => {
    expect(flowStretchCompleted(flow, totals({ 1: 5, 2: 10 }))).toBe(5);
  });

  it("rounds to 2 decimals", () => {
    expect(flowStretchCompleted(flow, totals({ 1: 5.005, 2: 6 }))).toBe(5.01);
  });
});

describe("week boundaries (Mon–Sun)", () => {
  it("maps a Wednesday to its Monday..Sunday", () => {
    // 2026-07-15 is a Wednesday
    expect(weekStartOf("2026-07-15")).toBe("2026-07-13");
    expect(weekEndOf("2026-07-15")).toBe("2026-07-19");
  });

  it("keeps Monday as the start", () => {
    expect(weekStartOf("2026-07-13")).toBe("2026-07-13");
  });

  it("keeps Sunday within the same week", () => {
    expect(weekStartOf("2026-07-19")).toBe("2026-07-13");
    expect(weekEndOf("2026-07-19")).toBe("2026-07-19");
  });
});
