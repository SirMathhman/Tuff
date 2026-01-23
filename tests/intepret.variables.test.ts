import { describe, it, expect } from "bun:test";
import { intepret } from "../src/intepret";
import { isOk } from "../src/result";

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

  it("returns err for reassignment of undefined variable like 'let mut y = 0U8; x = 1U8; y'", () => {
    const result = intepret("let mut y = 0U8; x = 1U8; y");
    expect(isOk(result)).toBe(false);
    if (!isOk(result))
      expect(result.error.cause.toLowerCase()).toContain("undefined");
  });

  it("parses and evaluates multiple reassignments like 'let mut x = 0; x = 1; x = 2; x'", () => {
    const result = intepret("let mut x = 0; x = 1; x = 2; x");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(2);
  });

  it("parses and evaluates top-level variable declarations like 'let z : I32 = 10 / ( { let x : I32 = 2; x } - 1); z'", () => {
    const result = intepret(
      "let z : I32 = 10 / ( { let x : I32 = 2; x } - 1); z",
    );
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(10);
  });

  it("returns err for block-scoped variable access like '{ let mut x = 0; } x = 1; x'", () => {
    const result = intepret("{ let mut x = 0; } x = 1; x");
    expect(isOk(result)).toBe(false);
    if (!isOk(result))
      expect(result.error.cause.toLowerCase()).toContain("undefined");
  });
});
