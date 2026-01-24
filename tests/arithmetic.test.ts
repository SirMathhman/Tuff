import { describe, it, expect } from "bun:test";
import { interpret } from "../src/utils/interpret";

describe("interpret - arithmetic", () => {
  it("returns 0 for empty string", () => {
    expect(interpret("")).toBe(0);
  });

  it("parses a number string and returns the number", () => {
    expect(interpret("100")).toBe(100);
  });

  it("parses a number with a type suffix and returns the number", () => {
    expect(interpret("100U8")).toBe(100);
  });

  it("throws for negative value with unsigned suffix", () => {
    expect(() => interpret("-100U8")).toThrow();
  });

  it("throws for overflow with unsigned suffix U8", () => {
    expect(() => interpret("256U8")).toThrow();
  });

  it("parses simple addition with typed literals", () => {
    expect(interpret("1U8 + 2U8")).toBe(3);
  });

  it("throws on overflow when adding two U8 values", () => {
    expect(() => interpret("1U8 + 255U8")).toThrow();
  });

  it("parses addition with mixed typed and untyped operands", () => {
    expect(interpret("1 + 2U8")).toBe(3);
  });

  it("parses addition with typed operand on left and untyped on right", () => {
    expect(interpret("1U8 + 2")).toBe(3);
  });

  it("parses chained addition expressions", () => {
    expect(interpret("1 + 2 + 3")).toBe(6);
  });

  it("parses mixed addition and subtraction", () => {
    expect(interpret("2 + 3 - 4")).toBe(1);
  });

  it("respects operator precedence: multiplication before subtraction", () => {
    expect(interpret("2 * 3 - 4")).toBe(2);
  });

  it("respects operator precedence: multiplication before addition", () => {
    expect(interpret("2 + 3 * 4")).toBe(14);
  });

  it("respects parentheses for grouping", () => {
    expect(interpret("(2 + 3) * 4")).toBe(20);
  });

  it("respects curly braces for grouping", () => {
    expect(interpret("(2 + { 3 }) * 4")).toBe(20);
  });

  it("supports logical not operator on boolean literal true", () => {
    expect(interpret("!true")).toBe(0);
  });

  it("supports logical not operator on boolean literal false", () => {
    expect(interpret("!false")).toBe(1);
  });

  it("supports logical not on variable", () => {
    expect(interpret("let x = true; !x")).toBe(0);
  });

  it("supports logical not on expression", () => {
    expect(interpret("!(1 + 1 > 2)")).toBe(1);
  });

  it("supports double negation", () => {
    expect(interpret("!!true")).toBe(1);
  });

  it("supports unary minus on positive number", () => {
    expect(interpret("-(5)")).toBe(-5);
  });

  it("supports unary minus on variable", () => {
    expect(interpret("let x = 10; -x")).toBe(-10);
  });

  it("supports unary minus on expression", () => {
    expect(interpret("-(2 + 3)")).toBe(-5);
  });
});
