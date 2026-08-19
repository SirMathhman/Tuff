import { tokenize } from "./lexer.js";

test("tokenize tokenizes a full program", () => {
  expect(tokenize("let mut x = 0; { x = 1; } return x;")).toEqual({
    ok: true,
    value: [
      { kind: "let", position: 0 },
      { kind: "mut", position: 4 },
      { kind: "ident", value: "x", position: 8 },
      { kind: "assign", position: 10 },
      { kind: "number", value: 0, position: 12 },
      { kind: "semicolon", position: 13 },
      { kind: "lbrace", position: 15 },
      { kind: "ident", value: "x", position: 17 },
      { kind: "assign", position: 19 },
      { kind: "number", value: 1, position: 21 },
      { kind: "semicolon", position: 22 },
      { kind: "rbrace", position: 24 },
      { kind: "return", position: 26 },
      { kind: "ident", value: "x", position: 33 },
      { kind: "semicolon", position: 34 },
    ],
  });
});

test("tokenize tokenizes boolean literals", () => {
  expect(tokenize("let x = true;")).toEqual({
    ok: true,
    value: [
      { kind: "let", position: 0 },
      { kind: "ident", value: "x", position: 4 },
      { kind: "assign", position: 6 },
      { kind: "bool", value: true, position: 8 },
      { kind: "semicolon", position: 12 },
    ],
  });
});

test("tokenize tokenizes negative and decimal numbers", () => {
  expect(tokenize("-1.5")).toEqual({
    ok: true,
    value: [{ kind: "number", value: -1.5, position: 0 }],
  });
});

test("tokenize tokenizes the == operator", () => {
  expect(tokenize("x == y")).toEqual({
    ok: true,
    value: [
      { kind: "ident", value: "x", position: 0 },
      { kind: "binary", operator: "==", position: 2 },
      { kind: "ident", value: "y", position: 5 },
    ],
  });
});

test("tokenize tokenizes the < operator", () => {
  expect(tokenize("x < y")).toEqual({
    ok: true,
    value: [
      { kind: "ident", value: "x", position: 0 },
      { kind: "binary", operator: "<", position: 2 },
      { kind: "ident", value: "y", position: 4 },
    ],
  });
});

test("tokenize tokenizes the <=, >, >=, and != operators", () => {
  expect(tokenize("x <= y")).toEqual({
    ok: true,
    value: [
      { kind: "ident", value: "x", position: 0 },
      { kind: "binary", operator: "<=", position: 2 },
      { kind: "ident", value: "y", position: 5 },
    ],
  });
  expect(tokenize("x > y")).toEqual({
    ok: true,
    value: [
      { kind: "ident", value: "x", position: 0 },
      { kind: "binary", operator: ">", position: 2 },
      { kind: "ident", value: "y", position: 4 },
    ],
  });
  expect(tokenize("x >= y")).toEqual({
    ok: true,
    value: [
      { kind: "ident", value: "x", position: 0 },
      { kind: "binary", operator: ">=", position: 2 },
      { kind: "ident", value: "y", position: 5 },
    ],
  });
  expect(tokenize("x != y")).toEqual({
    ok: true,
    value: [
      { kind: "ident", value: "x", position: 0 },
      { kind: "binary", operator: "!=", position: 2 },
      { kind: "ident", value: "y", position: 5 },
    ],
  });
});

test("tokenize tokenizes if/else keywords and parentheses", () => {
  expect(tokenize("if (x) { } else { }")).toEqual({
    ok: true,
    value: [
      { kind: "if", position: 0 },
      { kind: "lparen", position: 3 },
      { kind: "ident", value: "x", position: 4 },
      { kind: "rparen", position: 5 },
      { kind: "lbrace", position: 7 },
      { kind: "rbrace", position: 9 },
      { kind: "else", position: 11 },
      { kind: "lbrace", position: 16 },
      { kind: "rbrace", position: 18 },
    ],
  });
});

test("tokenize returns an UnexpectedToken error for an unknown character", () => {
  expect(tokenize("let x = @;")).toEqual({
    ok: false,
    error: { kind: "UnexpectedToken", character: "@", position: 8 },
  });
});

test("tokenize returns an empty token list for empty input", () => {
  expect(tokenize("")).toEqual({ ok: true, value: [] });
});
