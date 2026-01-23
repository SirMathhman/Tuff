import { describe, it, expect } from "bun:test";
import { interpret } from "../src/app";

describe("interpret", () => {
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

  it("supports simple variable declaration", () => {
    expect(interpret("let x : I32 = 3; x")).toBe(3);
  });

  it("handles variable declarations in grouped expressions", () => {
    expect(interpret("{ let x : I32 = 3; x }")).toBe(3);
  });

  it("supports variable declarations with type annotations", () => {
    expect(interpret("(2 + { let x : I32 = 3; x }) * 4")).toBe(20);
  });

  it("supports variable references in declarations", () => {
    expect(interpret("let x : I32 = 100; let y : I32 = x; y")).toBe(100);
  });

  it("supports variable declarations without type annotations", () => {
    expect(interpret("let x = 100; let y = x; y")).toBe(100);
  });

  it("throws on duplicate variable declaration in same scope", () => {
    expect(() => interpret("let x = 100; let x = 200; x")).toThrow();
  });

  it("allows narrower type assignment to wider type variable", () => {
    expect(interpret("let x : U16 = 100U8; x")).toBe(100);
  });

  it("throws when assigning wider type to narrower type variable", () => {
    expect(() => interpret("let x : U8 = 100U16; x")).toThrow();
  });

  it("throws when assigning variable of wider type to narrower type variable", () => {
    expect(() => interpret("let x = 100U16; let y : U8 = x; y")).toThrow();
  });

  it("supports mutable variable assignment", () => {
    expect(interpret("let mut x = 0; x = 100; x")).toBe(100);
  });

  it("throws when reassigning immutable variable", () => {
    expect(() => interpret("let x = 0; x = 100; x")).toThrow();
  });

  it("allows mutable variable reassignment inside grouped expressions", () => {
    expect(interpret("let mut x = 0; { x = 100; } x")).toBe(100);
  });

  it("throws when variable is declared inside grouped expressions and used outside", () => {
    expect(() => interpret("{ let mut x = 0; } x = 100; x")).toThrow();
  });

  it("supports boolean literal true", () => {
    expect(interpret("true")).toBe(1);
  });

  it("supports boolean literal false", () => {
    expect(interpret("false")).toBe(0);
  });

  it("supports boolean variable declarations with Bool type", () => {
    expect(interpret("let x : Bool = true; x")).toBe(1);
  });

  it("supports boolean variable with false", () => {
    expect(interpret("let y : Bool = false; y")).toBe(0);
  });

  it("supports if-else expression with true condition", () => {
    expect(interpret("if (true) 3 else 4")).toBe(3);
  });

  it("supports if-else expression with false condition", () => {
    expect(interpret("if (false) 3 else 4")).toBe(4);
  });

  it("supports if-else in variable declaration", () => {
    expect(interpret("let x : I32 = if (true) 3 else 4; x")).toBe(3);
  });

  it("supports if-else with arithmetic", () => {
    expect(interpret("if (1 + 1 > 1) 10 else 20")).toBe(10);
  });

  it("supports nested if-else-if-else expressions", () => {
    expect(
      interpret("let x : I32 = if (true) 3 else if (false) 4 else 5; x"),
    ).toBe(3);
  });

  it("supports match expression with literal pattern", () => {
    expect(
      interpret("let x : I32 = match (100) { case 100 => 3; case _ => 2; } x"),
    ).toBe(3);
  });

  it("supports loop expression with break", () => {
    expect(interpret("let x : I32 = loop { break 5; }; x")).toBe(5);
  });

  it("supports loop with break inside if condition", () => {
    expect(interpret("let x : I32 = loop { if (true) break 5; }; x")).toBe(5);
  });

  it("supports uninitialized variable declaration", () => {
    expect(interpret("let x : I32; x = 100; x")).toBe(100);
  });

  it("throws when reassigning uninitialized variable without mut", () => {
    expect(() => interpret("let x : I32; x = 10; x = 20; x")).toThrow();
  });

  it("supports mut uninitialized variable declaration", () => {
    expect(interpret("let mut x : I32; x = 10; x = 20; x")).toBe(20);
  });
});
