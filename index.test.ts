import { compileTuffToJS } from ".";
import { describe, it, expect } from "bun:test";

function evaluate(source: string, args: string[] = []) {
  const generatedJS = compileTuffToJS("in let args : &[Str]; " + source);
  const wrappedJS =
    "let __exit__ = undefined; let process = { exit : (arg) => { __exit__ = arg; } };" +
    generatedJS +
    " return __exit__;";

  try {
    const newArgs = ["mock_program_name.exe", ...args];
    return new Function("args", wrappedJS)(newArgs) as number;
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
});
