import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";

describe("interpret (result shape)", () => {
  it("returns Result objects", () => {
    const r1 = interpret("");
    expect(r1.ok).toBe(true);
    expect(typeof r1.value).toBe("number");

    const r2 = interpret("hello");
    expect(r2.ok).toBe(true);
    expect(typeof r2.value).toBe("number");

    const r3 = interpret("1+1");
    expect(r3.ok).toBe(true);
    expect(typeof r3.value).toBe("number");
  });
});

describe("interpret (numeric parsing)", () => {
  it("parses numeric literals correctly", () => {
    expect(interpret("100")).toEqual({ ok: true, value: 100 });
    expect(interpret("+42")).toEqual({ ok: true, value: 42 });
    expect(interpret("-3.14")).toEqual({ ok: true, value: -3.14 });
  });
});

describe("interpret (suffix handling - parsing)", () => {
  it("parses U8 basics", () => {
    expect(interpret("100U8")).toEqual({ ok: true, value: 100 });
    expect(interpret("255U8")).toEqual({ ok: true, value: 255 });
    expect(interpret("+42x")).toEqual({ ok: true, value: 42 });
  });

  it("handles negative and out of range U8", () => {
    expect(interpret("-3.14y")).toEqual({
      ok: false,
      error: "negative numeric prefix with suffix is not allowed",
    });
    expect(interpret("-100U8")).toEqual({
      ok: false,
      error: "negative numeric prefix with suffix is not allowed",
    });
    expect(interpret("256U8")).toEqual({
      ok: false,
      error: "value out of range for U8",
    });
  });
});

// split longer parsing tests to satisfy max-lines-per-function
describe("interpret (suffix handling - integer ranges)", () => {
  it("validates larger unsigned ranges (U16/U32)", () => {
    expect(interpret("65536U16")).toEqual({
      ok: false,
      error: "value out of range for U16",
    });

    expect(interpret("4294967296U32")).toEqual({
      ok: false,
      error: "value out of range for U32",
    });
  });

  it("validates signed ranges (I8/I16)", () => {
    expect(interpret("127I8")).toEqual({ ok: true, value: 127 });
    expect(interpret("-128I8")).toEqual({ ok: true, value: -128 });
    expect(interpret("128I8")).toEqual({
      ok: false,
      error: "value out of range for I8",
    });
    expect(interpret("32767I16")).toEqual({ ok: true, value: 32767 });
    expect(interpret("-32768I16")).toEqual({ ok: true, value: -32768 });
    expect(interpret("32768I16")).toEqual({
      ok: false,
      error: "value out of range for I16",
    });
  });

  it("fractional values with integer suffix are invalid", () => {
    expect(interpret("3.14U8")).toEqual({
      ok: false,
      error: "value out of range for U8",
    });
  });
});

describe("interpret (suffix handling - addition: basic)", () => {
  it("addition with sized operands works and enforces range", () => {
    expect(interpret("1U8 + 2U8")).toEqual({ ok: true, value: 3 });
    expect(interpret("255U8 + 1U8")).toEqual({
      ok: false,
      error: "value out of range for U8",
    });
  });
});

describe("interpret (suffix handling - addition: chaining)", () => {
  it("supports chained additions", () => {
    expect(interpret("1U8 + 2U8 + 3U8")).toEqual({ ok: true, value: 6 });
    expect(interpret("254U8 + 1U8 + 1U8")).toEqual({
      ok: false,
      error: "value out of range for U8",
    });
  });

  it("supports mixing suffixed and unsuffixed operands", () => {
    expect(interpret("1U8 + 2 + 3U8")).toEqual({ ok: true, value: 6 });
    expect(interpret("1U8 + 2 + 3U16")).toEqual({
      ok: false,
      error: "mixed suffixes not supported",
    });
  });

  it("subtraction with suffixed operands", () => {
    expect(interpret("10 - 5U8 + 3")).toEqual({ ok: true, value: 8 });
    expect(interpret("0 - 1U8")).toEqual({
      ok: false,
      error: "value out of range for U8",
    });

    // subtraction resulting in negative value for unsigned suffix should error
    expect(interpret("1 - 2U8")).toEqual({
      ok: false,
      error: "value out of range for U8",
    });
  });
});

describe("interpret (suffix handling - arithmetic) - precedence", () => {
  it("operator precedence (add/mul)", () => {
    // multiplication before addition
    expect(interpret("10 * 5 + 3")).toEqual({ ok: true, value: 53 });
    expect(interpret("3 + 10 * 5")).toEqual({ ok: true, value: 53 });
    expect(interpret("(3 + 10) * 5")).toEqual({ ok: true, value: 65 });
    expect(interpret("2 + 3 * 4")).toEqual({ ok: true, value: 14 });
  });

  it("multiplication overflow with suffix", () => {
    // multiplication overflow with suffix
    expect(interpret("10U8 * 26U8")).toEqual({
      ok: false,
      error: "value out of range for U8",
    });
  });
});

describe("interpret (suffix handling - arithmetic) - division", () => {
  it("division and braced grouping", () => {
    // division with precedence
    expect(interpret("10 / 2 + 1")).toEqual({ ok: true, value: 6 });
    expect(interpret("12 / 5")).toEqual({ ok: true, value: 2.4 });

    // division edge cases
    expect(interpret("10 / (2 - 2)")).toEqual({
      ok: false,
      error: "division by zero",
    });

    // braced grouping should behave like parentheses
    expect(interpret("10 / { 2 } + 1")).toEqual({ ok: true, value: 6 });
  });
});

describe("interpret (suffix handling - braced blocks) - grouping and top-level", () => {
  it("braced grouping and blocks (grouping)", () => {
    // braced grouping with declaration without annotation
    expect(interpret("10 / { let x = 2U8; x } + 1")).toEqual({
      ok: true,
      value: 6,
    });

    // braced grouping with declaration without annotation (unsuffixed initializer)
    expect(interpret("10 / { let x = 2; x } + 1")).toEqual({
      ok: true,
      value: 6,
    });

    // add two braced blocks
    expect(interpret("{ let x = 1; x } + { let y = 2; y }")).toEqual({
      ok: true,
      value: 3,
    });
  });

  it("top-level block statements", () => {
    // top-level block (no surrounding braces) should also work
    expect(interpret("let x : 100U8 = 100U8; x")).toEqual({
      ok: true,
      value: 100,
    });

    // top-level declaration with braced initializer
    expect(interpret("let x = { let y = 100; y}; x")).toEqual({
      ok: true,
      value: 100,
    });
  });
});

describe("interpret (suffix handling - braced blocks) - chained and errors", () => {
  it("braced grouping and blocks (chained declarations)", () => {
    // chained declarations should allow initializers to reference earlier bindings
    expect(interpret("10 / { let x = 2; let y = x; y } + 1")).toEqual({
      ok: true,
      value: 6,
    });
  });

  it("braced grouping and blocks (errors)", () => {
    // duplicate declaration should error
    expect(interpret("10 / { let x = 2U8; let x = 4U8; x } + 1")).toEqual({
      ok: false,
      error: "duplicate declaration",
    });

    // block with only declarations and no final expression should error
    expect(interpret("10 / { let x = 2; } + 1")).toEqual({
      ok: false,
      error: "block has no final expression",
    });
  });
});

describe("interpret (suffix handling - braced blocks) - annotations", () => {
  it("braced grouping and blocks (annotations: valid)", () => {
    // braced block with declarations
    expect(interpret("10 / { let x : 2U8 = 2U8; x } + 1")).toEqual({
      ok: true,
      value: 6,
    });

    // annotation can be a sized type (e.g., 'U8') which must match initializer suffix
    expect(interpret("10 / { let x : U8 = 2U8; x } + 1")).toEqual({
      ok: true,
      value: 6,
    });

    // annotated sized type should match identifier initializer suffix
    expect(interpret("10 / { let x = 2U8; let y : U8 = x; y } + 1")).toEqual({
      ok: true,
      value: 6,
    });
  });

  it("braced grouping and blocks (annotations: mismatches)", () => {
    // declaration annotation mismatch should error
    expect(interpret("10 / { let x : 2U8 = 1U8; x } + 1")).toEqual({
      ok: false,
      error: "declaration initializer does not match annotation",
    });

    // annotation with numeric literal should also mismatch when initializer is an identifier
    expect(interpret("10 / { let x = 2U8; let y : 1U8 = x; y } + 1")).toEqual({
      ok: false,
      error: "declaration initializer does not match annotation",
    });
  });

  it("rejects mixed suffixes", () => {
    expect(interpret("1U8 + 2U16")).toEqual({
      ok: false,
      error: "mixed suffixes not supported",
    });
  });
});
