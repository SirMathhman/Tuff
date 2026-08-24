import { describe, expect, test } from "bun:test";
import { ErrorKind } from "../errors.ts";
import { parse } from "./parser.ts";
import { ExprType, StatementType } from "../ast/index.ts";
import type { Token, TokenKind } from "../lexer/index.ts";

function tok(kind: TokenKind, value: string): Token {
  return { kind, value, position: { line: 1, column: 1 } };
}

function parseTokens(tokens: Token[]) {
  return parse([...tokens, tok("eof", "")]);
}

describe("parse: statements", () => {
  test("let binding", () => {
    const r = parseTokens([
      tok("keyword", "let"),
      tok("identifier", "x"),
      tok("operator", "="),
      tok("number", "1"),
      tok("semicolon", ";"),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.statements).toEqual([
        {
          type: StatementType.Let,
          mutable: false,
          name: "x",
          value: { type: ExprType.Number, value: 1, position: { line: 1, column: 1 } },
          position: { line: 1, column: 1 },
        },
      ]);
    }
  });

  test("let mut binding", () => {
    const r = parseTokens([
      tok("keyword", "let"),
      tok("keyword", "mut"),
      tok("identifier", "x"),
      tok("operator", "="),
      tok("number", "0"),
      tok("semicolon", ";"),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.statements[0]).toMatchObject({ type: "let", mutable: true, name: "x" });
    }
  });

  test("assignment", () => {
    const r = parseTokens([
      tok("identifier", "x"),
      tok("operator", "="),
      tok("number", "2"),
      tok("semicolon", ";"),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.statements[0]).toMatchObject({
        type: "assign",
        target: { type: "identifier", name: "x" },
        value: { type: "number", value: 2 },
      });
    }
  });

  test("compound assignment desugars to binary +", () => {
    const r = parseTokens([
      tok("identifier", "x"),
      tok("operator", "+="),
      tok("number", "1"),
      tok("semicolon", ";"),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.statements[0]).toMatchObject({
        type: "assign",
        target: { type: "identifier", name: "x" },
        value: { type: "binary", op: "+" },
      });
    }
  });

  test("deref assignment", () => {
    const r = parseTokens([
      tok("operator", "*"),
      tok("identifier", "r"),
      tok("operator", "="),
      tok("number", "3"),
      tok("semicolon", ";"),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.statements[0]).toMatchObject({
        type: "assign",
        target: { type: "deref", operand: { type: "identifier", name: "r" } },
      });
    }
  });
});

describe("parse: statements: control flow", () => {
  test("return", () => {
    const r = parseTokens([tok("keyword", "return"), tok("number", "7"), tok("semicolon", ";")]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.statements[0]).toMatchObject({
        type: "return",
        value: { type: "number", value: 7 },
      });
    }
  });

  test("block", () => {
    const r = parseTokens([
      tok("lbrace", "{"),
      tok("keyword", "return"),
      tok("number", "1"),
      tok("semicolon", ";"),
      tok("rbrace", "}"),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.statements[0]).toMatchObject({
        type: "block",
        statements: [{ type: "return", value: { type: "number", value: 1 } }],
      });
    }
  });

  test("if with else", () => {
    const r = parseTokens([
      tok("keyword", "if"),
      tok("lparen", "("),
      tok("number", "1"),
      tok("rparen", ")"),
      tok("lbrace", "{"),
      tok("rbrace", "}"),
      tok("keyword", "else"),
      tok("lbrace", "{"),
      tok("rbrace", "}"),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.statements[0]).toMatchObject({
        type: "if",
        condition: { type: "number", value: 1 },
        then: [],
        else: [],
      });
    }
  });

  test("if without else", () => {
    const r = parseTokens([
      tok("keyword", "if"),
      tok("lparen", "("),
      tok("number", "1"),
      tok("rparen", ")"),
      tok("lbrace", "{"),
      tok("rbrace", "}"),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.statements[0]).toMatchObject({ type: "if", else: null });
    }
  });

  test("while", () => {
    const r = parseTokens([
      tok("keyword", "while"),
      tok("lparen", "("),
      tok("number", "1"),
      tok("rparen", ")"),
      tok("lbrace", "{"),
      tok("rbrace", "}"),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.statements[0]).toMatchObject({
        type: "while",
        condition: { type: "number", value: 1 },
        body: [],
      });
    }
  });
});

describe("parse: expressions", () => {
  test("boolean literal", () => {
    const r = parseTokens([
      tok("keyword", "return"),
      tok("keyword", "true"),
      tok("semicolon", ";"),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.statements[0]).toMatchObject({
        type: "return",
        value: { type: "boolean", value: true },
      });
    }
  });

  test("unary minus", () => {
    const r = parseTokens([
      tok("keyword", "return"),
      tok("operator", "-"),
      tok("number", "1"),
      tok("semicolon", ";"),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.statements[0]).toMatchObject({
        type: "return",
        value: { type: "unary", op: "-", operand: { type: "number", value: 1 } },
      });
    }
  });

  test("ref and mutable ref", () => {
    const r = parseTokens([
      tok("keyword", "let"),
      tok("identifier", "r"),
      tok("operator", "="),
      tok("operator", "&"),
      tok("keyword", "mut"),
      tok("identifier", "x"),
      tok("semicolon", ";"),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.statements[0]).toMatchObject({
        type: "let",
        value: { type: "ref", mutable: true, operand: { type: "identifier", name: "x" } },
      });
    }
  });

  test("deref expression", () => {
    const r = parseTokens([
      tok("keyword", "return"),
      tok("operator", "*"),
      tok("identifier", "r"),
      tok("semicolon", ";"),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.statements[0]).toMatchObject({
        type: "return",
        value: { type: "deref", operand: { type: "identifier", name: "r" } },
      });
    }
  });
});

describe("parse: expressions: precedence & collections", () => {
  test("multiplication binds tighter than addition", () => {
    const r = parseTokens([
      tok("keyword", "return"),
      tok("number", "1"),
      tok("operator", "+"),
      tok("number", "2"),
      tok("operator", "*"),
      tok("number", "3"),
      tok("semicolon", ";"),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.statements[0]).toMatchObject({
        type: "return",
        value: {
          type: "binary",
          op: "+",
          left: { type: "number", value: 1 },
          right: {
            type: "binary",
            op: "*",
            left: { type: "number", value: 2 },
            right: { type: "number", value: 3 },
          },
        },
      });
    }
  });

  test("comparison binds looser than addition", () => {
    const r = parseTokens([
      tok("keyword", "return"),
      tok("number", "1"),
      tok("operator", "<"),
      tok("number", "2"),
      tok("operator", "+"),
      tok("number", "3"),
      tok("semicolon", ";"),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.statements[0]).toMatchObject({
        type: "return",
        value: {
          type: "binary",
          op: "<",
          left: { type: "number", value: 1 },
          right: {
            type: "binary",
            op: "+",
            left: { type: "number", value: 2 },
            right: { type: "number", value: 3 },
          },
        },
      });
    }
  });

  test("parenthesized expression", () => {
    const r = parseTokens([
      tok("keyword", "return"),
      tok("lparen", "("),
      tok("number", "1"),
      tok("rparen", ")"),
      tok("semicolon", ";"),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.statements[0]).toMatchObject({
        type: "return",
        value: { type: "number", value: 1 },
      });
    }
  });
});

describe("parse: expressions: arrays & indexing", () => {
  test("array literal", () => {
    const r = parseTokens([
      tok("keyword", "return"),
      tok("lbracket", "["),
      tok("number", "1"),
      tok("comma", ","),
      tok("number", "2"),
      tok("rbracket", "]"),
      tok("semicolon", ";"),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.statements[0]).toMatchObject({
        type: "return",
        value: {
          type: "array",
          elements: [
            { type: "number", value: 1 },
            { type: "number", value: 2 },
          ],
        },
      });
    }
  });

  test("array literal without trailing comma", () => {
    const r = parseTokens([
      tok("keyword", "return"),
      tok("lbracket", "["),
      tok("number", "1"),
      tok("rbracket", "]"),
      tok("semicolon", ";"),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.statements[0]).toMatchObject({
        type: "return",
        value: { type: "array", elements: [{ type: "number", value: 1 }] },
      });
    }
  });

  test("index expression", () => {
    const r = parseTokens([
      tok("keyword", "return"),
      tok("identifier", "a"),
      tok("lbracket", "["),
      tok("number", "0"),
      tok("rbracket", "]"),
      tok("semicolon", ";"),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.statements[0]).toMatchObject({
        type: "return",
        value: {
          type: "index",
          array: { type: "identifier", name: "a" },
          index: { type: "number", value: 0 },
        },
      });
    }
  });
});

describe("parse: errors", () => {
  test("unexpected token at statement start", () => {
    const r = parseTokens([tok("semicolon", ";")]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe(ErrorKind.Syntax);
      expect(r.error.message).toBe('Unexpected token ";"');
    }
  });

  test("missing semicolon after let", () => {
    const r = parseTokens([
      tok("keyword", "let"),
      tok("identifier", "x"),
      tok("operator", "="),
      tok("number", "1"),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe(ErrorKind.Syntax);
      expect(r.error.message).toBe("Expected ';' but found \"end of input\"");
    }
  });

  test("missing closing paren in if condition", () => {
    const r = parseTokens([
      tok("keyword", "if"),
      tok("lparen", "("),
      tok("number", "1"),
      tok("lbrace", "{"),
      tok("rbrace", "}"),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe(ErrorKind.Syntax);
      expect(r.error.message).toBe("Expected ')' but found \"{\"");
    }
  });

  test("bad array separator", () => {
    const r = parseTokens([
      tok("keyword", "return"),
      tok("lbracket", "["),
      tok("number", "1"),
      tok("number", "2"),
      tok("rbracket", "]"),
      tok("semicolon", ";"),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe(ErrorKind.Syntax);
      expect(r.error.message).toBe('Expected "," but found "2"');
    }
  });

  test("missing closing brace in block", () => {
    const r = parseTokens([
      tok("lbrace", "{"),
      tok("keyword", "return"),
      tok("number", "1"),
      tok("semicolon", ";"),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe(ErrorKind.Syntax);
      expect(r.error.message).toBe("Expected '}' but found \"end of input\"");
    }
  });

  test("fractional number literal is a syntax error", () => {
    const r = parseTokens([tok("keyword", "return"), tok("number", "1.5"), tok("semicolon", ";")]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe(ErrorKind.Syntax);
      expect(r.error.message).toBe("Fractional number literals are not supported");
    }
  });
});
