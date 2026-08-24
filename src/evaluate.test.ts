import { describe, expect, test } from "bun:test";
import { ErrorKind, type EvalError } from "./errors.ts";
import { evaluateTuff, executeTuff } from "./evaluate.ts";
import { Err, Ok, type Result } from "./result.ts";

function evaluateAndExecuteTuff(source: string, args: string[] = []): Result<number, EvalError> {
  const evaluatedExitCode = evaluateTuff(source);
  if (!evaluatedExitCode.ok) return Err(evaluatedExitCode.error);

  const executedExitCode = executeTuff(source, args);
  if (!executedExitCode.ok) return Err(executedExitCode.error);

  expect(evaluatedExitCode.value).toBe(executedExitCode.value);
  return Ok(evaluatedExitCode.value);
}

function expectErr(source: string, kind: ErrorKind, messageIncludes?: string) {
  const r = evaluateAndExecuteTuff(source);
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.error.kind).toBe(kind);
    if (messageIncludes) expect(r.error.message).toContain(messageIncludes);
  }
}

describe("evaluate: bindings & expressions", () => {
  test('evaluate("") => 0', () => {
    expect(evaluateAndExecuteTuff("")).toEqual({ ok: true, value: 0 });
  });

  test('evaluate("return 1;") => 1', () => {
    expect(evaluateAndExecuteTuff("return 1;")).toEqual({ ok: true, value: 1 });
  });

  test('evaluate("let x = 1; return x;") => 1', () => {
    expect(evaluateAndExecuteTuff("let x = 1; return x;")).toEqual({ ok: true, value: 1 });
  });

  test('evaluate("let mut x = 0; x = 1; return x;") => 1', () => {
    expect(evaluateAndExecuteTuff("let mut x = 0; x = 1; return x;")).toEqual({
      ok: true,
      value: 1,
    });
  });

  test('evaluate("let mut x = 1; x += 2; return x;") => 3', () => {
    expect(evaluateAndExecuteTuff("let mut x = 1; x += 2; return x;")).toEqual({
      ok: true,
      value: 3,
    });
  });

  test('evaluate("let x = 0; x = 1; return x;") => Err', () => {
    const r = evaluateAndExecuteTuff("let x = 0; x = 1; return x;");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe(ErrorKind.Mutability);
      expect(r.error.position).toEqual({ line: 1, column: 12 });
      expect(r.error.snippet).toBe("let x = 0; x = 1; return x;");
    }
  });

  test('evaluate("let x = 1;") => 0 (no return)', () => {
    expect(evaluateAndExecuteTuff("let x = 1;")).toEqual({ ok: true, value: 0 });
  });

  test('evaluate("let x = 100;") => 0', () => {
    expect(evaluateAndExecuteTuff("let x = 100;")).toEqual({ ok: true, value: 0 });
  });

  test('evaluate("let x = 1; return y;") => Err (undefined variable)', () => {
    expectErr("let x = 1; return y;", ErrorKind.Runtime);
  });

  test('evaluate("return 1 + 2 * 3;") => 7', () => {
    expect(evaluateAndExecuteTuff("return 1 + 2 * 3;")).toEqual({ ok: true, value: 7 });
  });

  test('evaluate("return 10 / 2;") => 5', () => {
    expect(evaluateAndExecuteTuff("return 10 / 2;")).toEqual({ ok: true, value: 5 });
  });

  test('evaluate("return 10 / 3;") => 3 (truncated)', () => {
    expect(evaluateAndExecuteTuff("return 10 / 3;")).toEqual({ ok: true, value: 3 });
  });
});

describe("evaluate: integer suffixes", () => {
  test('evaluate("return 100U8;") => 100', () => {
    expect(evaluateAndExecuteTuff("return 100U8;")).toEqual({ ok: true, value: 100 });
  });

  test('evaluate("return 100u8;") => Err (lowercase suffix)', () => {
    expectErr("return 100u8;", ErrorKind.Syntax);
  });

  test('evaluate("return 256U8;") => Err (out of range for U8)', () => {
    expectErr("return 256U8;", ErrorKind.Semantic);
  });

  test('evaluate("return 255U8 + 1U8;") => Err (overflow for U8)', () => {
    expectErr("return 255U8 + 1U8;", ErrorKind.Semantic);
  });

  test('evaluate("let x : U8 = 100U8; return x;") => 100', () => {
    expect(evaluateAndExecuteTuff("let x : U8 = 100U8; return x;")).toEqual({
      ok: true,
      value: 100,
    });
  });

  test('evaluate("let x : U8 = 100U16;") => Err (annotation mismatch)', () => {
    expectErr("let x : U8 = 100U16;", ErrorKind.Semantic);
  });

  test('evaluate("let mut x = 0U8; x = 100U16;") => Err (assignment type mismatch)', () => {
    expectErr("let mut x = 0U8; x = 100U16;", ErrorKind.Semantic);
  });
});

describe("evaluate: functions", () => {
  test("fn add(first : I32, second : I32) => 7", () => {
    const src =
      "fn add(first : I32, second : I32) : I32 => { return first + second; } return add(3, 4);";
    expect(evaluateAndExecuteTuff(src)).toEqual({ ok: true, value: 7 });
  });

  test("fn returning wrong type => Err (return type mismatch)", () => {
    expectErr("fn f() : I32 => { return 1U8; } return f();", ErrorKind.Semantic);
  });

  test("fn with no return => Err (missing return)", () => {
    expectErr("fn f() : I32 => { let x = 1; } return f();", ErrorKind.Semantic);
  });

  test("fn with conditional return only => Err (missing return)", () => {
    expectErr(
      "fn f(x : I32) : I32 => { if (x < 1) { return 1; } } return f(0);",
      ErrorKind.Semantic,
    );
  });

  test("fn with if/else returns => 1", () => {
    const src =
      "fn f(x : I32) : I32 => { if (x < 1) { return 1; } else { return 2; } } return f(0);";
    expect(evaluateAndExecuteTuff(src)).toEqual({ ok: true, value: 1 });
  });
});

describe("evaluate: structs", () => {
  test("struct Point + field access => 7", () => {
    const src =
      "struct Point { x : I32, y : I32 } let pt : Point = Point { x : 3, y : 4 }; return pt.x + pt.y;";
    expect(evaluateAndExecuteTuff(src)).toEqual({ ok: true, value: 7 });
  });

  test("struct literal with wrong field type => Err", () => {
    expectErr("struct P { x : I32 } let p = P { x : 1U8 }; return p.x;", ErrorKind.Semantic);
  });

  test("struct literal with unknown field => Err", () => {
    expectErr("struct P { x : I32 } let p = P { y : 1 }; return p.x;", ErrorKind.Semantic);
  });

  test("field access on non-struct => Err", () => {
    expectErr("let x = 1; return x.y;", ErrorKind.Semantic);
  });
});

describe("evaluate: arrays", () => {
  test('evaluate("let array = [1, 2, 3];") => 0', () => {
    expect(evaluateAndExecuteTuff("let array = [1, 2, 3];")).toEqual({ ok: true, value: 0 });
  });

  test('evaluate("let array = [1, 2, 3]; return array[0] + array[1] + array[2];") => 6', () => {
    const src = "let array = [1, 2, 3]; return array[0] + array[1] + array[2];";
    expect(evaluateAndExecuteTuff(src)).toEqual({ ok: true, value: 6 });
  });
});

describe("evaluate: references", () => {
  test('evaluate("let x = 1; let y = &x; return *y;") => 1', () => {
    expect(evaluateAndExecuteTuff("let x = 1; let y = &x; return *y;")).toEqual({
      ok: true,
      value: 1,
    });
  });

  test('evaluate("let mut x = 0; let y = &mut x; *y = 1; return x;") => 1', () => {
    const src = "let mut x = 0; let y = &mut x; *y = 1; return x;";
    expect(evaluateAndExecuteTuff(src)).toEqual({ ok: true, value: 1 });
  });

  test('evaluate("let mut x = 0; let a = &mut x; let b = &mut a; *b = 1; return x;") => 1', () => {
    const src = "let mut x = 0; let a = &mut x; let b = &mut a; *b = 1; return x;";
    expect(evaluateAndExecuteTuff(src)).toEqual({ ok: true, value: 1 });
  });

  test('evaluate("let x = 5; let a = &x; let b = &a; return *b;") => 5', () => {
    const src = "let x = 5; let a = &x; let b = &a; return *b;";
    expect(evaluateAndExecuteTuff(src)).toEqual({ ok: true, value: 5 });
  });

  test('evaluate("let mut x = &mut x; *x = 1;") => Err (ref cycle)', () => {
    const r = evaluateAndExecuteTuff("let mut x = &mut x; *x = 1;");
    expect(r.ok).toBe(false);
  });

  test('evaluate("let mut x = 0; let a = [&mut x]; let y = a[0]; *y = 1; return x;") => 1 (assign through unknown-kind ref)', () => {
    const src = "let mut x = 0; let a = [&mut x]; let y = a[0]; *y = 1; return x;";
    expect(evaluateAndExecuteTuff(src)).toEqual({ ok: true, value: 1 });
  });
});

describe("evaluate: dead code", () => {
  test('evaluate("if (false) { *y = 1; }") => Err (dead-code mutability)', () => {
    expectErr("let x = 0; let y = &x; if (false) { *y = 1; }", ErrorKind.Mutability);
  });

  test('evaluate("let mut x = 0; let y = &x; if (false) *y = 1; return x;") => Err', () => {
    expectErr("let mut x = 0; let y = &x; if (false) *y = 1; return x;", ErrorKind.Mutability);
  });

  test('evaluate("if (false) { if (1) {}}") => Err', () => {
    expectErr("if (false) { if (1) {}}", ErrorKind.Semantic);
  });

  test('evaluate("if (false) { let y = &(1 + 2); }") => Err', () => {
    expectErr("if (false) { let y = &(1 + 2); }", ErrorKind.Semantic);
  });

  test('evaluate("if (false) { let a = [true]; return a[0] + 1; }") => Err (dead-code element kind)', () => {
    expectErr("if (false) { let a = [true]; return a[0] + 1; }", ErrorKind.Semantic);
  });

  test('evaluate("if (false) { let x = 1; let y = *x; }") => Err (dead-code deref of non-ref)', () => {
    expectErr("if (false) { let x = 1; let y = *x; }", ErrorKind.Semantic);
  });

  test('evaluate("if (false) { let y = undefinedIdentifier; }") => Err', () => {
    expectErr("if (false) { let y = undefinedIdentifier; }", ErrorKind.Runtime);
  });

  test('evaluate("if (false) { return z; }") => Err (dead-code return of undefined)', () => {
    expectErr("if (false) { return z; }", ErrorKind.Runtime);
  });

  test('evaluate("if (false) { let y = &z; }") => Err (dead-code ref to undefined)', () => {
    expectErr("if (false) { let y = &z; }", ErrorKind.Runtime);
  });

  test('evaluate("if (1 < z) {}") => Err (undefined in condition operand)', () => {
    expectErr("if (1 < z) {}", ErrorKind.Runtime);
  });

  test('evaluate("if (false) { return -x; }") => Err (undefined in unary operand)', () => {
    expectErr("if (false) { return -x; }", ErrorKind.Runtime);
  });
});

describe("evaluate: values & shadowing", () => {
  test('evaluate("let x = true; return x;") => 1', () => {
    expect(evaluateAndExecuteTuff("let x = true; return x;")).toEqual({ ok: true, value: 1 });
  });

  test('evaluate("let x = 0; let y = 1; return x < y;") => 1', () => {
    expect(evaluateAndExecuteTuff("let x = 0; let y = 1; return x < y;")).toEqual({
      ok: true,
      value: 1,
    });
  });

  test('evaluate("let x = 0; let x = 1; return x;") => 1', () => {
    expect(evaluateAndExecuteTuff("let x = 0; let x = 1; return x;")).toEqual({
      ok: true,
      value: 1,
    });
  });
});

describe("evaluate control flow", () => {
  test('evaluate("let mut x = 0; if (false) { x = 1; } else { x = 2; } return x;") => 2', () => {
    const src = "let mut x = 0; if (false) { x = 1; } else { x = 2; } return x;";
    expect(evaluateAndExecuteTuff(src)).toEqual({ ok: true, value: 2 });
  });

  test('evaluate("let mut x = 0; if (false) { x = 1; } return x;") => 0', () => {
    const src = "let mut x = 0; if (false) { x = 1; } return x;";
    expect(evaluateAndExecuteTuff(src)).toEqual({ ok: true, value: 0 });
  });

  test('evaluate("let mut x = 0; if (false) x = 1; else x = 2; return x;") => 2', () => {
    const src = "let mut x = 0; if (false) x = 1; else x = 2; return x;";
    expect(evaluateAndExecuteTuff(src)).toEqual({ ok: true, value: 2 });
  });

  test('evaluate("let mut x = 0; return 1; x = 2; return x;") => 1', () => {
    const src = "let mut x = 0; return 1; x = 2; return x;";
    expect(evaluateAndExecuteTuff(src)).toEqual({ ok: true, value: 1 });
  });

  test('evaluate("let mut x = 0; { return 5; x = 1; } return x;") => 5', () => {
    const src = "let mut x = 0; { return 5; x = 1; } return x;";
    expect(evaluateAndExecuteTuff(src)).toEqual({ ok: true, value: 5 });
  });

  test('evaluate("let mut x = 0; while (x < 4) { x += 1; } return x;") => 4', () => {
    const src = "let mut x = 0; while (x < 4) { x += 1; } return x;";
    expect(evaluateAndExecuteTuff(src)).toEqual({ ok: true, value: 4 });
  });
});

describe("evaluate errors", () => {
  test('evaluate("return 1.5;") => Err (fractional literal)', () => {
    expectErr("return 1.5;", ErrorKind.Syntax);
  });

  test('evaluate("let x = 0; if (false) { let y = 1; y = 2; } return x;") => Err', () => {
    expectErr("let x = 0; if (false) { let y = 1; y = 2; } return x;", ErrorKind.Mutability, "y");
  });

  test('evaluate("let x = &1; return 0;") => Err (invalid reference target)', () => {
    expectErr("let x = &1; return 0;", ErrorKind.Semantic);
  });

  test('evaluate("let mut x = 0; { x = 1; } return x;") => 1', () => {
    expect(evaluateAndExecuteTuff("let mut x = 0; { x = 1; } return x;")).toEqual({
      ok: true,
      value: 1,
    });
  });

  test('evaluate("{ let x = 0; } return x;") => Err (block-scoped binding)', () => {
    expectErr("{ let x = 0; } return x;", ErrorKind.Runtime, "x");
  });

  test('evaluate("let x = 1; return *x;") => Err (deref of non-reference)', () => {
    expectErr("let x = 1; return *x;", ErrorKind.Semantic);
  });

  test('evaluate("let x = 1; *x = 2; return x;") => Err (assign through non-reference)', () => {
    expectErr("let x = 1; *x = 2; return x;", ErrorKind.Semantic);
  });

  test('evaluate("let x = 1; let y = &x; return y;") => Err (return a reference)', () => {
    expectErr("let x = 1; let y = &x; return y;", ErrorKind.Semantic);
  });

  test('evaluate("while(1) {}") => Err (non-boolean condition)', () => {
    expectErr("while(1) {}", ErrorKind.Semantic, "boolean");
  });
});

describe("evaluate errors: runtime", () => {
  test('evaluate("let array = [1, 2, 3]; return array[3];") => Err (index out of range)', () => {
    expectErr("let array = [1, 2, 3]; return array[3];", ErrorKind.Runtime, "out of range");
  });

  test('evaluate("let a = [1, 2]; let b = [true]; return a[b[0]];") => Err (non-number index)', () => {
    expectErr("let a = [1, 2]; let b = [true]; return a[b[0]];", ErrorKind.Semantic, "number");
  });

  test('evaluate("let mut x = 0; x = y;") => Err (undefined variable in assignment value)', () => {
    expectErr("let mut x = 0; x = y;", ErrorKind.Runtime, "y");
  });

  test('evaluate("return 1 / 0;") => Err (division by zero)', () => {
    expectErr("return 1 / 0;", ErrorKind.Runtime, "zero");
  });

  test('evaluate("return 1 % 0;") => Err (modulo by zero)', () => {
    expectErr("return 1 % 0;", ErrorKind.Runtime, "zero");
  });

  test('evaluate("if (false) { let x = 10 / 0; }") => Err (division by zero in dead code)', () => {
    expectErr("if (false) { let x = 10 / 0; }", ErrorKind.Runtime, "zero");
  });

  test('evaluate("if (false) { let y = 0; let x = 10 / y; }") => Err (division by zero via binding)', () => {
    expectErr("if (false) { let y = 0; let x = 10 / y; }", ErrorKind.Runtime, "zero");
  });

  test('evaluate("if (false) { let x = 10 / (1 - 1); }") => Err (division by zero via constant folding)', () => {
    expectErr("if (false) { let x = 10 / (1 - 1); }", ErrorKind.Runtime, "zero");
  });

  test('evaluate("if (false) { let x = 0; let y = &x; let z = 10 / *y; }") => Err (division by zero via reference)', () => {
    expectErr("if (false) { let x = 0; let y = &x; let z = 10 / *y; }", ErrorKind.Runtime, "zero");
  });

  test('evaluate("return true + 1;") => Err (boolean arithmetic operand)', () => {
    expectErr("return true + 1;", ErrorKind.Semantic, "numbers");
  });

  test('evaluate("return 1 + true;") => Err (boolean arithmetic operand)', () => {
    expectErr("return 1 + true;", ErrorKind.Semantic, "numbers");
  });
});
