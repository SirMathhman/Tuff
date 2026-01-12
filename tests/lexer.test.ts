/* eslint-disable max-lines-per-function, no-restricted-syntax */
import { tokenize } from "../src/interpreter/lexer";

describe("Lexer - basic tokens", () => {
  it("tokenizes empty input", () => {
    const tokens = tokenize("");
    expect(tokens).toHaveLength(1);
    expect(tokens[0].kind).toBe("eof");
  });

  it("tokenizes single number", () => {
    const tokens = tokenize("42");
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toMatchObject({ kind: "number", value: "42" });
    expect(tokens[1].kind).toBe("eof");
  });

  it("tokenizes number with suffix", () => {
    const tokens = tokenize("255U8");
    expect(tokens[0]).toMatchObject({ kind: "number", value: "255U8" });
  });

  it("tokenizes identifier", () => {
    const tokens = tokenize("foo");
    expect(tokens[0]).toMatchObject({ kind: "identifier", value: "foo" });
  });

  it("tokenizes keywords", () => {
    const input = "let mut fn struct type if else match case while for in return yield break continue then this";
    const tokens = tokenize(input);
    const kinds = tokens.slice(0, -1).map((t) => t.kind);
    expect(kinds).toEqual([
      "let", "mut", "fn", "struct", "type", "if", "else", "match", "case",
      "while", "for", "in", "return", "yield", "break", "continue", "then", "this"
    ]);
  });

  it("tokenizes boolean literals", () => {
    const tokens = tokenize("true false");
    expect(tokens[0].kind).toBe("true");
    expect(tokens[1].kind).toBe("false");
  });
});

describe("Lexer - operators", () => {
  it("tokenizes arithmetic operators", () => {
    const tokens = tokenize("+ - * /");
    expect(tokens.map((t) => t.kind)).toEqual(["plus", "minus", "star", "slash", "eof"]);
  });

  it("tokenizes comparison operators", () => {
    const tokens = tokenize("< > <= >= == !=");
    expect(tokens.map((t) => t.kind)).toEqual(["less", "greater", "leq", "geq", "eq", "neq", "eof"]);
  });

  it("tokenizes logical operators", () => {
    const tokens = tokenize("&& || !");
    expect(tokens.map((t) => t.kind)).toEqual(["and", "or", "bang", "eof"]);
  });

  it("tokenizes compound assignment operators", () => {
    const tokens = tokenize("+= -= *= /=");
    expect(tokens.map((t) => t.kind)).toEqual(["pluseq", "minuseq", "stareq", "slasheq", "eof"]);
  });

  it("tokenizes other operators", () => {
    const tokens = tokenize("= => . .. & |");
    expect(tokens.map((t) => t.kind)).toEqual(["equals", "arrow", "dot", "dotdot", "ampersand", "pipe", "eof"]);
  });
});

describe("Lexer - delimiters", () => {
  it("tokenizes parentheses and braces", () => {
    const tokens = tokenize("( ) { } [ ]");
    expect(tokens.map((t) => t.kind)).toEqual(["lparen", "rparen", "lbrace", "rbrace", "lbracket", "rbracket", "eof"]);
  });

  it("tokenizes punctuation", () => {
    const tokens = tokenize(", : ;");
    expect(tokens.map((t) => t.kind)).toEqual(["comma", "colon", "semicolon", "eof"]);
  });

  it("tokenizes standalone underscore", () => {
    const tokens = tokenize("case _ =>");
    expect(tokens.map((t) => t.kind)).toEqual(["case", "underscore", "arrow", "eof"]);
  });
});

describe("Lexer - expressions", () => {
  it("tokenizes simple arithmetic expression", () => {
    const tokens = tokenize("1 + 2 * 3");
    expect(tokens.map((t) => t.kind)).toEqual(["number", "plus", "number", "star", "number", "eof"]);
  });

  it("tokenizes let declaration", () => {
    const tokens = tokenize("let x : I32 = 5;");
    expect(tokens.map((t) => t.kind)).toEqual([
      "let", "identifier", "colon", "identifier", "equals", "number", "semicolon", "eof"
    ]);
  });

  it("tokenizes function definition", () => {
    const tokens = tokenize("fn add(a: I32, b: I32) => a + b");
    expect(tokens.map((t) => t.kind)).toEqual([
      "fn", "identifier", "lparen", "identifier", "colon", "identifier", "comma",
      "identifier", "colon", "identifier", "rparen", "arrow", "identifier", "plus", "identifier", "eof"
    ]);
  });

  it("tokenizes if expression", () => {
    const tokens = tokenize("if (x < 10) 1 else 2");
    expect(tokens.map((t) => t.kind)).toEqual([
      "if", "lparen", "identifier", "less", "number", "rparen", "number", "else", "number", "eof"
    ]);
  });

  it("tokenizes for loop", () => {
    const tokens = tokenize("for (let i in 0..10) sum += i");
    expect(tokens.map((t) => t.kind)).toEqual([
      "for", "lparen", "let", "identifier", "in", "number", "dotdot", "number", "rparen",
      "identifier", "pluseq", "identifier", "eof"
    ]);
  });

  it("tokenizes method call", () => {
    const tokens = tokenize("point.manhattan()");
    expect(tokens.map((t) => t.kind)).toEqual([
      "identifier", "dot", "identifier", "lparen", "rparen", "eof"
    ]);
  });

  it("tokenizes array indexing", () => {
    const tokens = tokenize("arr[0]");
    expect(tokens.map((t) => t.kind)).toEqual([
      "identifier", "lbracket", "number", "rbracket", "eof"
    ]);
  });

  it("tokenizes pointer operations", () => {
    const tokens = tokenize("let p : *I32 = &x; *p");
    expect(tokens.map((t) => t.kind)).toEqual([
      "let", "identifier", "colon", "star", "identifier", "equals", "ampersand", "identifier",
      "semicolon", "star", "identifier", "eof"
    ]);
  });
});

describe("Lexer - position tracking", () => {
  it("tracks line and column numbers", () => {
    const tokens = tokenize("let x\nlet y");
    expect(tokens[0]).toMatchObject({ kind: "let", line: 1, column: 1 });
    expect(tokens[1]).toMatchObject({ kind: "identifier", line: 1, column: 5 });
    expect(tokens[2]).toMatchObject({ kind: "let", line: 2, column: 1 });
    expect(tokens[3]).toMatchObject({ kind: "identifier", line: 2, column: 5 });
  });

  it("tracks position in source", () => {
    const tokens = tokenize("abc def");
    expect(tokens[0].pos).toBe(0);
    expect(tokens[1].pos).toBe(4);
  });
});

describe("Lexer - error handling", () => {
  it("throws on unexpected character", () => {
    expect(() => tokenize("@")).toThrow("Unexpected character");
  });

  it("throws on unexpected character with position", () => {
    expect(() => tokenize("let x = @")).toThrow(/line 1/);
  });
});
