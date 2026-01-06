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
    const cases = [
      ["1 + 2", 3],
      ["1+2", 3],
      [" 1 + 2 ", 3],
      ["1 + 2 + 3", 6],
      ["1+2+3", 6],
    ] as const;
    for (const [input, expected] of cases) {
      expect(interpret(input)).toEqual({ ok: true, value: expected });
    }
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

  test("parentheses/brace grouping", () => {
    expect(interpret("(2 + 10) / 6")).toEqual({ ok: true, value: 2 });
    expect(interpret("( 2+10 )/6")).toEqual({ ok: true, value: 2 });
    expect(interpret(" ( 2 + 10 ) / 6 ")).toEqual({ ok: true, value: 2 });

    expect(interpret("(2 + { 10 }) / 6")).toEqual({ ok: true, value: 2 });
    expect(interpret("(2+{10})/6")).toEqual({ ok: true, value: 2 });
    expect(interpret(" ( 2 + { 10 } ) / 6 ")).toEqual({ ok: true, value: 2 });

    // block with variable declaration
    expect(interpret("(2 + { let x : I32 = 10; x }) / 6")).toEqual({
      ok: true,
      value: 2,
    });
    expect(interpret("(2+{let x:I32=10;x})/6")).toEqual({ ok: true, value: 2 });

    // duplicate declaration in same block should error
    const r = interpret("(2 + { let x : I32 = 10; let x : I32 = 20; x }) / 6");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toEqual({
        type: "InvalidInput",
        message: "Duplicate variable declaration",
      });
    }

    // chained declarations referencing previous vars
    expect(
      interpret("(2 + { let x : I32 = 10; let y : I32 = x; y }) / 6")
    ).toEqual({
      ok: true,
      value: 2,
    });
    expect(interpret("(2+{let x:I32=10;let y:I32=x;y})/6")).toEqual({
      ok: true,
      value: 2,
    });

    // top-level let declaration and subsequent expression
    expect(
      interpret("let z : I32 = (2 + { let x : I32 = 10; x }) / 6; z")
    ).toEqual({ ok: true, value: 2 });
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
