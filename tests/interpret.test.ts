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

    // top-level boolean variable
    expect(interpret("let foo : Bool = true; foo")).toEqual({
      ok: true,
      value: 1,
    });
    expect(interpret("let foo:Bool=true;foo")).toEqual({ ok: true, value: 1 });
  });
  test("type checking for let declarations", () => {
    const r = interpret("let foo : Bool = 100; foo");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toEqual({
        type: "InvalidInput",
        message: "Type mismatch: expected Bool",
      });
    }

    const r2 = interpret("let x : I32 = 1.5; x");
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.error).toEqual({
        type: "InvalidInput",
        message: "Type mismatch: expected I32",
      });
    }
  });

  test("struct declarations return 0", () => {
    expect(interpret("struct Empty {}")).toEqual({ ok: true, value: 0 });
    expect(interpret("struct Empty {} struct Other {}")).toEqual({
      ok: true,
      value: 0,
    });
    // struct with a single field
    expect(interpret("struct Wrapper { value : I32 }")).toEqual({
      ok: true,
      value: 0,
    });
    // multiple fields and separators
    expect(interpret("struct Pair { a : I32; b : I32 }")).toEqual({
      ok: true,
      value: 0,
    });
    expect(interpret("struct Pair2 { a : I32, b : I32 }")).toEqual({
      ok: true,
      value: 0,
    });
    // point struct with comma separator
    expect(interpret("struct Point { x : I32, y : I32 }")).toEqual({
      ok: true,
      value: 0,
    });

    // duplicate struct in same scope should error
    const dupR = interpret("struct Copy {} struct Copy {}");
    expect(dupR.ok).toBe(false);
    if (!dupR.ok) {
      // message lives on InvalidInputError
      expect((dupR.error as any).message).toMatch(/Duplicate/);
    }

    // duplicate field names in the same struct should error
    const fldR = interpret("struct Test { x : I32, x : I32 }");
    expect(fldR.ok).toBe(false);
    if (!fldR.ok)
      expect((fldR.error as any).message).toMatch(/Duplicate field/);

    // struct construction and member access
    expect(
      interpret(
        "struct Point { x : I32, y : I32 } let myPoint : Point = Point { 3, 4 }; myPoint.x + myPoint.y"
      )
    ).toEqual({ ok: true, value: 7 });
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

  test("struct construction and member access (isolated)", () => {
    const base =
      "struct Point { x : I32, y : I32 } let myPoint : Point = Point { 3, 4 }; ";
    const r1 = interpret(base + "myPoint.x");
    expect(r1).toEqual({ ok: true, value: 3 });

    const r2 = interpret(base + "myPoint.y");
    expect(r2).toEqual({ ok: true, value: 4 });

    const r3 = interpret(base + "myPoint.x + myPoint.y");
    expect(r3).toEqual({ ok: true, value: 7 });
  });

  test("function declaration returns 0", () => {
    expect(interpret("fn empty() : Void => {}")).toEqual({
      ok: true,
      value: 0,
    });
  });

  test("function invocation with yield returns correct value", () => {
    expect(
      interpret(
        "fn add(first : I32, second : I32) => { yield first + second; } add(2, 3)"
      )
    ).toEqual({ ok: true, value: 5 });
  });

  test("calling a non-function returns an error", () => {
    expect(interpret("let x : I32 = 10; x(1)")).toEqual({
      ok: false,
      error: { type: "InvalidInput", message: "Not a function" },
    });
  });

  test("arity mismatch returns an error", () => {
    expect(interpret("fn single(a : I32) => { yield a; } single()")).toEqual({
      ok: false,
      error: { type: "InvalidInput", message: "Expected 1 arguments, got 0" },
    });
    expect(
      interpret("fn single(a : I32) => { yield a; } single(1, 2)")
    ).toEqual({
      ok: false,
      error: { type: "InvalidInput", message: "Expected 1 arguments, got 2" },
    });
  });

  test("wrong-typed argument returns an error", () => {
    expect(
      interpret("struct S { x : I32 } fn f(a : I32) => { yield a; } f(S { 1 })")
    ).toEqual({
      ok: false,
      error: {
        type: "InvalidInput",
        message: "Function arguments must be numeric or values",
      },
    });
  });

  test("function invocation without yield returns last expression", () => {
    expect(
      interpret(
        "fn add(first : I32, second : I32) => { first + second } add(2, 3)"
      )
    ).toEqual({ ok: true, value: 5 });
  });

  test("variable assignment after declaration", () => {
    expect(interpret("let result : I32; result = 20; result")).toEqual({
      ok: true,
      value: 20,
    });
  });

  test("simple recursion (factorial)", () => {
    const src = `fn fact(n : I32) => if (n) n * fact(n - 1) else 1; fact(5)`;
    expect(interpret(src)).toEqual({ ok: true, value: 120 });
  });

  test("mutable variable and augmented assignment", () => {
    expect(interpret("let mut x = 0; x += 1; x")).toEqual({
      ok: true,
      value: 1,
    });
  });

  test("cannot augmented-assign to immutable variable", () => {
    const r = interpret("let y = 0; y += 1");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toEqual({
        type: "InvalidInput",
        message: "Cannot assign to immutable variable",
      });
    }
  });
});
