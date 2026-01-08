import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";

describe("interpret (basic behavior)", () => {
  it("returns a number for any input", () => {
    const result = interpret("anything");
    expect(typeof result).toBe("number");
  });

  it("parses numeric strings and returns 0 for non-numeric strings", () => {
    expect(interpret("")).toBe(0);
    expect(interpret("42")).toBe(42);
    expect(interpret("hello world")).toBe(0);
  });

  it("handles the user-provided case '100' => 100", () => {
    expect(interpret("100")).toBe(100);
  });

  it("handles suffixes like 'U8' (e.g., '100U8' => 100)", () => {
    expect(interpret("100U8")).toBe(100);
    expect(interpret("100u8")).toBe(100);
  });

  it("throws for out-of-range unsigned values (e.g., '256U8')", () => {
    expect(() => interpret("256U8")).toThrow();
  });

  it("accepts max unsigned values (e.g., '255U8' => 255)", () => {
    expect(interpret("255U8")).toBe(255);
    expect(interpret("0U8")).toBe(0);
  });

  it("handles U16, U32 boundaries", () => {
    expect(interpret("65535U16")).toBe(65535);
    expect(() => interpret("65536U16")).toThrow();

    expect(interpret("4294967295U32")).toBe(4294967295);
    expect(() => interpret("4294967296U32")).toThrow();
  });

  it("handles U64 boundaries (accepts in-range, throws out-of-range)", () => {
    // 2^64-1 = 18446744073709551615
    expect(typeof interpret("18446744073709551615U64")).toBe("number");
    expect(() => interpret("18446744073709551616U64")).toThrow();
  });

  it("handles signed I8/I16/I32 boundaries", () => {
    expect(interpret("-128I8")).toBe(-128);
    expect(() => interpret("-129I8")).toThrow();
    expect(interpret("127I8")).toBe(127);
    expect(() => interpret("128I8")).toThrow();

    expect(interpret("-32768I16")).toBe(-32768);
    expect(() => interpret("-32769I16")).toThrow();
    expect(interpret("32767I16")).toBe(32767);
    expect(() => interpret("32768I16")).toThrow();

    expect(interpret("-2147483648I32")).toBe(-2147483648);
    expect(() => interpret("-2147483649I32")).toThrow();
    expect(interpret("2147483647I32")).toBe(2147483647);
    expect(() => interpret("2147483648I32")).toThrow();
  });

  it("handles I64 boundaries (accepts in-range, throws out-of-range)", () => {
    // min = -2^63 = -9223372036854775808
    expect(typeof interpret("-9223372036854775808I64")).toBe("number");
    expect(() => interpret("-9223372036854775809I64")).toThrow();
  });

  it("throws for negative numbers with suffixes (e.g., '-100U8')", () => {
    expect(() => interpret("-100U8")).toThrow();
  });

  it("parses negative numbers without suffixes (e.g., '-100' => -100)", () => {
    expect(interpret("-100")).toBe(-100);
  });

  it("evaluates simple addition of suffixed integers (e.g., '1U8 + 2U8' => 3)", () => {
    expect(interpret("1U8 + 2U8")).toBe(3);
  });

  it("evaluates chained addition of suffixed integers (e.g., '1U8 + 2U8 + 3U8' => 6)", () => {
    expect(interpret("1U8 + 2U8 + 3U8")).toBe(6);
  });

  it("handles mixed suffixed and unsuffixed addition (e.g., '1U8 + 2' => 3)", () => {
    expect(interpret("1U8 + 2")).toBe(3);
    expect(interpret("2 + 1U8")).toBe(3);
  });

  it("throws when mixed suffixed addition overflows (e.g., '1U8 + 255' => Error)", () => {
    expect(() => interpret("1U8 + 255")).toThrow();
    expect(() => interpret("255 + 1U8")).toThrow();
  });

  it("accepts mixed suffixed addition when sum fits (e.g., '1U8 + 254' => 255)", () => {
    expect(interpret("1U8 + 254")).toBe(255);
    expect(interpret("254 + 1U8")).toBe(255);
  });

  it("throws when adding operands with mismatched suffixes (e.g., '5U8 + 4U16')", () => {
    expect(() => interpret("5U8 + 4U16")).toThrow();
    expect(() => interpret("4U16 + 5U8")).toThrow();
  });

  it("handles subtraction with mixed suffixed/unsuffixed operands (e.g., '5 - 4U8' => 1)", () => {
    expect(interpret("5 - 4U8")).toBe(1);
    expect(interpret("5U8 - 4")).toBe(1);
  });

  it("throws when subtraction underflows unsigned range (e.g., '4 - 5U8')", () => {
    expect(() => interpret("4 - 5U8")).toThrow();
    expect(() => interpret("4U8 - 5")).toThrow();
  });

  it("handles multiplication with suffixed and unsuffixed operands (e.g., '2U8 * 3' => 6)", () => {
    expect(interpret("2U8 * 3")).toBe(6);
    expect(interpret("3 * 2U8")).toBe(6);
  });

  it("throws on overflow for multiplication (e.g., '2U8 * 128' => Error)", () => {
    expect(() => interpret("2U8 * 128")).toThrow();
    expect(() => interpret("128 * 2U8")).toThrow();
  });

  it("evaluates mixed operator expressions left-associatively (e.g., '5 * 3 + 1' => 16)", () => {
    expect(interpret("5 * 3 + 1")).toBe(16);
  });

  it("respects operator precedence ('1 + 5 * 3' => 16)", () => {
    expect(interpret("1 + 5 * 3")).toBe(16);
  });

  it("handles parentheses and respects grouping ('(1 + 5) * 3' => 18)", () => {
    expect(interpret("(1 + 5) * 3")).toBe(18);
  });

  it("handles braces and respects grouping ('1 + { 10 } % 3' => 2)", () => {
    expect(interpret("1 + { 10 } % 3")).toBe(2);
  });

  it("handles blocks with let and returns last expression ('1 + { let x : 10I32 = 10I32; x } % 3' => 2)", () => {
    expect(interpret("1 + { let x : 10I32 = 10I32; x } % 3")).toBe(2);
  });

  it("throws when annotation doesn't match initializer ('1 + { let x : 1I32 = 10I32; x } % 3' => Error)", () => {
    expect(() => interpret("1 + { let x : 1I32 = 10I32; x } % 3")).toThrow();
  });

  it("accepts type-only annotation ('1 + { let x : I32 = 10I32; x } % 3' => 2)", () => {
    expect(interpret("1 + { let x : I32 = 10I32; x } % 3")).toBe(2);
  });

  it("accepts unannotated let ('1 + { let x = 10I32; x } % 3' => 2)", () => {
    expect(interpret("1 + { let x = 10I32; x } % 3")).toBe(2);
  });

  it("accepts unannotated plain integer let ('1 + { let x = 10; x } % 3' => 2)", () => {
    expect(interpret("1 + { let x = 10; x } % 3")).toBe(2);
  });

  it("evaluates block returning expression ('{ let x = 10; let y = 20; x + y }' => 30)", () => {
    expect(interpret("{ let x = 10; let y = 20; x + y }")).toBe(30);
  });

  it("evaluates top-level statements ('let x = 10; let y = 20; x + y' => 30)", () => {
    expect(interpret("let x = 10; let y = 20; x + y")).toBe(30);
  });

  it("throws on duplicate declaration in same scope ('let x = 10; let x = 20;' => Error)", () => {
    expect(() => interpret("let x = 10; let x = 20;")).toThrow();
  });

  it("throws on duplicate declaration in block ('{ let x = 10; let x = 20; }' => Error)", () => {
    expect(() => interpret("{ let x = 10; let x = 20; }")).toThrow();
  });

  it("throws when initializer identifier doesn't match annotation ('let x = 10; let y : 20I32 = x;' => Error)", () => {
    expect(() => interpret("let x = 10; let y : 20I32 = x;")).toThrow();
  });

  it("throws when initializer identifier doesn't match annotation in block ('{ let x = 10; let y : 20I32 = x; }' => Error)", () => {
    expect(() => interpret("{ let x = 10; let y : 20I32 = x; }")).toThrow();
  });

  it("accepts initializer identifier matching annotated literal ('let x = 20; let y : 20I32 = x; x' => 20)", () => {
    expect(interpret("let x = 20; let y : 20I32 = x; x")).toBe(20);
  });

  it("accepts initializer identifier matching annotated literal in block ('{ let x = 20; let y : 20I32 = x; x }' => 20)", () => {
    expect(interpret("{ let x = 20; let y : 20I32 = x; x }")).toBe(20);
  });

  it("allows unrelated statements between declarations ('let x = 20; let z = 0; let y : 20I32 = x; x' => 20)", () => {
    expect(interpret("let x = 20; let z = 0; let y : 20I32 = x; x")).toBe(20);
  });

  it("throws when assigning a statement-only block to a variable ('let x = { let y = 20; }; x' => Error)", () => {
    expect(() => interpret("let x = { let y = 20; }; x")).toThrow();
    expect(() => interpret("{ let x = { let y = 20; }; x }")).toThrow();
  });

  it("accepts initializer block with final expression ('let x = { let y = 20; y }; x' => 20)", () => {
    expect(interpret("let x = { let y = 20; y }; x")).toBe(20);
    expect(interpret("{ let x = { let y = 20; y }; x }")).toBe(20);
  });

  it("returns 0 for let-only sequences ('let x = 10;' => 0)", () => {
    expect(interpret("let x = 10;")).toBe(0);
    expect(interpret("{ let x = 10; }")).toBe(0);
  });

  it("handles division and respects precedence ('1 + 10 / 2' => 6)", () => {
    expect(interpret("1 + 10 / 2")).toBe(6);
  });

  it("handles modulus and respects precedence ('1 + 10 % 3' => 2)", () => {
    expect(interpret("1 + 10 % 3")).toBe(2);
  });

  it("throws when multiplying unsigned by a negative number (e.g., '2U8 * -1' => Error)", () => {
    expect(() => interpret("2U8 * -1")).toThrow();
    expect(() => interpret("-1 * 2U8")).toThrow();
  });
});
