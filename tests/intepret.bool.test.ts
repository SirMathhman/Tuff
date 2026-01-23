import { describe, it, expect } from "bun:test";
import { intepret } from "../src/eval/intepret";
import { isOk } from "../src/core/result";

describe("intepret - expressions: variables (bool)", () => {
  it("parses and evaluates boolean variable declaration like 'let x : Bool = true; x'", () => {
    const result = intepret("let x : Bool = true; x");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(1);
  });

  it("parses and evaluates boolean false like 'let x : Bool = false; x'", () => {
    const result = intepret("let x : Bool = false; x");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(0);
  });

  it("parses and evaluates mutable boolean reassignment like 'let mut x : Bool = true; x = false; x'", () => {
    const result = intepret("let mut x : Bool = true; x = false; x");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(0);
  });

  it("returns err for Bool type mixed with numeric types like 'let x : Bool = true; let y : U8 = 100U8; x'", () => {
    const result = intepret("let x : Bool = true; let y : U8 = 100U8; x");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(1);
  });
});

describe("intepret - expressions: variables (bool operators)", () => {
  it("parses and evaluates boolean OR like 'let x = true; let y = false; x || y'", () => {
    const result = intepret("let x = true; let y = false; x || y");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(1);
  });

  it("parses and evaluates boolean OR false || false like 'false || false'", () => {
    const result = intepret("false || false");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(0);
  });

  it("parses and evaluates boolean OR true || false like 'true || false'", () => {
    const result = intepret("true || false");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(1);
  });

  it("parses and evaluates boolean OR with variables like 'let x = false; let y = true; x || y'", () => {
    const result = intepret("let x = false; let y = true; x || y");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(1);
  });

  it("parses and evaluates boolean AND like 'let x = true; let y = false; x && y'", () => {
    const result = intepret("let x = true; let y = false; x && y");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(0);
  });

  it("parses and evaluates boolean AND true && true like 'true && true'", () => {
    const result = intepret("true && true");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(1);
  });

  it("parses and evaluates boolean AND true && false like 'true && false'", () => {
    const result = intepret("true && false");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(0);
  });

  it("parses and evaluates boolean AND with variables like 'let x = true; let y = true; x && y'", () => {
    const result = intepret("let x = true; let y = true; x && y");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(1);
  });
});

describe("intepret - expressions: variables (operator type constraints)", () => {
  it("returns err for logical OR on numeric types like '100U8 || 20U8'", () => {
    const result = intepret("100U8 || 20U8");
    expect(isOk(result)).toBe(false);
    if (!isOk(result))
      expect(result.error.cause.toLowerCase()).toContain("type");
  });

  it("returns err for arithmetic on boolean types like 'true + false'", () => {
    const result = intepret("true + false");
    expect(isOk(result)).toBe(false);
    if (!isOk(result))
      expect(result.error.cause.toLowerCase()).toContain("type");
  });

  it("returns err for logical AND on numeric types like 'let x = 100U8; let y = 20U8; x && y'", () => {
    const result = intepret("let x = 100U8; let y = 20U8; x && y");
    expect(isOk(result)).toBe(false);
    if (!isOk(result))
      expect(result.error.cause.toLowerCase()).toContain("type");
  });

  it("returns err for arithmetic on mixed boolean like 'let x = true; x - 1'", () => {
    const result = intepret("let x = true; x - 1");
    expect(isOk(result)).toBe(false);
    if (!isOk(result))
      expect(result.error.cause.toLowerCase()).toContain("type");
  });
});
