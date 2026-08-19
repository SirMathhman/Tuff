import { parse } from "./parser.js";
import { tokenize } from "./lexer.js";

/** Tokenize then parse, returning the parse result directly. */
function parseSource(source: string) {
  const tokens = tokenize(source);
  if (!tokens.ok) {
    return tokens;
  }
  return parse(tokens.value, source);
}

test("parse parses a let declaration with a number literal", () => {
  expect(parseSource("let x = 1;")).toEqual({
    ok: true,
    value: {
      statements: [
        {
          kind: "let",
          name: "x",
          mutable: false,
          value: { kind: "number", value: 1, position: 8 },
          position: 0,
        },
      ],
    },
  });
});

test("parse parses a mutable let declaration with a bool literal", () => {
  expect(parseSource("let mut x = true;")).toEqual({
    ok: true,
    value: {
      statements: [
        {
          kind: "let",
          name: "x",
          mutable: true,
          value: { kind: "bool", value: true, position: 12 },
          position: 0,
        },
      ],
    },
  });
});

test("parse parses an assignment statement", () => {
  expect(parseSource("x = 2;")).toEqual({
    ok: true,
    value: {
      statements: [
        {
          kind: "assign",
          name: "x",
          value: { kind: "number", value: 2, position: 4 },
          position: 0,
        },
      ],
    },
  });
});

test("parse parses a return statement with an identifier", () => {
  expect(parseSource("return x;")).toEqual({
    ok: true,
    value: {
      statements: [
        { kind: "return", value: { kind: "ident", name: "x", position: 7 }, position: 0 },
      ],
    },
  });
});

test("parse parses a binary == expression", () => {
  expect(parseSource("return x == y;")).toEqual({
    ok: true,
    value: {
      statements: [
        {
          kind: "return",
          value: {
            kind: "binary",
            operator: "==",
            left: { kind: "ident", name: "x", position: 7 },
            right: { kind: "ident", name: "y", position: 12 },
            position: 7,
          },
          position: 0,
        },
      ],
    },
  });
});

test("parse parses a block as a block statement", () => {
  expect(parseSource("{ x = 1; }")).toEqual({
    ok: true,
    value: {
      statements: [
        {
          kind: "block",
          statements: [
            {
              kind: "assign",
              name: "x",
              value: { kind: "number", value: 1, position: 6 },
              position: 2,
            },
          ],
          position: 0,
        },
      ],
    },
  });
});

test("parse returns an EmptyProgram error for empty input", () => {
  expect(parseSource("")).toEqual({ ok: false, error: { kind: "EmptyProgram" } });
});

test("parse returns an UnexpectedStatement error for unrecognized input", () => {
  expect(parseSource("garbage")).toEqual({
    ok: false,
    error: { kind: "UnexpectedStatement", statement: "garbage", position: 0 },
  });
});

test("parse returns an UnexpectedStatement error for a stray closing brace", () => {
  expect(parseSource("}")).toEqual({
    ok: false,
    error: { kind: "UnexpectedStatement", statement: "}", position: 0 },
  });
});
