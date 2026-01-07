import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";
import { isOk } from "../src/result";

// Helper test function to reduce describe block size
function testComparison(expr: string, expected: number): void {
  const r = interpret(expr);
  expect(isOk(r)).toBe(true);
  if (isOk(r)) expect(r.value).toBe(expected);
}

describe("interpret - less-than operator (<)", () => {
  it("returns 1 when left < right", () => {
    testComparison("1 < 2", 1);
  });

  it("returns 0 when left >= right", () => {
    testComparison("2 < 1", 0);
  });

  it("returns 0 when left equals right", () => {
    testComparison("2 < 2", 0);
  });

  it("works with negative numbers", () => {
    testComparison("-5 < 0", 1);
  });
});

describe("interpret - greater-than operator (>)", () => {
  it("returns 1 when left > right", () => {
    testComparison("2 > 1", 1);
  });

  it("returns 0 when left <= right", () => {
    testComparison("1 > 2", 0);
  });

  it("returns 0 when left equals right", () => {
    testComparison("2 > 2", 0);
  });
});

describe("interpret - less-than-or-equal operator (<=)", () => {
  it("returns 1 when left < right", () => {
    testComparison("1 <= 2", 1);
  });

  it("returns 1 when left equals right", () => {
    testComparison("2 <= 2", 1);
  });

  it("returns 0 when left > right", () => {
    testComparison("3 <= 2", 0);
  });
});

describe("interpret - greater-than-or-equal operator (>=)", () => {
  it("returns 1 when left > right", () => {
    testComparison("2 >= 1", 1);
  });

  it("returns 1 when left equals right", () => {
    testComparison("2 >= 2", 1);
  });

  it("returns 0 when left < right", () => {
    testComparison("1 >= 2", 0);
  });
});

describe("interpret - equality operator (==)", () => {
  it("returns 1 when values are equal", () => {
    testComparison("5 == 5", 1);
  });

  it("returns 0 when values are not equal", () => {
    testComparison("5 == 3", 0);
  });

  it("handles floating point coercion", () => {
    testComparison("5 == 5.0", 1);
  });
});

describe("interpret - inequality operator (!=)", () => {
  it("returns 1 when values are not equal", () => {
    testComparison("5 != 3", 1);
  });

  it("returns 0 when values are equal", () => {
    testComparison("5 != 5", 0);
  });
});
