// Shared test helpers for the Tuff test suite.
import { expect } from "bun:test";
import { compile, evaluate, evaluateModules } from "..";

// Assert that evaluating `source` (with optional args) produces `expected`.
// Evaluator route only — used for programs that must run with real runtime inputs.
export function expectEval(
  source: string,
  expectedExitCode: number,
  args: string[] = [],
): void {
  expect(evaluate(source, args)).toBe(expectedExitCode);
}

// Assert that evaluating `source` produces `expected`.
export function expectValid(
  source: string,
  expectedExitCode: number,
  args: string[] = [],
): void {
  const wrappedArgs = ["mock_program_name", ...args];
  const withPrelude = "in let args : &[&Str]; " + source;

  // The evaluator route
  expect(evaluate(withPrelude, wrappedArgs)).toBe(expectedExitCode);

  // The compiler route — emits JS that runs with the same runtime args.
  const generated = compile(withPrelude);

  // Wrap with a mock process.exit
  const wrapped =
    "let __exit__ = 0; let process = { exit: (code) => { __exit__ = code; } }; " +
    generated +
    " return __exit__;";

  try {
    const actualExitCode = new Function("args", wrapped)(wrappedArgs);
    if (actualExitCode !== expectedExitCode) {
      throw new Error(
        "Expected '" +
          actualExitCode +
          "' to be '" +
          expectedExitCode +
          "'. Generated: '" +
          generated +
          "'.",
      );
    }
  } catch (e) {
    throw new Error(
      "Failed to execute generated code: '" + wrapped + "'",
      new Error(JSON.stringify(e)),
    );
  }
}

// Assert that evaluating `source` throws.
export function expectInvalid(source: string): void {
  expect(() => evaluate(source)).toThrow();
  expect(() => compile(source)).toThrow();
}

// Assert that evaluating modules produces `expected`.
export function expectModules(
  entries: string[],
  modules: Record<string, string>,
  expected: number,
): void {
  expect(evaluateModules(entries, modules)).toBe(expected);
}

export function compileToExports(source: string): Record<string, unknown> {
  const compiled = compile(source);
  const actualModule = {
    exports: {},
  };

  // Mock process.exit so the trailing coercion call doesn't throw.
  const process = { exit: () => {} };

  new Function("module", "process", compiled)(actualModule, process);
  return actualModule.exports;
}
