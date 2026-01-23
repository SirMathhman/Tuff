import { describe, it, expect } from "bun:test";
import { intepret } from "../src/eval/intepret";
import { isOk } from "../src/core/result";

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
