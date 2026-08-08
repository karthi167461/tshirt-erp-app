import { describe, it, expect } from "vitest";
import { checkQuota, round2, minCompleted, pickCeiling, type ChainTotals } from "./quota.js";
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

  describe("full flow — each stage is bounded by the one before it", () => {
    it("pouch is bounded by cutting", () => {
      expect(pickCeiling("pouch", totals({ cutting: 10 }), false)).toEqual({
        ceiling: 10,
        emptyCode: ErrorCode.NO_CUTTING_QUOTA,
      });
    });

    it("stretching is bounded by pouch, NOT by cutting", () => {
      expect(pickCeiling("stretching", totals({ cutting: 100, pouch: 6 }), false).ceiling).toBe(6);
    });

    it("kainool is bounded by completed stretching, NOT by pouch", () => {
      expect(
        pickCeiling("pichiru", totals({ pouch: 100, stretchCompleted: 4 }), false).ceiling
      ).toBe(4);
    });

    it("packing is bounded by kainool, NOT by cutting", () => {
      expect(
        pickCeiling("packing", totals({ cutting: 100, pichiru: 3 }), false).ceiling
      ).toBe(3);
    });
  });

  describe("empty upstream — the error code must identify the stalled stage", () => {
    it.each([
      ["pouch", ErrorCode.NO_CUTTING_QUOTA],
      ["stretching", ErrorCode.NO_POUCH_TOTAL],
      ["pichiru", ErrorCode.NO_STRETCHING_TOTAL],
    ] as const)("%s reports %s", (stage, code) => {
      const r = pickCeiling(stage, totals(), false);
      expect(r.ceiling).toBe(0);
      expect(r.emptyCode).toBe(code);
    });

    // Regression: packing's empty code is NOT a function of the stage alone.
    // Before the refactor an explicit pre-check threw NO_PICHIRU_TOTAL for
    // full-flow lots while assertWithinQuota's default covered short-flow ones.
    it("packing on a FULL-flow lot with no kainool reports no_pichiru_total", () => {
      expect(pickCeiling("packing", totals(), false)).toEqual({
        ceiling: 0,
        emptyCode: ErrorCode.NO_PICHIRU_TOTAL,
      });
    });

    it("packing on a SHORT-flow lot with no cutting reports no_cutting_quota", () => {
      expect(pickCeiling("packing", totals(), true)).toEqual({
        ceiling: 0,
        emptyCode: ErrorCode.NO_CUTTING_QUOTA,
      });
    });
  });

  describe("short flow (job work given outside) skips the middle stages", () => {
    it("packs against cutting and ignores an empty kainool", () => {
      expect(pickCeiling("packing", totals({ cutting: 10, pichiru: 0 }), true)).toEqual({
        ceiling: 10,
        emptyCode: ErrorCode.NO_CUTTING_QUOTA,
      });
    });

    it("ignores kainool even when kainool is non-zero", () => {
      expect(
        pickCeiling("packing", totals({ cutting: 10, pichiru: 99 }), true).ceiling
      ).toBe(10);
    });
  });

  it("passes fractional dozen ceilings through untouched", () => {
    // 5 dozen + 6 pieces = 5.5 — the ceiling must not be rounded to a whole dozen.
    expect(pickCeiling("pouch", totals({ cutting: 5.5 }), false).ceiling).toBe(5.5);
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
