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

  test("parses leading numeric prefix with suffix (only U8 allowed)", () => {
    expect(interpret("100U8")).toBe(100);
    expect(() => interpret("100u8")).toThrow("Invalid numeric string");
    expect(() => interpret("42xyz")).toThrow("Invalid numeric string");
    expect(() => interpret("  42xyz")).toThrow("Invalid numeric string");
    expect(() => interpret("3.99kg")).toThrow("Invalid numeric string");
    // integer without suffix allowed
    expect(interpret("42")).toBe(42);
    // negative with U8 allowed
    expect(interpret("-7U8")).toBe(-7);
  });
});
