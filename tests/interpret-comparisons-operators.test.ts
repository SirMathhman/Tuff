import { describe, it } from "vitest";
import { interpret } from "../src/interpret";
import { expectOkValue } from "../src/testUtils";

describe("interpret - less-than operator (<)", () => {
  it("returns 1 when left < right", () => {
    expectOkValue(interpret("1 < 2"), 1);
  });

  it("returns 0 when left >= right", () => {
    expectOkValue(interpret("2 < 1"), 0);
  });

  it("returns 0 when left equals right", () => {
    expectOkValue(interpret("2 < 2"), 0);
  });

  it("works with negative numbers", () => {
    expectOkValue(interpret("-5 < 0"), 1);
  });
});

describe("interpret - greater-than operator (>)", () => {
  it("returns 1 when left > right", () => {
    expectOkValue(interpret("2 > 1"), 1);
  });

  it("returns 0 when left <= right", () => {
    expectOkValue(interpret("1 > 2"), 0);
  });

  it("returns 0 when left equals right", () => {
    expectOkValue(interpret("2 > 2"), 0);
  });
});

describe("interpret - less-than-or-equal operator (<=)", () => {
  it("returns 1 when left < right", () => {
    expectOkValue(interpret("1 <= 2"), 1);
  });

  it("returns 1 when left equals right", () => {
    expectOkValue(interpret("2 <= 2"), 1);
  });

  it("returns 0 when left > right", () => {
    expectOkValue(interpret("3 <= 2"), 0);
  });
});

describe("interpret - greater-than-or-equal operator (>=)", () => {
  it("returns 1 when left > right", () => {
    expectOkValue(interpret("2 >= 1"), 1);
  });

  it("returns 1 when left equals right", () => {
    expectOkValue(interpret("2 >= 2"), 1);
  });

  it("returns 0 when left < right", () => {
    expectOkValue(interpret("1 >= 2"), 0);
  });
});

describe("interpret - equality operator (==)", () => {
  it("returns 1 when values are equal", () => {
    expectOkValue(interpret("5 == 5"), 1);
  });

  it("returns 0 when values are not equal", () => {
    expectOkValue(interpret("5 == 3"), 0);
  });

  it("handles floating point coercion", () => {
    expectOkValue(interpret("5 == 5.0"), 1);
  });
});

describe("interpret - inequality operator (!=)", () => {
  it("returns 1 when values are not equal", () => {
    expectOkValue(interpret("5 != 3"), 1);
  });

  it("returns 0 when values are equal", () => {
    expectOkValue(interpret("5 != 5"), 0);
  });
});
