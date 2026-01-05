/* eslint-env vitest */
import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";

describe("interpret - basic expressions", () => {
  it("parses numeric strings", () => {
    expect(interpret("100")).toBe(100);
  });

  it("adds simple expressions", () => {
    expect(interpret("1 + 2")).toBe(3);
  });

  it("adds multiple terms", () => {
    expect(interpret("1 + 2 + 3")).toBe(6);
  });

  it("handles mixed addition and subtraction", () => {
    expect(interpret("10 - 5 + 3")).toBe(8);
  });

  it("supports multiplication with precedence", () => {
    expect(interpret("10 * 5 + 3")).toBe(53);
  });

  it("handles multiplication without space after operator", () => {
    expect(interpret("3 +10 * 5")).toBe(53);
  });

  it("supports parentheses with precedence", () => {
    expect(interpret("(3 + 10) * 5")).toBe(65);
  });

  it("handles multiple parenthesized terms", () => {
    expect(interpret("(3 + 10) * (4 + 1)")).toBe(65);
  });

  it("supports if expressions inside parentheses (true branch)", () => {
    expect(interpret("(3 + if (true) 10 else 2) * (4 + 1)")).toBe(65);
  });

  it("supports if expressions inside parentheses (false branch)", () => {
    expect(interpret("(3 + if (false) 10 else 2) * (4 + 1)")).toBe(25);
  });

  it("supports braces with if inside parentheses", () => {
    expect(interpret("(3 + { if (true) 10 else 2 }) * (4 + 1)")).toBe(65);
  });
});

describe("interpret - lets, bools, and functions", () => {
  it("supports let bindings inside braces", () => {
    expect(
      interpret("(3 + { let x : I32 = if (true) 10 else 2; x }) * (4 + 1)")
    ).toBe(65);
  });

  it("supports multiple let bindings inside braces", () => {
    expect(
      interpret(
        "(3 + { let x : I32 = if (true) 10 else 2; let y : I32 = x; y }) * (4 + 1)"
      )
    ).toBe(65);
  });

  it("supports top-level let bindings", () => {
    expect(
      interpret(
        "let z : I32 = (3 + { let x : I32 = if (true) 10 else 2; let y : I32 = x; y }) * (4 + 1); z"
      )
    ).toBe(65);
  });

  it("returns 0 for top-level let with no body", () => {
    expect(interpret("let x : I32 = 100;")).toBe(0);
  });

  it("errors for duplicate top-level let declarations", () => {
    expect(interpret("let x : I32 = 100; let x : I32 = 200;")).toBeNaN();
  });

  it("errors for duplicate let declarations inside braces", () => {
    expect(interpret("{ let x : I32 = 1; let x : I32 = 2; x }")).toBeNaN();
  });

  it("supports Bool type at top-level", () => {
    expect(interpret("let x : Bool = true; x")).toBe(1);
    expect(interpret("let x : Bool = false; x")).toBe(0);
  });

  it("supports Bool type inside braces", () => {
    expect(interpret("(3 + { let x : Bool = true; x }) * (4 + 1)")).toBe(20);
  });
});

describe("interpret - functions & errors", () => {
  it("supports top-level function definitions and calls using yield", () => {
    const src =
      "fn addTwo(first : I32, second : I32) : I32 => { yield first + second; } addTwo(100, 200)";
    expect(interpret(src)).toBe(300);
  });

  it("supports top-level function definitions and calls without yield", () => {
    const src =
      "fn addTwo(first : I32, second : I32) : I32 => { first + second } addTwo(100, 200)";
    expect(interpret(src)).toBe(300);
  });

  it("errors for unsupported let type top-level", () => {
    expect(interpret("let x : Foo = 0;")).toBeNaN();
  });

  it("returns NaN for malformed leading operator", () => {
    expect(interpret("+ 1")).toBeNaN();
  });

  it("returns NaN for unknown operator", () => {
    expect(interpret("1 ^ 2")).toBeNaN();
  });

  it("returns NaN for non-numeric strings", () => {
    expect(interpret("foo")).toBeNaN();
  });
});
