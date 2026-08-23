import { describe, expect, test } from "bun:test";
import { evaluate } from "./index.ts";
import type { EvalError } from "./src/errors.ts";

describe("evaluate: bindings & expressions", () => {
  test('evaluate("") => 0', () => {
    expect(evaluate("")).toEqual({ ok: true, value: 0 });
  });

  test('evaluate("return 1;") => 1', () => {
    expect(evaluate("return 1;")).toEqual({ ok: true, value: 1 });
  });

  test('evaluate("let x = 1; return x;") => 1', () => {
    expect(evaluate("let x = 1; return x;")).toEqual({ ok: true, value: 1 });
  });

  test('evaluate("let mut x = 0; x = 1; return x;") => 1', () => {
    expect(evaluate("let mut x = 0; x = 1; return x;")).toEqual({ ok: true, value: 1 });
  });

  test('evaluate("let mut x = 1; x += 2; return x;") => 3', () => {
    expect(evaluate("let mut x = 1; x += 2; return x;")).toEqual({ ok: true, value: 3 });
  });

  test('evaluate("let x = 0; x = 1; return x;") => Err', () => {
    const r = evaluate("let x = 0; x = 1; return x;");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("mutability");
      expect(r.error.position).toEqual({ line: 1, column: 12 });
      expect(r.error.snippet).toBe("let x = 0; x = 1; return x;");
    }
  });

  test('evaluate("let x = 1;") => 0 (no return)', () => {
    expect(evaluate("let x = 1;")).toEqual({ ok: true, value: 0 });
  });

  test('evaluate("let x = 100;") => 0', () => {
    expect(evaluate("let x = 100;")).toEqual({ ok: true, value: 0 });
  });

  test('evaluate("let x = 1; return y;") => Err (undefined variable)', () => {
    const r = evaluate("let x = 1; return y;");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("runtime");
      expect(r.error.message).toContain("y");
    }
  });

  test('evaluate("return 1 + 2 * 3;") => 7', () => {
    expect(evaluate("return 1 + 2 * 3;")).toEqual({ ok: true, value: 7 });
  });

  test('evaluate("return 10 / 2;") => 5', () => {
    expect(evaluate("return 10 / 2;")).toEqual({ ok: true, value: 5 });
  });

  test('evaluate("return 10 / 3;") => 3 (truncated)', () => {
    expect(evaluate("return 10 / 3;")).toEqual({ ok: true, value: 3 });
  });

  test('evaluate("let array = [1, 2, 3];") => 0', () => {
    expect(evaluate("let array = [1, 2, 3];")).toEqual({ ok: true, value: 0 });
  });

  test('evaluate("let array = [1, 2, 3]; return array[0] + array[1] + array[2];") => 6', () => {
    expect(evaluate("let array = [1, 2, 3]; return array[0] + array[1] + array[2];")).toEqual({
      ok: true,
      value: 6,
    });
  });
});

describe("evaluate: references", () => {
  test('evaluate("let x = 1; let y = &x; return *y;") => 1', () => {
    expect(evaluate("let x = 1; let y = &x; return *y;")).toEqual({ ok: true, value: 1 });
  });

  test('evaluate("let mut x = 0; let y = &mut x; *y = 1; return x;") => 1', () => {
    expect(evaluate("let mut x = 0; let y = &mut x; *y = 1; return x;")).toEqual({
      ok: true,
      value: 1,
    });
  });

  test('evaluate("let mut x = 0; let a = &mut x; let b = &mut a; *b = 1; return x;") => 1', () => {
    expect(evaluate("let mut x = 0; let a = &mut x; let b = &mut a; *b = 1; return x;")).toEqual({
      ok: true,
      value: 1,
    });
  });

  test('evaluate("let x = 5; let a = &x; let b = &a; return *b;") => 5', () => {
    expect(evaluate("let x = 5; let a = &x; let b = &a; return *b;")).toEqual({
      ok: true,
      value: 5,
    });
  });

  test('evaluate("let mut x = &mut x; *x = 1;") => Err (ref cycle)', () => {
    const r = evaluate("let mut x = &mut x; *x = 1;");
    expect(r.ok).toBe(false);
  });
});

describe("evaluate: dead code", () => {
  test('evaluate("if (false) { *y = 1; }") => Err (dead-code mutability)', () => {
    const r = evaluate("let x = 0; let y = &x; if (false) { *y = 1; }");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("mutability");
    }
  });

  test('evaluate("let mut x = 0; let y = &x; if (false) *y = 1; return x;") => Err', () => {
    const r = evaluate("let mut x = 0; let y = &x; if (false) *y = 1; return x;");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("mutability");
    }
  });

  test('evaluate("if (false) { if (1) {}}") => Err', () => {
    const r = evaluate("if (false) { if (1) {}}");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("semantic");
    }
  });

  test('evaluate("if (false) { let y = &(1 + 2); }") => Err', () => {
    const r = evaluate("if (false) { let y = &(1 + 2); }");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("semantic");
    }
  });

  test('evaluate("if (false) { let x = 1; let y = *x; }") => Err (dead-code deref of non-ref)', () => {
    const r = evaluate("if (false) { let x = 1; let y = *x; }");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("semantic");
    }
  });

  test('evaluate("if (false) { let y = undefinedIdentifier; }") => Err', () => {
    const r = evaluate("if (false) { let y = undefinedIdentifier; }");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("runtime");
      expect(r.error.message).toContain("undefinedIdentifier");
    }
  });

  test('evaluate("if (false) { return z; }") => Err (dead-code return of undefined)', () => {
    const r = evaluate("if (false) { return z; }");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("runtime");
      expect(r.error.message).toContain("z");
    }
  });

  test('evaluate("if (false) { let y = &z; }") => Err (dead-code ref to undefined)', () => {
    const r = evaluate("if (false) { let y = &z; }");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("runtime");
      expect(r.error.message).toContain("z");
    }
  });

  test('evaluate("if (1 < z) {}") => Err (undefined in condition operand)', () => {
    const r = evaluate("if (1 < z) {}");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("runtime");
      expect(r.error.message).toContain("z");
    }
  });

  test('evaluate("if (false) { return -x; }") => Err (undefined in unary operand)', () => {
    const r = evaluate("if (false) { return -x; }");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("runtime");
      expect(r.error.message).toContain("x");
    }
  });
});

describe("evaluate: values & shadowing", () => {
  test('evaluate("let x = true; return x;") => 1', () => {
    expect(evaluate("let x = true; return x;")).toEqual({ ok: true, value: 1 });
  });

  test('evaluate("let x = 0; let y = 1; return x < y;") => 1', () => {
    expect(evaluate("let x = 0; let y = 1; return x < y;")).toEqual({ ok: true, value: 1 });
  });

  test('evaluate("let x = 0; let x = 1; return x;") => 1', () => {
    expect(evaluate("let x = 0; let x = 1; return x;")).toEqual({ ok: true, value: 1 });
  });
});

describe("evaluate control flow", () => {
  test('evaluate("let mut x = 0; if (false) { x = 1; } else { x = 2; } return x;") => 2', () => {
    expect(evaluate("let mut x = 0; if (false) { x = 1; } else { x = 2; } return x;")).toEqual({
      ok: true,
      value: 2,
    });
  });

  test('evaluate("let mut x = 0; if (false) { x = 1; } return x;") => 0', () => {
    expect(evaluate("let mut x = 0; if (false) { x = 1; } return x;")).toEqual({
      ok: true,
      value: 0,
    });
  });

  test('evaluate("let mut x = 0; if (false) x = 1; else x = 2; return x;") => 2', () => {
    expect(evaluate("let mut x = 0; if (false) x = 1; else x = 2; return x;")).toEqual({
      ok: true,
      value: 2,
    });
  });

  test('evaluate("let mut x = 0; return 1; x = 2; return x;") => 1', () => {
    expect(evaluate("let mut x = 0; return 1; x = 2; return x;")).toEqual({
      ok: true,
      value: 1,
    });
  });

  test('evaluate("let mut x = 0; { return 5; x = 1; } return x;") => 5', () => {
    expect(evaluate("let mut x = 0; { return 5; x = 1; } return x;")).toEqual({
      ok: true,
      value: 5,
    });
  });

  test('evaluate("let mut x = 0; while (x < 4) { x += 1; } return x;") => 4', () => {
    expect(evaluate("let mut x = 0; while (x < 4) { x += 1; } return x;")).toEqual({
      ok: true,
      value: 4,
    });
  });
});

describe("evaluate errors", () => {
  test('evaluate("let x = 0; if (false) { let y = 1; y = 2; } return x;") => Err', () => {
    const r = evaluate("let x = 0; if (false) { let y = 1; y = 2; } return x;");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("mutability");
      expect(r.error.message).toContain("y");
    }
  });

  test('evaluate("let x = &1; return 0;") => Err (invalid reference target)', () => {
    const r = evaluate("let x = &1; return 0;");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("semantic");
    }
  });

  test('evaluate("let mut x = 0; { x = 1; } return x;") => 1', () => {
    expect(evaluate("let mut x = 0; { x = 1; } return x;")).toEqual({ ok: true, value: 1 });
  });

  test('evaluate("{ let x = 0; } return x;") => Err (block-scoped binding)', () => {
    const r = evaluate("{ let x = 0; } return x;");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("runtime");
      expect(r.error.message).toContain("x");
    }
  });

  test('evaluate("let x = 1; return *x;") => Err (deref of non-reference)', () => {
    const r = evaluate("let x = 1; return *x;");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("semantic");
    }
  });

  test('evaluate("let x = 1; *x = 2; return x;") => Err (assign through non-reference)', () => {
    const r = evaluate("let x = 1; *x = 2; return x;");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("semantic");
    }
  });

  test('evaluate("let x = 1; let y = &x; return y;") => Err (return a reference)', () => {
    const r = evaluate("let x = 1; let y = &x; return y;");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("semantic");
    }
  });

  test('evaluate("while(1) {}") => Err (non-boolean condition)', () => {
    const r = evaluate("while(1) {}");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("semantic");
      expect(r.error.message).toContain("boolean");
    }
  });

  test('evaluate("let array = [1, 2, 3]; return array[3];") => Err (index out of range)', () => {
    const r = evaluate("let array = [1, 2, 3]; return array[3];");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("runtime");
      expect(r.error.message).toContain("out of range");
    }
  });

  test('evaluate("let mut x = 0; x = y;") => Err (undefined variable in assignment value)', () => {
    const r = evaluate("let mut x = 0; x = y;");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("runtime");
      expect(r.error.message).toContain("y");
    }
  });

  test('evaluate("return 1 / 0;") => Err (division by zero)', () => {
    const r = evaluate("return 1 / 0;");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("runtime");
      expect(r.error.message).toContain("zero");
    }
  });

  test('evaluate("return 1 % 0;") => Err (modulo by zero)', () => {
    const r = evaluate("return 1 % 0;");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("runtime");
      expect(r.error.message).toContain("zero");
    }
  });

  test('evaluate("if (false) { let x = 10 / 0; }") => Err (division by zero in dead code)', () => {
    const r = evaluate("if (false) { let x = 10 / 0; }");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("runtime");
      expect(r.error.message).toContain("zero");
    }
  });
});
