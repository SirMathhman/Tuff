import { expect, test } from "bun:test";
import { evaluateTuff, type TuffResult } from "./index.ts";

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
  const result = evaluateTuff("let x = 0; x = 1; return x;");
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toEqual({
      kind: "ImmutableAssignment",
      name: "x",
      line: 2,
    });
  }
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
