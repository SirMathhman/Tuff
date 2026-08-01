import { compileTuffToJS } from ".";
import { describe, it, expect } from "bun:test";

function evaluate(source: string, args: string[] = []) {
  const generatedJS = compileTuffToJS("in let args : &[Str]; " + source);
  const wrappedJS =
    "let process = { exit : (arg) => { exitCode = arg; } }; " +
    generatedJS +
    " return exitCode;";

  try {
    const newArgs = ["mock_program_name.exe", ...args];
    return new Function("exitCode", "args", wrappedJS)(
      undefined,
      newArgs,
    ) as number;
  } catch (e) {
    throw new Error(
      "Failed to execute runtime JS: '" + wrappedJS + "'",
      e instanceof Error ? e : new Error(JSON.stringify(e)),
    );
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

  it('compile("undefinedIdentifier") => Error', () => {
    expect(() => compileTuffToJS("undefinedIdentifier")).toThrow();
  });

  it('evaluate("let x = 0; let x = 1; x") => 1', () => {
    expect(evaluate("let x = 0; let x = 1; x", [])).toBe(1);
  });

  it('evaluate("let mut x = 0; x = 1; x") => 1', () => {
    expect(evaluate("let mut x = 0; x = 1; x", [])).toBe(1);
  });

  it('compile("let x = 0; x = 1; x") => Error', () => {
    expect(() => compileTuffToJS("let x = 0; x = 1; x")).toThrow();
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
});
