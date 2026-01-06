import { interpret } from "../src/interpret";

describe("interpret", () => {
  test("returns 0 for empty or whitespace-only strings", () => {
    expect(interpret("")).toBe(0);
    expect(interpret("   ")).toBe(0);
  });

  test("parses numeric literals", () => {
    expect(interpret("42")).toBe(42);
    expect(interpret("100")).toBe(100);
    expect(interpret("-3.14")).toBeCloseTo(-3.14);
  });

  test("simple addition via split on '+'", () => {
    expect(interpret("1 + 2")).toBe(3);
    expect(interpret("1+2")).toBe(3);
    expect(interpret(" 1 + 2 ")).toBe(3);
    expect(interpret("1 + 2 + 3")).toBe(6);
    expect(interpret("1+2+3")).toBe(6);
  });

  test("addition and subtraction combined", () => {
    expect(interpret("10 - 5 + 3")).toBe(8);
    expect(interpret("10-5+3")).toBe(8);
    expect(interpret(" 10 -5 +3 ")).toBe(8);
  });
  test("multiplication within additions (no precedence)", () => {
    expect(interpret("10 * 5 + 3")).toBe(53);
    expect(interpret("10*5+3")).toBe(53);
    expect(interpret("2 * 3 * 4 + 1")).toBe(25);
    expect(interpret("3 + 10 * 5")).toBe(53);
    expect(interpret("3+10*5")).toBe(53);
    expect(interpret(" 3 + 10 * 5 ")).toBe(53);
  });
  test('division and multiplication precedence', () => {
    expect(interpret('1 + 10 / 5')).toBe(3);
    expect(interpret('1+10/5')).toBe(3);
    expect(interpret('10 / 5 + 1')).toBe(3);
  });
  test("multiplication-only expressions", () => {
    expect(interpret("6 * 7")).toBe(42);
    expect(interpret("6*7")).toBe(42);
    expect(interpret(" -2 * 3 ")).toBe(-6);
  });
  test("throws undefined identifier for unknown identifiers like 'wah'", () => {
    expect(() => interpret("wah")).toThrowError("Undefined identifier: wah");
  });
});
