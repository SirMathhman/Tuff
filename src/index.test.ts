import { evaluate } from "./index.js";

describe("arithmetic", () => {
  it("returns 0 for an empty string", () => {
    expect(evaluate("")).toEqual({ ok: true, value: 0 });
  });

  it('returns 1 for the input "1"', () => {
    expect(evaluate("1")).toEqual({ ok: true, value: 1 });
  });

  it('returns 3 for the input "1 + 2"', () => {
    expect(evaluate("1 + 2")).toEqual({ ok: true, value: 3 });
  });

  it('returns 6 for the input "1 + 2 + 3"', () => {
    expect(evaluate("1 + 2 + 3")).toEqual({ ok: true, value: 6 });
  });

  it('returns 1 for the input "2 + 3 - 4"', () => {
    expect(evaluate("2 + 3 - 4")).toEqual({ ok: true, value: 1 });
  });

  it('returns 10 for the input "2 * 3 + 4"', () => {
    expect(evaluate("2 * 3 + 4")).toEqual({ ok: true, value: 10 });
  });

  it('returns 14 for the input "2 + 3 * 4"', () => {
    expect(evaluate("2 + 3 * 4")).toEqual({ ok: true, value: 14 });
  });

  it('returns 24 for the input "2 * 3 * 4"', () => {
    expect(evaluate("2 * 3 * 4")).toEqual({ ok: true, value: 24 });
  });

  it("returns the parsed number for valid numeric input", () => {
    expect(evaluate("42")).toEqual({ ok: true, value: 42 });
  });
});

describe("grouping", () => {
  it('returns 20 for the input "(2 + 3) * 4"', () => {
    expect(evaluate("(2 + 3) * 4")).toEqual({ ok: true, value: 20 });
  });

  it('returns 20 for the input "{ 2 + 3 } * 4"', () => {
    expect(evaluate("{ 2 + 3 } * 4")).toEqual({ ok: true, value: 20 });
  });
});

describe("let statements and scoping", () => {
  it('returns 20 for the input "{ let x = 2 + 3; x } * 4"', () => {
    expect(evaluate("{ let x = 2 + 3; x } * 4")).toEqual({ ok: true, value: 20 });
  });

  it('returns 20 for the input "let y = { let x = 2 + 3; x } * 4; y"', () => {
    expect(evaluate("let y = { let x = 2 + 3; x } * 4; y")).toEqual({ ok: true, value: 20 });
  });

  it("returns 3 for multiple top-level let statements", () => {
    expect(evaluate("let a = 1; let b = a + 1; a + b")).toEqual({ ok: true, value: 3 });
  });

  it("returns 2 for multiple let statements in a block", () => {
    expect(evaluate("{ let a = 1; let b = a + 1; a * b }")).toEqual({ ok: true, value: 2 });
  });

  it("returns 2 for a shadowed variable in a nested block", () => {
    expect(evaluate("{ let x = 1; { let x = 2; x } }")).toEqual({ ok: true, value: 2 });
  });

  it("returns 1 for a variable read from an outer block", () => {
    expect(evaluate("{ let x = 1; { x } }")).toEqual({ ok: true, value: 1 });
  });
});

describe("unknown variable errors", () => {
  it("returns a structured error for an unknown variable", () => {
    expect(evaluate("x")).toEqual({
      ok: false,
      error: {
        kind: "unknown-variable",
        input: "x",
        name: "x",
        reason: 'Unknown variable "x" in "x"',
      },
    });
  });

  it("returns a structured error for a variable used outside its block", () => {
    expect(evaluate("{ let x = 1; x } + x")).toEqual({
      ok: false,
      error: {
        kind: "unknown-variable",
        input: "{ let x = 1; x } + x",
        name: "x",
        reason: 'Unknown variable "x" in "{ let x = 1; x } + x"',
      },
    });
  });

  it("returns a structured error for an unknown variable after *", () => {
    expect(evaluate("2 * abc")).toEqual({
      ok: false,
      error: {
        kind: "unknown-variable",
        input: "2 * abc",
        name: "abc",
        reason: 'Unknown variable "abc" in "2 * abc"',
      },
    });
  });

  it("returns a structured error for an unknown variable with a multi-character name", () => {
    expect(evaluate("abc")).toEqual({
      ok: false,
      error: {
        kind: "unknown-variable",
        input: "abc",
        name: "abc",
        reason: 'Unknown variable "abc" in "abc"',
      },
    });
  });
});

describe("top-level let statement errors", () => {
  it("returns a structured error for a top-level let statement missing =", () => {
    expect(evaluate("let x 1; x")).toEqual({
      ok: false,
      error: {
        kind: "malformed-expression",
        input: "let x 1; x",
        reason: 'Unexpected end of expression in "let x 1; x"',
      },
    });
  });

  it("returns a structured error for a top-level let statement missing ;", () => {
    expect(evaluate("let x = 1 x")).toEqual({
      ok: false,
      error: {
        kind: "malformed-expression",
        input: "let x = 1 x",
        reason: 'Unexpected end of expression in "let x = 1 x"',
      },
    });
  });

  it("returns a structured error for a dangling top-level let", () => {
    expect(evaluate("let")).toEqual({
      ok: false,
      error: {
        kind: "malformed-expression",
        input: "let",
        reason: 'Unexpected end of expression in "let"',
      },
    });
  });
});

describe("block let statement errors", () => {
  it("returns a structured error for a let statement missing =", () => {
    expect(evaluate("{ let x 1; x }")).toEqual({
      ok: false,
      error: {
        kind: "malformed-expression",
        input: "{ let x 1; x }",
        reason: 'Unexpected end of expression in "{ let x 1; x }"',
      },
    });
  });

  it("returns a structured error for a let statement missing ;", () => {
    expect(evaluate("{ let x = 1 x }")).toEqual({
      ok: false,
      error: {
        kind: "malformed-expression",
        input: "{ let x = 1 x }",
        reason: 'Unexpected end of expression in "{ let x = 1 x }"',
      },
    });
  });

  it("returns a structured error for an unclosed block", () => {
    expect(evaluate("{ let x = 1; x")).toEqual({
      ok: false,
      error: {
        kind: "malformed-expression",
        input: "{ let x = 1; x",
        reason: 'Unexpected end of expression in "{ let x = 1; x"',
      },
    });
  });

  it("returns a structured error for a let statement with no name", () => {
    expect(evaluate("{ let }")).toEqual({
      ok: false,
      error: {
        kind: "malformed-expression",
        input: "{ let }",
        reason: 'Unexpected end of expression in "{ let }"',
      },
    });
  });
});

describe("malformed let statement errors", () => {
  it("returns a structured error for a dangling let", () => {
    expect(evaluate("{ let")).toEqual({
      ok: false,
      error: {
        kind: "malformed-expression",
        input: "{ let",
        reason: 'Unexpected end of expression in "{ let"',
      },
    });
  });

  it("returns a structured error for a let statement with no value", () => {
    expect(evaluate("{ let x = ; }")).toEqual({
      ok: false,
      error: {
        kind: "malformed-expression",
        input: "{ let x = ; }",
        reason: 'Unexpected end of expression in "{ let x = ; }"',
      },
    });
  });
});

describe("malformed expression errors", () => {
  it("returns a structured error for a malformed expression", () => {
    expect(evaluate("1 +")).toEqual({
      ok: false,
      error: {
        kind: "malformed-expression",
        input: "1 +",
        reason: 'Unexpected end of expression in "1 +"',
      },
    });
  });

  it("returns a structured error for a missing operand", () => {
    expect(evaluate("1 + + 2")).toEqual({
      ok: false,
      error: {
        kind: "malformed-expression",
        input: "1 + + 2",
        reason: 'Unexpected end of expression in "1 + + 2"',
      },
    });
  });

  it("returns a structured error for a missing operand after *", () => {
    expect(evaluate("2 * ")).toEqual({
      ok: false,
      error: {
        kind: "malformed-expression",
        input: "2 * ",
        reason: 'Unexpected end of expression in "2 * "',
      },
    });
  });

  // Coverage: identifier between two numbers (tokenize gap branch).
  it("returns a structured error for an identifier between numbers", () => {
    expect(evaluate("1 a 2")).toEqual({
      ok: false,
      error: {
        kind: "malformed-expression",
        input: "1 a 2",
        reason: 'Unexpected end of expression in "1 a 2"',
      },
    });
  });
});

describe("tokenization errors", () => {
  // Coverage: unrecognized character between tokens (tokenize gap branch).
  it("returns a structured error for an unrecognized character between tokens", () => {
    expect(evaluate("1 @ 2")).toEqual({
      ok: false,
      error: {
        kind: "invalid-number",
        input: "1 @ 2",
        reason: 'Cannot parse "1 @ 2" as a number',
      },
    });
  });

  // Coverage: unrecognized trailing character (tokenize tail branch).
  it("returns a structured error for an unrecognized trailing character", () => {
    expect(evaluate("1 + @")).toEqual({
      ok: false,
      error: {
        kind: "invalid-number",
        input: "1 + @",
        reason: 'Cannot parse "1 + @" as a number',
      },
    });
  });

  // Coverage: unclosed parenthesis (parser paren branch).
  it("returns a structured error for an unclosed parenthesis", () => {
    expect(evaluate("(1 +")).toEqual({
      ok: false,
      error: {
        kind: "malformed-expression",
        input: "(1 +",
        reason: 'Unexpected end of expression in "(1 +"',
      },
    });
  });
});
