import { parse } from "./parser/index.js";
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

test("parse parses a compound assignment statement", () => {
  expect(parseSource("x += 2;")).toEqual({
    ok: true,
    value: {
      statements: [
        {
          kind: "assign",
          name: "x",
          value: { kind: "number", value: 2, position: 5 },
          compound: "+=",
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

const BINARY_OPERATORS = [
  { operator: "==", rightPosition: 12 },
  { operator: "!=", rightPosition: 12 },
  { operator: "<", rightPosition: 11 },
  { operator: "<=", rightPosition: 12 },
  { operator: ">", rightPosition: 11 },
  { operator: ">=", rightPosition: 12 },
] as const;

test.each(BINARY_OPERATORS)(
  "parse parses a binary $operator expression",
  ({ operator, rightPosition }) => {
    expect(parseSource(`return x ${operator} y;`)).toEqual({
      ok: true,
      value: {
        statements: [
          {
            kind: "return",
            value: {
              kind: "binary",
              operator,
              left: { kind: "ident", name: "x", position: 7 },
              right: { kind: "ident", name: "y", position: rightPosition },
              position: 7,
            },
            position: 0,
          },
        ],
      },
    });
  },
);

const IF_CASES = [
  {
    label: "with an else branch",
    source: "if (x) { x = 1; } else { x = 2; } return x;",
    else: [
      {
        kind: "assign",
        name: "x",
        value: { kind: "number", value: 2, position: 29 },
        position: 25,
      },
    ],
    returnPosition: 34,
  },
  {
    label: "without an else branch",
    source: "if (x) { x = 1; } return x;",
    else: undefined,
    returnPosition: 18,
  },
] as const;

test.each(IF_CASES)(
  "parse parses an if statement $label",
  ({ source, else: elseBranch, returnPosition }) => {
    expect(parseSource(source)).toEqual({
      ok: true,
      value: {
        statements: [
          {
            kind: "if",
            condition: { kind: "ident", name: "x", position: 4 },
            then: [
              {
                kind: "assign",
                name: "x",
                value: { kind: "number", value: 1, position: 13 },
                position: 9,
              },
            ],
            else: elseBranch,
            position: 0,
          },
          {
            kind: "return",
            value: { kind: "ident", name: "x", position: returnPosition + 7 },
            position: returnPosition,
          },
        ],
      },
    });
  },
);

test("parse parses a while loop statement", () => {
  expect(parseSource("while (x < 4) { x += 1; } return x;")).toEqual({
    ok: true,
    value: {
      statements: [
        {
          kind: "while",
          condition: {
            kind: "binary",
            operator: "<",
            left: { kind: "ident", name: "x", position: 7 },
            right: { kind: "number", value: 4, position: 11 },
            position: 7,
          },
          body: [
            {
              kind: "assign",
              name: "x",
              value: { kind: "number", value: 1, position: 21 },
              compound: "+=",
              position: 16,
            },
          ],
          position: 0,
        },
        {
          kind: "return",
          value: { kind: "ident", name: "x", position: 33 },
          position: 26,
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
