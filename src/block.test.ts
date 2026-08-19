import { evaluate } from "./index.js";
import { parse } from "./parser/index.js";
import { tokenize } from "./core/lexer.js";

test('evaluate returns 100 for "let x = { let y = 100; y }; x"', () => {
  expect(evaluate("let x = { let y = 100; y }; x")).toEqual({ ok: true, value: 100 });
});

test('evaluate returns 1 for "let a = { let y = [1]; y }; return a[0];"', () => {
  expect(evaluate("let a = { let y = [1]; y }; return a[0];")).toEqual({ ok: true, value: 1 });
});

test("evaluate returns an UnexpectedStatement error for a block value not ending in an expression", () => {
  expect(evaluate("let x = { let y = 100; }; x")).toEqual({
    ok: false,
    error: { kind: "UnexpectedStatement", statement: "{ ... }", position: 8 },
  });
});

test("evaluate returns a TypeMismatch error when a block value yielding an array is the program result", () => {
  expect(evaluate("let x = { let y = [1]; y }; x")).toEqual({
    ok: false,
    error: {
      kind: "TypeMismatch",
      name: "return",
      expected: "number",
      actual: "array<number>",
      position: 28,
    },
  });
});

test("evaluate returns an UnknownIdentifier error for an undeclared identifier in a block value", () => {
  expect(evaluate("let x = { z }; x")).toEqual({
    ok: false,
    error: { kind: "UnknownIdentifier", name: "z", position: 10 },
  });
});

test("evaluate returns a ReturnInBlockValue error for a return inside a block value", () => {
  expect(evaluate("let x = { return 1; 2 }; x")).toEqual({
    ok: false,
    error: { kind: "ReturnInBlockValue", position: 10 },
  });
});

test("evaluate returns a ReturnInBlockValue error for a return nested in an if inside a block value", () => {
  expect(evaluate("let x = { if (true) { return 1; } 2 }; x")).toEqual({
    ok: false,
    error: { kind: "ReturnInBlockValue", position: 22 },
  });
});

test("parse parses a block value as a ValueBlock inside a let initializer", () => {
  const tokens = tokenize("let x = { let y = 100; y }; x");
  expect(tokens.ok).toBe(true);
  if (!tokens.ok) {
    return;
  }
  expect(parse(tokens.value, "let x = { let y = 100; y }; x")).toEqual({
    ok: true,
    value: {
      statements: [
        {
          kind: "let",
          name: "x",
          mutable: false,
          value: {
            kind: "block",
            statements: [
              {
                kind: "let",
                name: "y",
                mutable: false,
                value: { kind: "number", value: 100, position: 18 },
                position: 10,
              },
              { kind: "expr", value: { kind: "ident", name: "y", position: 23 }, position: 23 },
            ],
            position: 8,
          },
          position: 0,
        },
        { kind: "expr", value: { kind: "ident", name: "x", position: 28 }, position: 28 },
      ],
    },
  });
});
