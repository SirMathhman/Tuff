import { describe, expect, test } from "bun:test";
import { lex } from "./lexer.ts";

describe("lex: tokens", () => {
  test("number literal", () => {
    const r = lex("42");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value[0]).toEqual({ kind: "number", value: "42", position: { line: 1, column: 1 } });
    }
  });

  test("decimal number literal", () => {
    const r = lex("1.5");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value[0]).toEqual({
        kind: "number",
        value: "1.5",
        position: { line: 1, column: 1 },
      });
    }
  });

  test("identifier", () => {
    const r = lex("foo_bar1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value[0]).toEqual({
        kind: "identifier",
        value: "foo_bar1",
        position: { line: 1, column: 1 },
      });
    }
  });

  test("keywords are classified as keyword tokens", () => {
    const r = lex("let mut return true false if else while");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.slice(0, 8).map((t) => [t.kind, t.value])).toEqual([
        ["keyword", "let"],
        ["keyword", "mut"],
        ["keyword", "return"],
        ["keyword", "true"],
        ["keyword", "false"],
        ["keyword", "if"],
        ["keyword", "else"],
        ["keyword", "while"],
      ]);
    }
  });

  test("identifier containing a keyword is not a keyword", () => {
    const r = lex("letter");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value[0]).toEqual({
        kind: "identifier",
        value: "letter",
        position: { line: 1, column: 1 },
      });
    }
  });
});

describe("lex: punctuation & positions", () => {
  test("operators and punctuation", () => {
    const r = lex("= + - * / % & < ( ) [ ] , ; { }");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.slice(0, 16).map((t) => [t.kind, t.value])).toEqual([
        ["operator", "="],
        ["operator", "+"],
        ["operator", "-"],
        ["operator", "*"],
        ["operator", "/"],
        ["operator", "%"],
        ["operator", "&"],
        ["operator", "<"],
        ["lparen", "("],
        ["rparen", ")"],
        ["lbracket", "["],
        ["rbracket", "]"],
        ["comma", ","],
        ["semicolon", ";"],
        ["lbrace", "{"],
        ["rbrace", "}"],
      ]);
    }
  });

  test("+= is a single two-character operator token", () => {
    const r = lex("x += 1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.map((t) => [t.kind, t.value])).toEqual([
        ["identifier", "x"],
        ["operator", "+="],
        ["number", "1"],
        ["eof", ""],
      ]);
    }
  });

  test("positions track lines and columns", () => {
    const r = lex("  a\nb");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value[0]!.position).toEqual({ line: 1, column: 3 });
      expect(r.value[1]!.position).toEqual({ line: 2, column: 1 });
    }
  });

  test("always appends a trailing eof token", () => {
    const r = lex("1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value[r.value.length - 1]).toEqual({
        kind: "eof",
        value: "",
        position: { line: 1, column: 2 },
      });
    }
  });
});

describe("lex: errors", () => {
  test("unexpected character", () => {
    const r = lex("1 @ 2");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("syntax");
      expect(r.error.message).toBe('Unexpected character "@"');
      expect(r.error.position).toEqual({ line: 1, column: 3 });
    }
  });

  test("invalid number literal with multiple dots", () => {
    const r = lex("1.2.3");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("syntax");
      expect(r.error.message).toBe('Invalid number literal "1.2.3"');
      expect(r.error.position).toEqual({ line: 1, column: 1 });
    }
  });
});
