import { expect, test } from "bun:test";
import { evaluateTuff } from "./index.ts";
import {
  expectImmutableAssignment,
  expectUnidentifiedIdentifier,
} from "./test-helpers.ts";

test('evaluateTuff("") => 0', () => {
  expect(evaluateTuff("")).toEqual({ ok: true, value: 0 });
});

test('evaluateTuff("return 1;") => 1', () => {
  expect(evaluateTuff("return 1;")).toEqual({ ok: true, value: 1 });
});

test('evaluateTuff("return 100U8;") => 100', () => {
  expect(evaluateTuff("return 100U8;")).toEqual({ ok: true, value: 100 });
});

test('evaluateTuff("return 100FOO;") => Err', () => {
  expect(evaluateTuff("return 100FOO;")).toEqual({
    ok: false,
    error: { kind: "InvalidNumberSuffix", suffix: "FOO", line: 1 },
  });
});

test('evaluateTuff("return 100u8;") => Err', () => {
  expect(evaluateTuff("return 100u8;")).toEqual({
    ok: false,
    error: { kind: "InvalidNumberSuffix", suffix: "u8", line: 1 },
  });
});

test('evaluateTuff("return 256U8;") => Err', () => {
  expect(evaluateTuff("return 256U8;")).toEqual({
    ok: false,
    error: { kind: "NumberOutOfRange", value: 256, suffix: "U8", line: 1 },
  });
});

test('evaluateTuff("return 100U9;") => Err', () => {
  expect(evaluateTuff("return 100U9;")).toEqual({
    ok: false,
    error: { kind: "InvalidNumberSuffix", suffix: "U9", line: 1 },
  });
});

test('evaluateTuff("return -1U8;") => Err', () => {
  expect(evaluateTuff("return -1U8;")).toEqual({
    ok: false,
    error: { kind: "NumberOutOfRange", value: -1, suffix: "U8", line: 1 },
  });
});

test('evaluateTuff("return 100U8 is U8;") => 1', () => {
  expect(evaluateTuff("return 100U8 is U8;")).toEqual({ ok: true, value: 1 });
});

test('evaluateTuff("return 100U8 is U16;") => 0', () => {
  expect(evaluateTuff("return 100U8 is U16;")).toEqual({ ok: true, value: 0 });
});

test('evaluateTuff("return 100 is U8;") => 0', () => {
  expect(evaluateTuff("return 100 is U8;")).toEqual({ ok: true, value: 0 });
});

test('evaluateTuff("return 1 + 2 is U8;") => 1', () => {
  expect(evaluateTuff("return 1 + 2 is U8;")).toEqual({ ok: true, value: 1 });
});

test('evaluateTuff("return (100U8 is U8) is Bool;") => 1', () => {
  expect(evaluateTuff("return (100U8 is U8) is Bool;")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("return (true == true) is Bool;") => 1', () => {
  expect(evaluateTuff("return (true == true) is Bool;")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("return 100U8 is Bool;") => 0', () => {
  expect(evaluateTuff("return 100U8 is Bool;")).toEqual({
    ok: true,
    value: 0,
  });
});

test('evaluateTuff("return (true || false) is Bool;") => 1', () => {
  expect(evaluateTuff("return (true || false) is Bool;")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("return (true && false) is Bool;") => 1', () => {
  expect(evaluateTuff("return (true && false) is Bool;")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("let x = 100U8; return x is U8;") => 1', () => {
  expect(evaluateTuff("let x = 100U8; return x is U8;")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("let x = 0U8; let y = &x; return *y is U8;") => 1', () => {
  expect(evaluateTuff("let x = 0U8; let y = &x; return *y is U8;")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("return (3U8, 4U8) is (U8, U8);") => 1', () => {
  expect(evaluateTuff("return (3U8, 4U8) is (U8, U8);")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("return (1U8 + 2U8) is U8;") => 1', () => {
  expect(evaluateTuff("return (1U8 + 2U8) is U8;")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("return (1U8 + 255U8) is U8;") => 0', () => {
  expect(evaluateTuff("return (1U8 + 255U8) is U8;")).toEqual({
    ok: true,
    value: 0,
  });
});

test('evaluateTuff("return (1U8 == 2U8) is Bool;") => 1', () => {
  expect(evaluateTuff("return (1U8 == 2U8) is Bool;")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("return (1U8 < 2U8) is Bool;") => 1', () => {
  expect(evaluateTuff("return (1U8 < 2U8) is Bool;")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("let x = 10U16; return &x is &U16;") => 1', () => {
  expect(evaluateTuff("let x = 10U16; return &x is &U16;")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("let mut x = 10U16; return &mut x is &mut U16;") => 1', () => {
  expect(evaluateTuff("let mut x = 10U16; return &mut x is &mut U16;")).toEqual(
    {
      ok: true,
      value: 1,
    },
  );
});

test('evaluateTuff("let x = 10U16; return &x is &mut U16;") => 0', () => {
  expect(evaluateTuff("let x = 10U16; return &x is &mut U16;")).toEqual({
    ok: true,
    value: 0,
  });
});

test('evaluateTuff("let mut x = 10U16; return &mut x is &U16;") => 1', () => {
  expect(evaluateTuff("let mut x = 10U16; return &mut x is &U16;")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("let x = 0U8; let y = &x; return &y is &&U8;") => 1', () => {
  expect(evaluateTuff("let x = 0U8; let y = &x; return &y is &&U8;")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("let x = 0U8; let y = &x; return &y is && U8;") => 1', () => {
  expect(evaluateTuff("let x = 0U8; let y = &x; return &y is && U8;")).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("let x = 0U8; let y = &x; let z = &y; return &z is &&&U8;") => 1', () => {
  expect(
    evaluateTuff("let x = 0U8; let y = &x; let z = &y; return &z is &&&U8;"),
  ).toEqual({
    ok: true,
    value: 1,
  });
});

test('evaluateTuff("let a = true; let b = false; return a&&b;") => 0', () => {
  expect(evaluateTuff("let a = true; let b = false; return a&&b;")).toEqual({
    ok: true,
    value: 0,
  });
});

test('evaluateTuff("let x = 1; let y = true; return (&x) && y;") => 1', () => {
  expect(evaluateTuff("let x = 1; let y = true; return (&x) && y;")).toEqual({
    ok: true,
    value: 1,
  });
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

test('evaluateTuff("let mut x = 1; x += 2; return x;") => 3', () => {
  expect(evaluateTuff("let mut x = 1; x += 2; return x;")).toEqual({
    ok: true,
    value: 3,
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

test('evaluateTuff("let x = true; return x;") => 1', () => {
  expect(evaluateTuff("let x = true; return x;")).toEqual({
    ok: true,
    value: 1,
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
