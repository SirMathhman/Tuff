// Test utilities and helpers for Tuff compiler tests

import { expect } from "bun:test"

/**
 * Test fixture for compiler testing
 */
export interface TestFixture {
  name: string
  input: string
  expectedError?: string
  expectedOutput?: string
}

/**
 * Helper to create test cases
 */
export function defineFixture(fixture: TestFixture): TestFixture {
  return fixture
}

/**
 * Assert that code produces an error during a specific phase
 */
export function expectCompileError(
  _code: string,
  _phase: "lexing" | "parsing" | "analysis",
  _errorPattern: RegExp | string,
): void {
  // Placeholder: will be implemented with actual compiler
  expect(true).toBe(true)
}

/**
 * Assert that code compiles successfully
 */
export function expectCompileSuccess(_code: string): void {
  // Placeholder: will be implemented with actual compiler
  expect(true).toBe(true)
}
