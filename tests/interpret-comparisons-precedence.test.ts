import { describe, it } from "vitest";
import { interpret } from "../src/interpret";
import { expectOkValue } from "../src/utils/testUtils";

describe("interpret - comparison operator precedence and chaining", () => {
  describe("precedence with arithmetic", () => {
    it("evaluates arithmetic before comparison", () => {
      expectOkValue(interpret("1 + 2 < 5"), 1);
    });

    it("evaluates multiplication before comparison", () => {
      expectOkValue(interpret("2 * 3 > 5"), 1);
    });

    it("handles complex arithmetic in comparisons", () => {
      expectOkValue(interpret("10 / 2 + 3 >= 8"), 1);
    });
  });

  describe("chained comparisons", () => {
    it("chains less-than comparisons left-to-right", () => {
      expectOkValue(interpret("1 < 2 < 3"), 1);
    });

    it("chains greater-than comparisons left-to-right", () => {
      // (3 > 2) = 1, then 1 > 1 = 0
      expectOkValue(interpret("3 > 2 > 1"), 0);
    });

    it("mixed comparisons evaluate left-to-right", () => {
      expectOkValue(interpret("1 < 2 == 1"), 1);
    });

    it("chained comparisons with false first condition", () => {
      // (3 < 2) = 0, then 0 < 5 = 1
      expectOkValue(interpret("3 < 2 < 5"), 1);
    });
  });
});
