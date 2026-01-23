import { describe, it, expect } from "bun:test";
import { intepret } from "../src/intepret";
import { isOk } from "../src/result";

describe("intepret - basic parsing", () => {
  it("returns ok(0) for empty string", () => {
    const result = intepret("");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(0);
  });

  it("parses integer strings like '100'", () => {
    const result = intepret("100");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(100);
  });

  it("parses numeric strings with type suffixes like '100U8'", () => {
    const result = intepret("100U8");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(100);
  });

  it("parses negative integers like '-100'", () => {
    const result = intepret("-100");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(-100);
  });

  it("parses negative integers with signed suffixes like '-100I8'", () => {
    const result = intepret("-100I8");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(-100);
  });
});

describe("intepret - validation", () => {
  it("returns err for negative numbers with suffixes like '-100U8'", () => {
    const result = intepret("-100U8");
    expect(isOk(result)).toBe(false);
    if (!isOk(result)) expect(result.error.cause).toContain("Invalid");
  });

  it("returns err for numbers out of range for their type suffix like '256U8'", () => {
    const result = intepret("256U8");
    expect(isOk(result)).toBe(false);
    if (!isOk(result)) expect(result.error.cause).toContain("Out of range");
  });
});

describe("intepret - expressions: arithmetic", () => {
  it("parses and evaluates simple expressions like '1U8 + 2U8'", () => {
    const result = intepret("1U8 + 2U8");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(3);
  });

  it("returns err for expressions that overflow their common suffix type (1U8 + 255U8)", () => {
    const result = intepret("1U8 + 255U8");
    expect(isOk(result)).toBe(false);
    if (!isOk(result)) expect(result.error.cause).toContain("Out of range");
  });

  it("returns err for expressions with mixed type suffixes like '1 + 255U8'", () => {
    const result = intepret("1 + 255U8");
    expect(isOk(result)).toBe(false);
    if (!isOk(result)) expect(result.error.cause).toContain("Mixed");
  });

  it("returns err for expressions with mixed type suffixes like '1U8 + 255'", () => {
    const result = intepret("1U8 + 255");
    expect(isOk(result)).toBe(false);
    if (!isOk(result)) expect(result.error.cause).toContain("Mixed");
  });

  it("parses and evaluates multi-operand expressions like '1U8 + 2U8 + 3U8'", () => {
    const result = intepret("1U8 + 2U8 + 3U8");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(6);
  });

  it("parses and evaluates expressions with subtraction like '2 + 3 - 4'", () => {
    const result = intepret("2 + 3 - 4");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(1);
  });
});

describe("intepret - expressions: operators", () => {
  it("parses and evaluates expressions with multiplication like '2 * 3 + 4'", () => {
    const result = intepret("2 * 3 + 4");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(10);
  });

  it("parses and evaluates expressions with proper precedence like '4 + 2 * 3'", () => {
    const result = intepret("4 + 2 * 3");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(10);
  });

  it("parses and evaluates expressions with parentheses like '(4 + 2) * 3'", () => {
    const result = intepret("(4 + 2) * 3");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(18);
  });

  it("returns err for division by zero like '10 / (2 - 2)'", () => {
    const result = intepret("10 / (2 - 2)");
    expect(isOk(result)).toBe(false);
    if (!isOk(result)) expect(result.error.cause).toContain("Division");
  });

  it("parses and evaluates expressions with curly braces like '10 / ( { 2 } - 1)'", () => {
    const result = intepret("10 / ( { 2 } - 1)");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(10);
  });
});

describe("intepret - expressions: variables (basic)", () => {
  it("parses and evaluates variable declarations like '10 / ( { let x : I32 = 2; x } - 1)'", () => {
    const result = intepret("10 / ( { let x : I32 = 2; x } - 1)");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(10);
  });

  it("parses and evaluates simple top-level variable declarations like 'let x : I32 = 100; x'", () => {
    const result = intepret("let x : I32 = 100; x");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(100);
  });

  it("parses and evaluates top-level variable declarations without type suffix like 'let x = 100; x'", () => {
    const result = intepret("let x = 100; x");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(100);
  });

  it("parses and evaluates variable declarations with matching type suffixes like 'let x : U16 = 100U16; x'", () => {
    const result = intepret("let x : U16 = 100U16; x");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(100);
  });

  it("parses and evaluates variable declarations with widening type assignment like 'let x : U16 = 100U8; x'", () => {
    const result = intepret("let x : U16 = 100U8; x");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(100);
  });
});

describe("intepret - expressions: variables (type compatibility)", () => {
  it("returns err for variable declarations with narrowing type assignment like 'let x : U8 = 100U16; x'", () => {
    const result = intepret("let x : U8 = 100U16; x");
    expect(isOk(result)).toBe(false);
    if (!isOk(result))
      expect(result.error.cause.toLowerCase()).toContain("incompatible");
  });

  it("returns err for narrowing assignment with variable reference like 'let x : U16 = 100U16; let y : U8 = x; y'", () => {
    const result = intepret("let x : U16 = 100U16; let y : U8 = x; y");
    expect(isOk(result)).toBe(false);
    if (!isOk(result))
      expect(result.error.cause.toLowerCase()).toContain("incompatible");
  });

  it("returns err for narrowing assignment with inferred type like 'let x = 100U16; let y : U8 = x; y'", () => {
    const result = intepret("let x = 100U16; let y : U8 = x; y");
    expect(isOk(result)).toBe(false);
    if (!isOk(result))
      expect(result.error.cause.toLowerCase()).toContain("incompatible");
  });

  it("returns err for variable redeclaration like 'let x = 0; let x = 0; x'", () => {
    const result = intepret("let x = 0; let x = 0; x");
    expect(isOk(result)).toBe(false);
    if (!isOk(result))
      expect(result.error.cause.toLowerCase()).toContain("already");
  });

  it("parses and evaluates unsuffixed literal assignment to matching type like 'let x = 100; let y : I32 = x; y'", () => {
    const result = intepret("let x = 100; let y : I32 = x; y");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(100);
  });

  it("returns err for unsuffixed literal assignment to narrower type like 'let x = 100; let y : U8 = x; y'", () => {
    const result = intepret("let x = 100; let y : U8 = x; y");
    expect(isOk(result)).toBe(false);
    if (!isOk(result))
      expect(result.error.cause.toLowerCase()).toContain("incompatible");
  });
});

describe("intepret - expressions: variables (mutability)", () => {
  it("parses and evaluates mutable variable reassignment like 'let mut x = 0; x = 1; x'", () => {
    const result = intepret("let mut x = 0; x = 1; x");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(1);
  });

  it("returns err for immutable variable reassignment like 'let x = 0; x = 1; x'", () => {
    const result = intepret("let x = 0; x = 1; x");
    expect(isOk(result)).toBe(false);
    if (!isOk(result))
      expect(result.error.cause.toLowerCase()).toContain("immutable");
  });

  it("returns err for type incompatible reassignment like 'let mut x = 0U8; x = 1U16; x'", () => {
    const result = intepret("let mut x = 0U8; x = 1U16; x");
    expect(isOk(result)).toBe(false);
    if (!isOk(result))
      expect(result.error.cause.toLowerCase()).toContain("incompatible");
  });

  it("parses and evaluates top-level variable declarations like 'let z : I32 = 10 / ( { let x : I32 = 2; x } - 1); z'", () => {
    const result = intepret(
      "let z : I32 = 10 / ( { let x : I32 = 2; x } - 1); z",
    );
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(10);
  });
});
