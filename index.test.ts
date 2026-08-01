import { compileTuffToJS } from ".";
import { describe, it, expect } from "bun:test";

function evaluate(source: string, args: string[] = []) {
  const compiled = compileTuffToJS("in let args : &[Str]; " + source);
  // evaluate() is only called with valid sources; error cases use compileTuffToJS directly
  const generatedJS = compiled.ok ? compiled.value : "";
  const wrappedJS =
    "let __exit__ = undefined; let process = { exit : (arg) => { __exit__ = arg; } }; " +
    generatedJS +
    " return __exit__;";

  const newArgs = ["mock_program_name.exe", ...args];
  return new Function("args", wrappedJS)(newArgs) as number;
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

  it('compile("undefinedIdentifier") => Error', () => {
    expect(compileTuffToJS("undefinedIdentifier").ok).toBe(false);
  });

  it('evaluate("let x = 0; let x = 1; x") => 1', () => {
    expect(evaluate("let x = 0; let x = 1; x", [])).toBe(1);
  });

  it('evaluate("let mut x = 0; x = 1; x") => 1', () => {
    expect(evaluate("let mut x = 0; x = 1; x", [])).toBe(1);
  });

  it('compile("let x = 0; x = 1; x") => Error', () => {
    expect(compileTuffToJS("let x = 0; x = 1; x").ok).toBe(false);
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
    expect(compileTuffToJS("let x = if (false) 2; x").ok).toBe(false);
  });
});
