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

  test("parses leading numeric prefix with suffix", () => {
    expect(interpret("100U8")).toBe(100);
    expect(() => interpret("  42xyz")).toThrow("Invalid numeric string");
    expect(() => interpret("3.99kg")).toThrow("Invalid numeric string");
    // Without leading whitespace, integer prefix with suffix is allowed
    expect(interpret("42xyz")).toBe(42);
  });
});
