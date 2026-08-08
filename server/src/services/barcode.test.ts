import { describe, it, expect } from "vitest";
import { encodeBarcode, parseBarcode, BARCODE_ID_DIGITS, BARCODE_KIND } from "@erp/shared";

const KINDS = Object.keys(BARCODE_KIND) as (keyof typeof BARCODE_KIND)[];

describe("barcode codec", () => {
  it("encodes a cutting lot with the C prefix, zero-padded", () => {
    expect(encodeBarcode("cuttingLot", 123)).toBe("C000123");
  });

  it("encodes an employee with the E prefix", () => {
    expect(encodeBarcode("employee", 45)).toBe("E000045");
  });

  it("encodes a colour with the L prefix", () => {
    expect(encodeBarcode("color", 3)).toBe("L000003");
  });

  it("encodes a stretching type with the S prefix", () => {
    expect(encodeBarcode("stretchingType", 7)).toBe("S000007");
  });

  // Two kinds sharing a prefix would silently route every scan of one to the
  // other, and labels already printed cannot be recalled.
  it("gives every kind a distinct prefix", () => {
    const prefixes = Object.values(BARCODE_KIND);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it("uses only single upper-case letters as prefixes", () => {
    for (const p of Object.values(BARCODE_KIND)) expect(p).toMatch(/^[A-Z]$/);
  });

  // Guards against a future rename reshuffling what is already on paper.
  it("pins the printed prefixes", () => {
    expect(BARCODE_KIND).toEqual({
      cuttingLot: "C",
      employee: "E",
      color: "L",
      stretchingType: "S",
    });
  });

  it("keeps the padded run an even number of digits (Code 128 subset C packs pairs)", () => {
    expect(BARCODE_ID_DIGITS % 2).toBe(0);
  });

  it("does not truncate ids wider than the padding", () => {
    expect(encodeBarcode("cuttingLot", 1234567)).toBe("C1234567");
  });

  it("round-trips every kind", () => {
    for (const kind of KINDS) {
      for (const id of [1, 7, 42, 999999, 1234567]) {
        expect(parseBarcode(encodeBarcode(kind, id))).toEqual({ kind, id });
      }
    }
  });

  it("accepts lower case — scanners vary on sending Shift with the letter", () => {
    expect(parseBarcode("c123")).toEqual({ kind: "cuttingLot", id: 123 });
    expect(parseBarcode("l000003")).toEqual({ kind: "color", id: 3 });
    expect(parseBarcode("s7")).toEqual({ kind: "stretchingType", id: 7 });
  });

  it("rejects letters that are not assigned to a kind", () => {
    for (const raw of ["A000001", "Z9", "B12", "D5"]) expect(parseBarcode(raw)).toBeNull();
  });

  it("accepts surrounding whitespace from a scanner's suffix", () => {
    expect(parseBarcode("  E000045\r\n")).toEqual({ kind: "employee", id: 45 });
  });

  it.each(["X1", "", "   ", "C", "123", "CE1", "C0", "C000000", "C12A", "①"])(
    "rejects %o rather than guessing",
    (raw) => {
      expect(parseBarcode(raw)).toBeNull();
    }
  );

  it("rejects a null/undefined payload without throwing", () => {
    expect(parseBarcode(undefined as unknown as string)).toBeNull();
  });
});
