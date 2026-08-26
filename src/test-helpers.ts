import { expect } from "bun:test";
import type { TuffResult } from "./index.ts";

/**
 * Assert that a result is an UnidentifiedIdentifier error.
 * @param result - The result to assert on.
 * @param name - The expected identifier name.
 * @param line - The expected line number.
 */
export function expectUnidentifiedIdentifier(
  result: TuffResult,
  name: string,
  line: number,
) {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toEqual({
      kind: "UnidentifiedIdentifier",
      name,
      line,
    });
  }
}

/**
 * Assert that a result is an ImmutableAssignment error.
 * @param result - The result to assert on.
 * @param name - The expected variable name.
 * @param line - The expected line number.
 */
export function expectImmutableAssignment(
  result: TuffResult,
  name: string,
  line: number,
) {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toEqual({
      kind: "ImmutableAssignment",
      name,
      line,
    });
  }
}
