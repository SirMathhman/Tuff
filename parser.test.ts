import { describe, expect, test } from "bun:test";
import { tokenize } from "./lexer.ts";
import { parse, type ParserState } from "./parser.ts";
import type { AstNode, Result } from "./types.ts";

function parseInput(
  input: string,
): Result<AstNode, import("./types.ts").EvalError> {
  const state: ParserState = {
    tokens: tokenize(input),
    pos: 0,
    inputLength: input.trimEnd().length,
  };
  return parse(state);
}

describe("parse", () => {
  test('parse("1") => num node', () => {
    expect(parseInput("1")).toEqual({
      ok: true,
      value: { kind: "num", value: 1, index: 0 },
    });
  });

  test('parse("1 + 2") => binary node', () => {
    expect(parseInput("1 + 2")).toEqual({
      ok: true,
      value: {
        kind: "binary",
        op: "+",
        left: { kind: "num", value: 1, index: 0 },
        right: { kind: "num", value: 2, index: 4 },
        index: 2,
      },
    });
  });

  test('parse("1 + 2 * 3") => multiplication binds tighter', () => {
    expect(parseInput("1 + 2 * 3")).toEqual({
      ok: true,
      value: {
        kind: "binary",
        op: "+",
        left: { kind: "num", value: 1, index: 0 },
        right: {
          kind: "binary",
          op: "*",
          left: { kind: "num", value: 2, index: 4 },
          right: { kind: "num", value: 3, index: 8 },
          index: 6,
        },
        index: 2,
      },
    });
  });

  test('parse("-1") => neg node', () => {
    expect(parseInput("-1")).toEqual({
      ok: true,
      value: {
        kind: "neg",
        operand: { kind: "num", value: 1, index: 1 },
        index: 0,
      },
    });
  });

  test('parse("let x = 1; x") => let node', () => {
    expect(parseInput("let x = 1; x")).toEqual({
      ok: true,
      value: {
        kind: "let",
        name: "x",
        mut: false,
        value: { kind: "num", value: 1, index: 8 },
        body: { kind: "var", name: "x", index: 11 },
        index: 0,
      },
    });
  });

  test('parse("let mut x = 0; x = 1; x") => let + assign nodes', () => {
    expect(parseInput("let mut x = 0; x = 1; x")).toEqual({
      ok: true,
      value: {
        kind: "let",
        name: "x",
        mut: true,
        value: { kind: "num", value: 0, index: 12 },
        body: {
          kind: "assign",
          name: "x",
          value: { kind: "num", value: 1, index: 19 },
          body: { kind: "var", name: "x", index: 22 },
          index: 15,
        },
        index: 0,
      },
    });
  });

  test('parse("{ 1 }") => block node', () => {
    expect(parseInput("{ 1 }")).toEqual({
      ok: true,
      value: {
        kind: "block",
        body: { kind: "num", value: 1, index: 2 },
        index: 0,
      },
    });
  });

  test('parse("1 +") => unexpected-end error', () => {
    expect(parseInput("1 +")).toEqual({
      ok: false,
      error: { kind: "unexpected-end", index: 3 },
    });
  });

  test('parse("(1") => unbalanced-paren error', () => {
    expect(parseInput("(1")).toEqual({
      ok: false,
      error: { kind: "unbalanced-paren", index: 0 },
    });
  });

  test('parse("1 @") => invalid-token error', () => {
    expect(parseInput("1 @")).toEqual({
      ok: false,
      error: { kind: "invalid-token", index: 2, token: "@" },
    });
  });
});
