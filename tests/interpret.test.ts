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

  test('addition and subtraction combined', () => {
    expect(interpret('10 - 5 + 3')).toBe(8);
    expect(interpret('10-5+3')).toBe(8);
    expect(interpret(' 10 -5 +3 ')).toBe(8);
  });

  test("throws undefined identifier for unknown identifiers like 'wah'", () => {
    expect(() => interpret("wah")).toThrowError("Undefined identifier: wah");
  });
});
