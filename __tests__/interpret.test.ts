import { interpret } from "../src/index";

describe("interpret", () => {
  test("parses numeric string to number", () => {
    expect(interpret("100")).toBe(100);
  });

  test("throws for invalid numeric string", () => {
    expect(() => interpret("abc")).toThrow("Invalid numeric string");
  });

  test("parses negative numbers", () => {
    expect(interpret("-42")).toBe(-42);
  });

  test("truncates floats toward zero", () => {
    expect(interpret("3.14")).toBe(3);
    expect(interpret("-3.14")).toBe(-3);
  });

  test("parses leading numeric prefix with typed suffixes", () => {
    // U8
    expect(interpret("100U8")).toBe(100);
    expect(interpret("255U8")).toBe(255);
    expect(() => interpret("256U8")).toThrow("Invalid numeric string");

    // U16
    expect(interpret("65535U16")).toBe(65535);
    expect(() => interpret("65536U16")).toThrow("Invalid numeric string");

    // U32
    expect(interpret("4294967295U32")).toBe(4294967295);
    expect(() => interpret("4294967296U32")).toThrow("Invalid numeric string");

    // I8
    expect(interpret("127I8")).toBe(127);
    expect(interpret("-128I8")).toBe(-128);
    expect(() => interpret("128I8")).toThrow("Invalid numeric string");
    expect(() => interpret("-129I8")).toThrow("Invalid numeric string");

    // U64: allow values up to JS safe integer only
    expect(interpret(String(Number.MAX_SAFE_INTEGER) + "U64")).toBe(
      Number.MAX_SAFE_INTEGER
    );
    expect(() =>
      interpret(String(Number.MAX_SAFE_INTEGER + 1) + "U64")
    ).toThrow("Invalid numeric string");

    // Misc rejects
    expect(() => interpret("100u8")).toThrow("Invalid numeric string");
    expect(() => interpret("42xyz")).toThrow("Invalid numeric string");
    expect(() => interpret("  42xyz")).toThrow("Invalid numeric string");
    expect(() => interpret("3.99kg")).toThrow("Invalid numeric string");
    // integer without suffix allowed
    expect(interpret("42")).toBe(42);
    // negative with U8 disallowed (lower bound)
    expect(() => interpret("-7U8")).toThrow("Invalid numeric string");
    expect(() => interpret("-100U8")).toThrow("Invalid numeric string");
  });

  test("evaluates addition expressions", () => {
    expect(interpret("1U8 + 2U8")).toBe(3);
    expect(interpret("100 + 200")).toBe(300);
    expect(interpret("10I8 + -20I8")).toBe(-10);
  });
});
