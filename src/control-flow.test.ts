import { expect, test } from "bun:test";
import { evaluateTuff } from "./index.ts";
import { expectUnidentifiedIdentifier } from "./test-helpers.ts";

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

test('evaluateTuff("let mut x = 0; while (x < 4) { x += 1; } return x;") => 4', () => {
  expect(
    evaluateTuff("let mut x = 0; while (x < 4) { x += 1; } return x;"),
  ).toEqual({
    ok: true,
    value: 4,
  });
});

test('evaluateTuff("let mut x = 0; while (x < 4) { x += 1; break; } return x;") => 1', () => {
  expect(
    evaluateTuff("let mut x = 0; while (x < 4) { x += 1; break; } return x;"),
  ).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("let mut x = 0; while (x < 4) { x += 1; continue; } return x;") => 4', () => {
  expect(
    evaluateTuff(
      "let mut x = 0; while (x < 4) { x += 1; continue; } return x;",
    ),
  ).toEqual({
    ok: true,
    value: 4,
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

test('evaluateTuff("if (false) { let mut x = 0; x = true; }") => Err', () => {
  expect(evaluateTuff("if (false) { let mut x = 0; x = true; }")).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "x", line: 2 },
  });
});

test('evaluateTuff("if (true) let mut x = 0; x = true;") => Err', () => {
  expect(evaluateTuff("if (true) let mut x = 0; x = true;")).toEqual({
    ok: false,
    error: { kind: "UnidentifiedIdentifier", name: "x", line: 2 },
  });
});

test('evaluateTuff("if (false) { let x = 0; x = 1; }") => Err', () => {
  expect(evaluateTuff("if (false) { let x = 0; x = 1; }")).toEqual({
    ok: false,
    error: { kind: "ImmutableAssignment", name: "x", line: 2 },
  });
});

test('evaluateTuff("if (false) { x = 1; }") => Err', () => {
  expect(evaluateTuff("if (false) { x = 1; }")).toEqual({
    ok: false,
    error: { kind: "UnidentifiedIdentifier", name: "x", line: 1 },
  });
});

test('evaluateTuff("if (false) { let y = x + 1; }") => Err', () => {
  expect(evaluateTuff("if (false) { let y = x + 1; }")).toEqual({
    ok: false,
    error: { kind: "UnidentifiedIdentifier", name: "x", line: 1 },
  });
});

test('evaluateTuff("if (false) { let x = 0; let y = &mut x; }") => Err', () => {
  expect(evaluateTuff("if (false) { let x = 0; let y = &mut x; }")).toEqual({
    ok: false,
    error: { kind: "ImmutableAssignment", name: "x", line: 2 },
  });
});

test('evaluateTuff("if (false) { let x = &(1); }") => Err', () => {
  expect(evaluateTuff("if (false) { let x = &(1); }")).toEqual({
    ok: false,
    error: { kind: "InvalidReference", name: "", line: 1 },
  });
});

test('evaluateTuff("if (false) { let mut x = 0; x = y; }") => Err', () => {
  expect(evaluateTuff("if (false) { let mut x = 0; x = y; }")).toEqual({
    ok: false,
    error: { kind: "UnidentifiedIdentifier", name: "y", line: 2 },
  });
});

test('evaluateTuff("if (false) { return y; }") => Err', () => {
  expect(evaluateTuff("if (false) { return y; }")).toEqual({
    ok: false,
    error: { kind: "UnidentifiedIdentifier", name: "y", line: 1 },
  });
});

test('evaluateTuff("if (y) { }") => Err', () => {
  expect(evaluateTuff("if (y) { }")).toEqual({
    ok: false,
    error: { kind: "UnidentifiedIdentifier", name: "y", line: 1 },
  });
});

test('evaluateTuff("if (false) { *y = 1; }") => Err', () => {
  expect(evaluateTuff("if (false) { *y = 1; }")).toEqual({
    ok: false,
    error: { kind: "UnidentifiedIdentifier", name: "y", line: 1 },
  });
});

test('evaluateTuff("if (false) { let x = 1; let z = *x; }") => Err', () => {
  expect(evaluateTuff("if (false) { let x = 1; let z = *x; }")).toEqual({
    ok: false,
    error: { kind: "InvalidDeref", name: "x", line: 2 },
  });
});

test('evaluateTuff("if (false) { let x = 1; let y = &x; let z = *y; }") => Ok', () => {
  expect(
    evaluateTuff("if (false) { let x = 1; let y = &x; let z = *y; }"),
  ).toEqual({
    ok: true,
    value: 0,
  });
});

test('evaluateTuff("if (false) { let mut x = 1 + 1; x = true; }") => Err', () => {
  expect(evaluateTuff("if (false) { let mut x = 1 + 1; x = true; }")).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "x", line: 2 },
  });
});

test('evaluateTuff("if (false) { let x = 1; let mut y = x; y = true; }") => Err', () => {
  expect(
    evaluateTuff("if (false) { let x = 1; let mut y = x; y = true; }"),
  ).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "y", line: 3 },
  });
});

test('evaluateTuff("if (false) { let x = 0; let y = &x; *y = 1; }") => Err', () => {
  expect(evaluateTuff("if (false) { let x = 0; let y = &x; *y = 1; }")).toEqual(
    {
      ok: false,
      error: { kind: "ImmutableAssignment", name: "x", line: 3 },
    },
  );
});

test('evaluateTuff("if (false) { let mut x = 0; let y = &mut x; *y = true; }") => Err', () => {
  expect(
    evaluateTuff("if (false) { let mut x = 0; let y = &mut x; *y = true; }"),
  ).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "x", line: 3 },
  });
});

test('evaluateTuff("let mut x = 0; if (false) x = 1; return x;") => 0', () => {
  expect(evaluateTuff("let mut x = 0; if (false) x = 1; return x;")).toEqual({
    ok: true,
    value: 0,
  });
});
