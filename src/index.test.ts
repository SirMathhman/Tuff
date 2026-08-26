import { expect, test } from "bun:test";
import { evaluateTuff, type TuffResult } from "./index.ts";

/**
 * Assert that a result is an UnidentifiedIdentifier error.
 * @param result - The result to assert on.
 * @param name - The expected identifier name.
 * @param line - The expected line number.
 */
function expectUnidentifiedIdentifier(
  result: TuffResult,
  name: string,
  line: number,
) {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toEqual({
      kind: "UnidentifiedIdentifier",
      name,
      line,
    });
  }
}

/**
 * Assert that a result is an ImmutableAssignment error.
 * @param result - The result to assert on.
 * @param name - The expected variable name.
 * @param line - The expected line number.
 */
function expectImmutableAssignment(
  result: TuffResult,
  name: string,
  line: number,
) {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toEqual({
      kind: "ImmutableAssignment",
      name,
      line,
    });
  }
}

test('evaluateTuff("") => 0', () => {
  expect(evaluateTuff("")).toEqual({ ok: true, value: 0 });
});

test('evaluateTuff("return 1;") => 1', () => {
  expect(evaluateTuff("return 1;")).toEqual({ ok: true, value: 1 });
});

test('evaluateTuff("let x = 1; return x;") => 1', () => {
  expect(evaluateTuff("let x = 1; return x;")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("let x = 1; let y = x; return y;") => 1', () => {
  expect(evaluateTuff("let x = 1; let y = x; return y;")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("let x = 1; let y = 2; return y;") => 2', () => {
  expect(evaluateTuff("let x = 1; let y = 2; return y;")).toEqual({
    ok: true,
    value: 2,
  });
});

test('evaluateTuff("return unidentifiedIdentifier;") => Err', () => {
  expectUnidentifiedIdentifier(
    evaluateTuff("return unidentifiedIdentifier;"),
    "unidentifiedIdentifier",
    1,
  );
});

test('evaluateTuff("let x = missing; return x;") => Err', () => {
  expectUnidentifiedIdentifier(
    evaluateTuff("let x = missing; return x;"),
    "missing",
    1,
  );
});

test('evaluateTuff("let x = 100;") => 0', () => {
  expect(evaluateTuff("let x = 100;")).toEqual({ ok: true, value: 0 });
});

test('evaluateTuff("let mut x = 0; x = 1; return x;") => 1', () => {
  expect(evaluateTuff("let mut x = 0; x = 1; return x;")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("let x = unidentifiedIdentifier;") => Err', () => {
  expectUnidentifiedIdentifier(
    evaluateTuff("let x = unidentifiedIdentifier;"),
    "unidentifiedIdentifier",
    1,
  );
});

test('evaluateTuff("let x = 0; x = 1; return x;") => Err', () => {
  expectImmutableAssignment(
    evaluateTuff("let x = 0; x = 1; return x;"),
    "x",
    2,
  );
});

test('evaluateTuff("let mut x = 0; x = true; return x;") => Err', () => {
  const result = evaluateTuff("let mut x = 0; x = true; return x;");
  expect(result).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "x", line: 2 },
  });
});

test('evaluateTuff("unidentifiedIdentifier = 1;") => Err', () => {
  expectUnidentifiedIdentifier(
    evaluateTuff("unidentifiedIdentifier = 1;"),
    "unidentifiedIdentifier",
    1,
  );
});

test('evaluateTuff("let mut x = 0; { x = 1; } return x;") => 1', () => {
  expect(evaluateTuff("let mut x = 0; { x = 1; } return x;")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("{ return 1; }") => 1', () => {
  expect(evaluateTuff("{ return 1; }")).toEqual({ ok: true, value: 1 });
});

test('evaluateTuff("let mut x = 0; { { x = 1; } } return x;") => 1', () => {
  expect(evaluateTuff("let mut x = 0; { { x = 1; } } return x;")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("{ missing = 1; }") => Err', () => {
  expectUnidentifiedIdentifier(evaluateTuff("{ missing = 1; }"), "missing", 1);
});

test('evaluateTuff("{ let x = 0; } return x;") => Err', () => {
  expectUnidentifiedIdentifier(
    evaluateTuff("{ let x = 0; } return x;"),
    "x",
    2,
  );
});

test('evaluateTuff("let x = 1; { let x = 2; } return x;") => 1', () => {
  expect(evaluateTuff("let x = 1; { let x = 2; } return x;")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("let x = 1; { let x = 0; } return x;") => 1', () => {
  expect(evaluateTuff("let x = 1; { let x = 0; } return x;")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("let x = true; return x;") => 1', () => {
  expect(evaluateTuff("let x = true; return x;")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("let x = true; let y = false; return x || y;") => 1', () => {
  expect(evaluateTuff("let x = true; let y = false; return x || y;")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("let x = true; let y = false; return x && y;") => 0', () => {
  expect(evaluateTuff("let x = true; let y = false; return x && y;")).toEqual({
    ok: true,
    value: 0,
  });
});

test('evaluateTuff("return true || (true && false);") => 1', () => {
  expect(evaluateTuff("return true || (true && false);")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("return false && (true || false);") => 0', () => {
  expect(evaluateTuff("return false && (true || false);")).toEqual({
    ok: true,
    value: 0,
  });
});

test('evaluateTuff("return 1 + 2;") => 3', () => {
  expect(evaluateTuff("return 1 + 2;")).toEqual({
    ok: true,
    value: 3,
  });
});

test('evaluateTuff("let x = 1; let y = 2; return x == y;") => 0', () => {
  expect(evaluateTuff("let x = 1; let y = 2; return x == y;")).toEqual({
    ok: true,
    value: 0,
  });
});

test('evaluateTuff("let x = 1; let y = 2; return x < y;") => 1', () => {
  expect(evaluateTuff("let x = 1; let y = 2; return x < y;")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("return true == 1;") => 0', () => {
  expect(evaluateTuff("return true == 1;")).toEqual({
    ok: true,
    value: 0,
  });
});

test('evaluateTuff("let mut x = 0; if (false) { x = 1; } else { x = 2; } return x;") => 2', () => {
  expect(
    evaluateTuff(
      "let mut x = 0; if (false) { x = 1; } else { x = 2; } return x;",
    ),
  ).toEqual({
    ok: true,
    value: 2,
  });
});

test('evaluateTuff("let mut x = 0; if (false) x = 1; else x = 2; return x;") => 2', () => {
  expect(
    evaluateTuff("let mut x = 0; if (false) x = 1; else x = 2; return x;"),
  ).toEqual({
    ok: true,
    value: 2,
  });
});

test('evaluateTuff("let mut x = 0; if (false) x = 1; return x;") => 0', () => {
  expect(
    evaluateTuff("let mut x = 0; if (false) x = 1; return x;"),
  ).toEqual({
    ok: true,
    value: 0,
  });
});

test('evaluateTuff("let x = 1; x;") => Err', () => {
  const result = evaluateTuff("let x = 1; x;");
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toEqual({
      kind: "InvalidStatement",
      token: "Semicolon",
      line: 2,
    });
  }
});

test('evaluateTuff("return 1; 2;") => Err', () => {
  const result = evaluateTuff("return 1; 2;");
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toEqual({
      kind: "InvalidStatement",
      token: "2",
      line: 2,
    });
  }
});

test('evaluateTuff("let x = 1;\nlet y = @") => Err', () => {
  const result = evaluateTuff("let x = 1;\nlet y = @");
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toEqual({
      kind: "UnexpectedCharacter",
      character: "@",
      line: 2,
    });
  }
});

test('evaluateTuff("let x = 1; let y = &x; return *y;") => 1', () => {
  expect(evaluateTuff("let x = 1; let y = &x; return *y;")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("let mut x = 0; let y = &mut x; *y = 1; return x;") => 1', () => {
  expect(
    evaluateTuff("let mut x = 0; let y = &mut x; *y = 1; return x;"),
  ).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("let x = 1; let y = &mut x; *y = 5; return x;") => Err', () => {
  expectImmutableAssignment(
    evaluateTuff("let x = 1; let y = &mut x; *y = 5; return x;"),
    "x",
    2,
  );
});

test('evaluateTuff("let x = 0; let y = &mut x; *y = 1; return x;") => Err', () => {
  expectImmutableAssignment(
    evaluateTuff("let x = 0; let y = &mut x; *y = 1; return x;"),
    "x",
    2,
  );
});
