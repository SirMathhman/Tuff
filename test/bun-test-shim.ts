// Shim that maps `bun:test` API onto Node's built-in test runner.
// Allows running index.test.ts with `node --test` via tsx when Bun crashes.
import { test as nodeTest, describe } from "node:test";
import assert from "node:assert/strict";

export function test(name: string, fn: () => void): void {
  nodeTest(name, () => {
    fn();
  });
}

export { describe };

// Minimal `expect` compatible with the subset used by index.test.ts:
//   expect(value).toBe(expected)
//   expect(() => ...).toThrow()
export function expect(actual: unknown): {
  toBe: (expected: unknown) => void;
  toThrow: () => void;
} {
  return {
    toBe(expected: unknown) {
      assert.equal(actual, expected);
    },
    toThrow() {
      assert.throws(actual as () => void);
    },
  };
}
