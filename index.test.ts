import { compileTuffToJS } from ".";
import { describe, it, expect } from "bun:test";

function evaluate(source: string, args: string[] = []) {
  const compiled = compileTuffToJS("in let args : &[Str]; " + source);
  // evaluate() is only called with valid sources; error cases use compileTuffToJS directly
  const generatedJS = compiled.ok ? compiled.value : "";
  const wrappedJS =
    "let __exit__ = 0; let process = { exit : (arg) => { __exit__ = arg; } }; " +
    generatedJS +
    " return __exit__;";

  const newArgs = ["mock_program_name.exe", ...args];
  return new Function("args", wrappedJS)(newArgs) as number;
}

// Assert that compiling `source` fails with an error of the given kind.
// The kind is the error's `name` (e.g. "ScopeError" for semantic errors,
// "Error" for syntax/lexical errors).
function expectCompileError(source: string, errorKind: string) {
  const result = compileTuffToJS(source);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.name).toBe(errorKind);
  }
}

describe("tuff", () => {
  it('evaluate("") => 0', () => {
    expect(evaluate("", [])).toBe(0);
  });

  it('evaluate(" ") => 0', () => {
    expect(evaluate(" ", [])).toBe(0);
  });

  it('evaluate("args.length") => 1', () => {
    expect(evaluate("args.length", [])).toBe(1);
  });

  it('evaluate("args.length + 1") => 2', () => {
    expect(evaluate("args.length + 1", [])).toBe(2);
  });

  it('evaluate("args.length + args.length") => 2', () => {
    expect(evaluate("args.length + args.length", [])).toBe(2);
  });

  it('evaluate("let x = args.length; x") => 1', () => {
    expect(evaluate("let x = args.length; x", [])).toBe(1);
  });

  it('evaluate("let x = args.length; let y = x; y") => 1', () => {
    expect(evaluate("let x = args.length; let y = x; y", [])).toBe(1);
  });

  it('compile("undefinedIdentifier") => ScopeError', () => {
    expectCompileError("undefinedIdentifier", "ScopeError");
  });

  it('evaluate("let x = 0; let x = 1; x") => 1', () => {
    expect(evaluate("let x = 0; let x = 1; x", [])).toBe(1);
  });

  it('evaluate("let mut x = 0; x = 1; x") => 1', () => {
    expect(evaluate("let mut x = 0; x = 1; x", [])).toBe(1);
  });

  it('compile("let x = 0; x = 1; x") => ScopeError', () => {
    expectCompileError("let x = 0; x = 1; x", "ScopeError");
  });

  it('evaluate("let x = true; x") => 1', () => {
    expect(evaluate("let x = true; x", [])).toBe(1);
  });

  it('evaluate("let x = true; let y = false; x || y") => 1', () => {
    expect(evaluate("let x = true; let y = false; x || y", [])).toBe(1);
  });

  it('evaluate("let x = true; let y = false; x && y") => 0', () => {
    expect(evaluate("let x = true; let y = false; x && y", [])).toBe(0);
  });

  it('evaluate("let x = 0; let y = 1; x < y") => 1', () => {
    expect(evaluate("let x = 0; let y = 1; x < y", [])).toBe(1);
  });

  it('evaluate("let x = 0; let y = 1; x <= y") => 1', () => {
    expect(evaluate("let x = 0; let y = 1; x <= y", [])).toBe(1);
  });

  it('evaluate("let x = 0; let y = 1; x == y") => 0', () => {
    expect(evaluate("let x = 0; let y = 1; x == y", [])).toBe(0);
  });

  it('evaluate("let x = 0; let y = 1; x > y") => 0', () => {
    expect(evaluate("let x = 0; let y = 1; x > y", [])).toBe(0);
  });

  it('evaluate("let x = 0; let y = 1; x >= y") => 0', () => {
    expect(evaluate("let x = 0; let y = 1; x >= y", [])).toBe(0);
  });

  it('evaluate("let x = 0; let y = 1; x != y") => 1', () => {
    expect(evaluate("let x = 0; let y = 1; x != y", [])).toBe(1);
  });

  it('evaluate("let x = if (true) 2 else 3; x") => 2', () => {
    expect(evaluate("let x = if (true) 2 else 3; x", [])).toBe(2);
  });

  it('evaluate("let x = if (false) 2 else if (false) 3 else 4; x") => 4', () => {
    expect(
      evaluate("let x = if (false) 2 else if (false) 3 else 4; x", []),
    ).toBe(4);
  });

  it('compile("let x = if (false) 2; x") => Error', () => {
    expectCompileError("let x = if (false) 2; x", "Error");
  });

  it('evaluate("let mut x = 0; { x = 1; } x") => 1', () => {
    expect(evaluate("let mut x = 0; { x = 1; } x", [])).toBe(1);
  });

  it('evaluate("let x = 100;") => 0', () => {
    expect(evaluate("let x = 100;", [])).toBe(0);
  });

  it('compile("let x = { let y = 100; }; x") => ScopeError', () => {
    expectCompileError("let x = { let y = 100; }; x", "ScopeError");
  });

  it('compile("let mut y = 0; let x = { y = 1; }; x") => Error', () => {
    expectCompileError("let mut y = 0; let x = { y = 1; }; x", "Error");
  });

  it('evaluate("let mut x = 0; if (true) { x = 1; } else { x = 2; } x") => 1', () => {
    expect(
      evaluate("let mut x = 0; if (true) { x = 1; } else { x = 2; } x", []),
    ).toBe(1);
  });

  it('evaluate("let mut x = 0; if (true) { x = 1; } x") => 1', () => {
    expect(evaluate("let mut x = 0; if (true) { x = 1; } x", [])).toBe(1);
  });

  it('evaluate("let mut x = 1; x += 2; x") => 3', () => {
    expect(evaluate("let mut x = 1; x += 2; x", [])).toBe(3);
  });

  it('evaluate("let mut x = 0; while (x < 4) { x += 1; } x") => 4', () => {
    expect(evaluate("let mut x = 0; while (x < 4) { x += 1; } x", [])).toBe(4);
  });

  it('evaluate("let mut x = 0; while (x < 4) x += 1; x") => 4', () => {
    expect(evaluate("let mut x = 0; while (x < 4) x += 1; x", [])).toBe(4);
  });
});
