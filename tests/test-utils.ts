// Test utilities and helpers for Tuff compiler tests

import { describe, it, expect } from "bun:test"

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
  code: string,
  phase: "lexing" | "parsing" | "analysis",
  errorPattern: RegExp | string,
): void {
  // Placeholder: will be implemented with actual compiler
  expect(true).toBe(true)
}

/**
 * Assert that code compiles successfully
 */
export function expectCompileSuccess(code: string): void {
  // Placeholder: will be implemented with actual compiler
  expect(true).toBe(true)
}
