"use strict";

const { describe, it, expect } = require("bun:test");
const { lex } = require("../src/lex/lexer");

describe("Lexer", () => {
  describe("Keywords and identifiers", () => {
    it("lexes function keyword", () => {
      const tokens = lex("fn", "test.tuff");
      expect(tokens.length).toBe(2); // fn + eof
      expect(tokens[0].type).toBe("fn");
      expect(tokens[1].type).toBe("eof");
    });

    it("lexes identifiers", () => {
      const tokens = lex("foo bar baz", "test.tuff");
      expect(tokens.length).toBe(4); // 3 idents + eof
      expect(tokens[0].type).toBe("ident");
      expect(tokens[0].value).toBe("foo");
    });

    it("lexes let keyword", () => {
      const tokens = lex("let x = 5", "test.tuff");
      expect(tokens[0].type).toBe("let");
      expect(tokens[1].type).toBe("ident");
      expect(tokens[2].type).toBe("=");
      expect(tokens[3].type).toBe("number");
    });

    it("distinguishes keywords from identifiers", () => {
      const tokens = lex("fn foo", "test.tuff");
      expect(tokens[0].type).toBe("fn");
      expect(tokens[1].type).toBe("ident");
      expect(tokens[1].value).toBe("foo");
    });
  });

  describe("Numbers", () => {
    it("lexes integers", () => {
      const tokens = lex("42", "test.tuff");
      expect(tokens[0].type).toBe("number");
      expect(tokens[0].value).toBe("42");
    });

    it("lexes floats", () => {
      const tokens = lex("3.14", "test.tuff");
      expect(tokens[0].type).toBe("number");
      expect(tokens[0].value).toBe("3.14");
    });

    it("lexes zero", () => {
      const tokens = lex("0", "test.tuff");
      expect(tokens[0].type).toBe("number");
      expect(tokens[0].value).toBe("0");
    });
  });

  describe("Strings and characters", () => {
    it("lexes string literals", () => {
      const tokens = lex('"hello"', "test.tuff");
      expect(tokens[0].type).toBe("string");
      expect(tokens[0].value).toBe("hello");
    });

    it("handles string escapes", () => {
      const tokens = lex('"hello\\nworld"', "test.tuff");
      expect(tokens[0].type).toBe("string");
      // Lexer stores raw escape sequences
      expect(tokens[0].value).toBe("hello\\nworld");
    });

    it("handles tab escapes", () => {
      const tokens = lex('"a\\tb"', "test.tuff");
      // Lexer stores raw escape sequences
      expect(tokens[0].value).toBe("a\\tb");
    });

    it("lexes character literals", () => {
      const tokens = lex("'a'", "test.tuff");
      expect(tokens[0].type).toBe("char");
      expect(tokens[0].value).toBe("a");
    });

    it("handles escaped quotes in strings", () => {
      const tokens = lex('"say \\"hello\\""', "test.tuff");
      // Lexer stores raw escape sequences
      expect(tokens[0].value).toBe('say \\"hello\\"');
    });
  });

  describe("Operators", () => {
    it("lexes single-char operators", () => {
      const tokens = lex("+ - * / = < > ! .", "test.tuff");
      expect(tokens.map((t) => t.type)).toEqual([
        "+",
        "-",
        "*",
        "/",
        "=",
        "<",
        ">",
        "!",
        ".",
        "eof",
      ]);
    });

    it("lexes two-char operators", () => {
      const tokens = lex("== != <= >= && || :: .. =>", "test.tuff");
      expect(tokens.map((t) => t.type)).toEqual([
        "==",
        "!=",
        "<=",
        ">=",
        "&&",
        "||",
        "::",
        "..",
        "=>",
        "eof",
      ]);
    });

    it("lexes compound assignment operators", () => {
      const tokens = lex("+= -= *= /=", "test.tuff");
      expect(tokens.map((t) => t.type)).toEqual([
        "+=",
        "-=",
        "*=",
        "/=",
        "eof",
      ]);
    });

    it("lexes is operator", () => {
      const tokens = lex("is", "test.tuff");
      expect(tokens[0].type).toBe("is");
    });
  });

  describe("Punctuation", () => {
    it("lexes parentheses and brackets", () => {
      const tokens = lex("( ) [ ] { }", "test.tuff");
      expect(tokens.map((t) => t.type)).toEqual([
        "(",
        ")",
        "[",
        "]",
        "{",
        "}",
        "eof",
      ]);
    });

    it("lexes semicolon and comma", () => {
      const tokens = lex("; ,", "test.tuff");
      expect(tokens.map((t) => t.type)).toEqual([";", ",", "eof"]);
    });

    it("lexes wildcard", () => {
      const tokens = lex("_", "test.tuff");
      expect(tokens[0].type).toBe("_");
    });
  });

  describe("Comments", () => {
    it("ignores line comments", () => {
      const tokens = lex("let x; // comment\nlet y;", "test.tuff");
      // let, x, ;, let, y, ;, eof = 7 tokens
      expect(tokens.length).toBe(7);
      expect(tokens[3].type).toBe("let");
    });

    it("ignores block comments", () => {
      const tokens = lex("let x; /* comment */ let y;", "test.tuff");
      expect(tokens[3].type).toBe("let");
    });

    it("handles block comments", () => {
      // Bootstrap lexer stops at first */ (doesn't truly nest)
      const tokens = lex("let /* comment */ x;", "test.tuff");
      // let, x, ;, eof = 4 tokens
      expect(tokens.length).toBe(4);
    });
  });

  describe("Whitespace handling", () => {
    it("skips whitespace between tokens", () => {
      const tokens = lex("let   x   =   5", "test.tuff");
      expect(tokens.length).toBe(5); // let, x, =, 5, eof
    });

    it("handles newlines", () => {
      const tokens = lex("let x\nlet y", "test.tuff");
      expect(tokens.length).toBe(5); // let, x, let, y, eof
    });
  });

  describe("Token spans", () => {
    it("includes location information in tokens", () => {
      const tokens = lex("let x", "test.tuff");
      const firstToken = tokens[0];
      expect(firstToken.span).toBeDefined();
      expect(firstToken.span.filePath).toBe("test.tuff");
      expect(firstToken.span.startLine).toBeDefined();
      expect(firstToken.span.startCol).toBeDefined();
    });
  });

  describe("Complex expressions", () => {
    it("lexes arithmetic expression", () => {
      const tokens = lex("a + b * c - d / e", "test.tuff");
      expect(tokens.map((t) => t.type)).toEqual([
        "ident",
        "+",
        "ident",
        "*",
        "ident",
        "-",
        "ident",
        "/",
        "ident",
        "eof",
      ]);
    });

    it("lexes function call", () => {
      const tokens = lex("foo(a, b, c)", "test.tuff");
      expect(tokens.map((t) => t.type)).toEqual([
        "ident",
        "(",
        "ident",
        ",",
        "ident",
        ",",
        "ident",
        ")",
        "eof",
      ]);
    });

    it("lexes struct instantiation", () => {
      // Bootstrap uses positional struct literals: Point { 1, 2 }
      const tokens = lex("Point { 1, 2 }", "test.tuff");
      expect(tokens[0].value).toBe("Point");
      expect(tokens[1].type).toBe("{");
      expect(tokens[2].type).toBe("number");
    });
  });
});
