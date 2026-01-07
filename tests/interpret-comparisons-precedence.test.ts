import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";
import { isOk } from "../src/result";

describe("interpret - comparison operator precedence and chaining", () => {
  describe("precedence with arithmetic", () => {
    it("evaluates arithmetic before comparison", () => {
      const r = interpret("1 + 2 < 5");
      expect(isOk(r)).toBe(true);
      if (isOk(r)) expect(r.value).toBe(1);
    });

    it("evaluates multiplication before comparison", () => {
      const r = interpret("2 * 3 > 5");
      expect(isOk(r)).toBe(true);
      if (isOk(r)) expect(r.value).toBe(1);
    });

    it("handles complex arithmetic in comparisons", () => {
      const r = interpret("10 / 2 + 3 >= 8");
      expect(isOk(r)).toBe(true);
      if (isOk(r)) expect(r.value).toBe(1);
    });
  });

  describe("chained comparisons", () => {
    it("chains less-than comparisons left-to-right", () => {
      const r = interpret("1 < 2 < 3");
      expect(isOk(r)).toBe(true);
      if (isOk(r)) expect(r.value).toBe(1);
    });

    it("chains greater-than comparisons left-to-right", () => {
      const r = interpret("3 > 2 > 1");
      expect(isOk(r)).toBe(true);
      if (isOk(r)) expect(r.value).toBe(0); // (3 > 2) = 1, then 1 > 1 = 0
    });

    it("mixed comparisons evaluate left-to-right", () => {
      const r = interpret("1 < 2 == 1");
      expect(isOk(r)).toBe(true);
      if (isOk(r)) expect(r.value).toBe(1);
    });

    it("chained comparisons with false first condition", () => {
      const r = interpret("3 < 2 < 5");
      expect(isOk(r)).toBe(true);
      if (isOk(r)) expect(r.value).toBe(1); // (3 < 2) = 0, then 0 < 5 = 1
    });
  });
});
