// Shared test helpers for the Tuff test suite.
import { expect } from "bun:test";
import { evaluate, evaluateModules } from "..";

// Assert that evaluating `source` produces `expected`.
export function expectEval(source: string, expected: number): void {
  expect(evaluate(source)).toBe(expected);
}

// Assert that evaluating `source` throws.
export function expectEvalError(source: string): void {
  expect(() => evaluate(source)).toThrow();
}

// Assert that evaluating modules produces `expected`.
export function expectModules(
  entries: string[],
  modules: Record<string, string>,
  expected: number,
): void {
  expect(evaluateModules(entries, modules)).toBe(expected);
}
