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
});
