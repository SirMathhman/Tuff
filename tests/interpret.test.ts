import { interpret } from "../src/interpret";

describe("interpret", () => {
  test("returns 0 for empty or whitespace-only strings", () => {
    expect(interpret("")).toEqual({ ok: true, value: 0 });
    expect(interpret("   ")).toEqual({ ok: true, value: 0 });
  });

  test("parses numeric literals", () => {
    expect(interpret("42")).toEqual({ ok: true, value: 42 });
    expect(interpret("100")).toEqual({ ok: true, value: 100 });
    expect(interpret("-3.14")).toEqual({ ok: true, value: -3.14 });
  });

  test("simple addition via split on '+'", () => {
    expect(interpret("1 + 2")).toEqual({ ok: true, value: 3 });
    expect(interpret("1+2")).toEqual({ ok: true, value: 3 });
    expect(interpret(" 1 + 2 ")).toEqual({ ok: true, value: 3 });
    expect(interpret("1 + 2 + 3")).toEqual({ ok: true, value: 6 });
    expect(interpret("1+2+3")).toEqual({ ok: true, value: 6 });
  });

  test("addition and subtraction combined", () => {
    expect(interpret("10 - 5 + 3")).toEqual({ ok: true, value: 8 });
    expect(interpret("10-5+3")).toEqual({ ok: true, value: 8 });
    expect(interpret(" 10 -5 +3 ")).toEqual({ ok: true, value: 8 });
  });

  test("multiplication within additions (no precedence)", () => {
    expect(interpret("10 * 5 + 3")).toEqual({ ok: true, value: 53 });
    expect(interpret("10*5+3")).toEqual({ ok: true, value: 53 });
    expect(interpret("2 * 3 * 4 + 1")).toEqual({ ok: true, value: 25 });
    expect(interpret("3 + 10 * 5")).toEqual({ ok: true, value: 53 });
    expect(interpret("3+10*5")).toEqual({ ok: true, value: 53 });
    expect(interpret(" 3 + 10 * 5 ")).toEqual({ ok: true, value: 53 });
  });

  test("division and multiplication precedence", () => {
    expect(interpret("1 + 10 / 5")).toEqual({ ok: true, value: 3 });
    expect(interpret("1+10/5")).toEqual({ ok: true, value: 3 });
    expect(interpret("10 / 5 + 1")).toEqual({ ok: true, value: 3 });
  });

  test("multiplication-only expressions", () => {
    expect(interpret("6 * 7")).toEqual({ ok: true, value: 42 });
    expect(interpret("6*7")).toEqual({ ok: true, value: 42 });
    expect(interpret(" -2 * 3 ")).toEqual({ ok: true, value: -6 });
  });

  test("parentheses grouping", () => {
    expect(interpret("(2 + 10) / 6")).toEqual({ ok: true, value: 2 });
    expect(interpret("( 2+10 )/6")).toEqual({ ok: true, value: 2 });
    expect(interpret(" ( 2 + 10 ) / 6 ")).toEqual({ ok: true, value: 2 });
  });
  test("conditional expressions", () => {
    expect(interpret("(2 + if (true) 10 else 3) / 6")).toEqual({
      ok: true,
      value: 2,
    });
    expect(interpret("(2+if(true)10 else 3)/6")).toEqual({
      ok: true,
      value: 2,
    });
    expect(interpret(" ( 2 + if ( false ) 10 else 3 ) / 6 ")).toEqual({
      ok: true,
      value: 0.8333333333333334,
    });
  });
  test("returns an error for unknown identifiers like 'wah'", () => {
    const r = interpret("wah");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toEqual({
        type: "UndefinedIdentifier",
        identifier: "wah",
      });
    }
  });
});
