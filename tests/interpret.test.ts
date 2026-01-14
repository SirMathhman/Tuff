import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";

describe("interpret basics", () => {
  it("parses integer string", () => {
    expect(interpret("100")).toBe(100);
  });

  it("parses numeric prefix when trailing chars present", () => {
    expect(interpret("100I8")).toBe(100);
  });

  it("throws when unsigned suffix 'U' is present on positive numbers", () => {
    expect(() => interpret("256U8")).toThrow();
  });

  it("parses negative numeric prefix when trailing chars present", () => {
    expect(interpret("-100I8")).toBe(-100);
  });

  it("throws when negative number has unsigned suffix 'U'", () => {
    expect(() => interpret("-100U8")).toThrow();
  });

  it("parses negative integer when input is exactly negative", () => {
    expect(interpret("-100")).toBe(-100);
  });
});

describe("interpret suffixes", () => {
  // Unsigned integer suffixes
  it("parses U8 within range", () => {
    expect(interpret("255U8")).toBe(255);
  });

  it("throws on U8 out of range", () => {
    expect(() => interpret("256U8")).toThrow();
  });

  it("parses U16 within range", () => {
    expect(interpret("65535U16")).toBe(65535);
  });

  it("parses U32 within range", () => {
    expect(interpret("4294967295U32")).toBe(4294967295);
  });

  // Signed integer suffixes
  it("parses I8 within range", () => {
    expect(interpret("127I8")).toBe(127);
  });

  it("throws on I8 out of range", () => {
    expect(() => interpret("128I8")).toThrow();
  });

  it("parses I16 within range", () => {
    expect(interpret("32767I16")).toBe(32767);
  });

  // Non-integer with suffix should throw
  it("throws on non-integer with suffix", () => {
    expect(() => interpret("1.5U8")).toThrow();
  });
});

describe("interpret addition", () => {
  it("adds two U8 values", () => {
    expect(interpret("1U8 + 2U8")).toBe(3);
  });

  it("throws on U8 addition overflow", () => {
    expect(() => interpret("1U8 + 255U8")).toThrow();
  });

  it("throws on U8 + U16 overflow", () => {
    expect(() => interpret("1U8 + 65535U16")).toThrow();
  });

  it("promotes U8 to U16 when adding (1U8 + 255U16 => 256)", () => {
    expect(interpret("1U8 + 255U16")).toBe(256);
  });

  it("throws when adding plain number to overflowing U8", () => {
    expect(() => interpret("1 + 255U8")).toThrow();
  });

  it("adds plain number and U8", () => {
    expect(interpret("1 + 2U8")).toBe(3);
  });

  it("adds U8 and plain number", () => {
    expect(interpret("1U8 + 2")).toBe(3);
  });
});

describe("interpret complex expressions", () => {
  it("adds mixed sequence with promotion (1U8 + 2 + 3U16 => 6)", () => {
    expect(interpret("1U8 + 2 + 3U16")).toBe(6);
  });

  it("evaluates mixed addition and subtraction (4 + 3 - 2 => 5)", () => {
    expect(interpret("4 + 3 - 2")).toBe(5);
  });

  it("handles multiplication with precedence (4 * 3 - 2 => 10)", () => {
    expect(interpret("4 * 3 - 2")).toBe(10);
  });

  it("handles multiplication with precedence (2 + 4 * 3 => 14)", () => {
    expect(interpret("2 + 4 * 3")).toBe(14);
  });

  it("handles parentheses ((2 + 4) * 3 => 18)", () => {
    expect(interpret("(2 + 4) * 3")).toBe(18);
  });

  it("handles nested parentheses (1 + (2 * 3) => 7)", () => {
    expect(interpret("1 + (2 * 3)")).toBe(7);
  });

  it("handles suffixes on parentheses ((2 + 4)U8 => 6)", () => {
    expect(interpret("(2 + 4)U8")).toBe(6);
  });

  it("throws on overflow with parentheses ((200 + 100)U8)", () => {
    expect(() => interpret("(200 + 100)U8")).toThrow();
  });

  it("handles negative results from parentheses (5 - (2 - 5) => 8)", () => {
    expect(interpret("5 - (2 - 5)")).toBe(8);
  });
});

describe("interpret blocks and variables", () => {
  it("handles curly braces ((2 + { 4 }) * 3 => 18)", () => {
    expect(interpret("(2 + { 4 }) * 3")).toBe(18);
  });

  it("handles variable declarations and blocks ((2 + { let x : I32 = 4; x }) * 3 => 18)", () => {
    expect(interpret("(2 + { let x : I32 = 4; x }) * 3")).toBe(18);
  });

  it("handles implicit type inference (let x = 4; x => 4)", () => {
    expect(interpret("let x = 4; x")).toBe(4);
  });

  it("infers type from suffix (let x = 4U8; x) and checks overflow", () => {
    expect(() => interpret("let x = 256U8; x")).toThrow();
  });

  it("handles complex inference ((2 + { let x = 4; x }) * 3 => 18)", () => {
    expect(interpret("(2 + { let x = 4; x }) * 3")).toBe(18);
  });

  it("throws on variable re-declaration in same scope", () => {
    expect(() => interpret("(2 + { let x = 4; let x = 7; x }) * 3")).toThrow();
  });

  it("allows shadowing in child scope", () => {
    expect(interpret("let x = 10; { let x = 5; x } + x")).toBe(15);
  });

  it("handles assignment and usage in complex expression (let z = (2 + { let x = 4; x }) * 3; z => 18)", () => {
    expect(interpret("let z = (2 + { let x = 4; x }) * 3; z")).toBe(18);
  });
});

describe("interpret assignment and mutability", () => {
  it("handles if expressions (let x = if (true) { let y = 200; y } else 400; x => 200)", () => {
    expect(interpret("let x = if (true) { let y = 200; y } else 400; x")).toBe(200);
  });

  it("handles nested if expressions", () => {
    expect(
      interpret("let x = if (true) { if (false) { 1 } else { 2 } } else { 3 }; x")
    ).toBe(2);
  });

  it("handles else if", () => {
    expect(
      interpret("let x = if (false) { 1 } else if (true) { 2 } else { 3 }; x")
    ).toBe(2);
  });

  it("throws on implicit narrowing assignment (let x = 100U16; let y : U8 = x;)", () => {
    expect(() => interpret("let x = 100U16; let y : U8 = x; y")).toThrow();
  });

  it("handles variable declaration and later assignment", () => {
    expect(interpret("let mut x : I32; x = 100; x")).toBe(100);
  });

  it("throws on narrowing assignment", () => {
    expect(() => interpret("let mut x : U8; x = 100U16")).toThrow();
  });

  it("handles assignment to outer scope from inner block", () => {
    expect(interpret("let mut x : I32; { x = 100; } x")).toBe(100);
  });

  it("handles mut keyword for mutable variables", () => {
    expect(interpret("let mut x = 0; x = 100; x")).toBe(100);
  });

  it("throws on assignment to immutable variable", () => {
    expect(() => interpret("let x = 0; x = 100; x")).toThrow(
      "Cannot assign to immutable variable: x"
    );
  });

  it("throws when accessing variable outside its block scope", () => {
    expect(() => interpret("{ let x : I32; } x = 100; x")).toThrow(
      "Variable not declared: x"
    );
  });

  it("handles block assignment to variables", () => {
    expect(interpret("let x = { let y = 200; y }; x")).toBe(200);
  });

  it("throws on U8 multiplication overflow (100 * 3U8)", () => {
    expect(() => interpret("100 * 3U8")).toThrow();
  });
});
