import { expect, test } from "bun:test";
import { evaluateTuff } from "./index.ts";
import { expectImmutableAssignment } from "./test-helpers.ts";

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

test('evaluateTuff("let tuple = (3, 4); return tuple.0 + tuple.1;") => 7', () => {
  expect(evaluateTuff("let tuple = (3, 4); return tuple.0 + tuple.1;")).toEqual(
    {
      ok: true,
      value: 7,
    },
  );
});

test('evaluateTuff("let x : (U8, U8) = (3, 4); return x.0 + x.1;") => 7', () => {
  expect(evaluateTuff("let x : (U8, U8) = (3, 4); return x.0 + x.1;")).toEqual({
    ok: true,
    value: 7,
  });
});

test('evaluateTuff("let tuple = (1, 2); let other = tuple; return other.1;") => 2', () => {
  expect(
    evaluateTuff("let tuple = (1, 2); let other = tuple; return other.1;"),
  ).toEqual({
    ok: true,
    value: 2,
  });
});

test('evaluateTuff("let tuple = (1, 2, 3); return tuple.2;") => 3', () => {
  expect(evaluateTuff("let tuple = (1, 2, 3); return tuple.2;")).toEqual({
    ok: true,
    value: 3,
  });
});

test('evaluateTuff("let tuple = (1, 2); return tuple.0 + tuple.1;") => 3', () => {
  expect(evaluateTuff("let tuple = (1, 2); return tuple.0 + tuple.1;")).toEqual(
    {
      ok: true,
      value: 3,
    },
  );
});

test('evaluateTuff("let tuple = (1, 2); return tuple.0;") => 1', () => {
  expect(evaluateTuff("let tuple = (1, 2); return tuple.0;")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("let tuple = (1, 2); return tuple.1;") => 2', () => {
  expect(evaluateTuff("let tuple = (1, 2); return tuple.1;")).toEqual({
    ok: true,
    value: 2,
  });
});

test('evaluateTuff("let array = [1, 2, 3]; return array[0] + array[1] + array[2];") => 6', () => {
  expect(
    evaluateTuff(
      "let array = [1, 2, 3]; return array[0] + array[1] + array[2];",
    ),
  ).toEqual({
    ok: true,
    value: 6,
  });
});

test('evaluateTuff("let array = [1, 2]; return array[true];") => Err', () => {
  const result = evaluateTuff("let array = [1, 2]; return array[true];");
  expect(result).toEqual({
    ok: false,
    error: { kind: "TypeMismatch", name: "array", line: 2 },
  });
});

test('evaluateTuff("let mut array = [0]; array[0] = 1; return array[0];") => 1', () => {
  expect(
    evaluateTuff("let mut array = [0]; array[0] = 1; return array[0];"),
  ).toEqual({
    ok: true,
    value: 1,
  });
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
