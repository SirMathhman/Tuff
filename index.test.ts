import { describe, expect, test } from "bun:test";
import { evaluate } from "./index.ts";

function unwrap(result: ReturnType<typeof evaluate>): unknown {
  if (!result.ok)
    throw new Error(`expected ok, got error: ${JSON.stringify(result.error)}`);
  return result.value;
}

describe("evaluate", () => {
  test("empty string evaluates to 0", () => {
    expect(unwrap(evaluate(""))).toBe(0);
  });

  test('evaluates "return 1;" to 1', () => {
    expect(unwrap(evaluate("return 1;"))).toBe(1);
  });

  test('evaluates "let x = 1; return x;" to 1', () => {
    expect(unwrap(evaluate("let x = 1; return x;"))).toBe(1);
  });

  test('evaluates "let mut x = 0; x = 1; return x;" to 1', () => {
    expect(unwrap(evaluate("let mut x = 0; x = 1; return x;"))).toBe(1);
  });

  test('evaluates "let mut x = 0; { x = 1; } return x;" to 1', () => {
    expect(unwrap(evaluate("let mut x = 0; { x = 1; } return x;"))).toBe(1);
  });

  test("unsupported input yields a structured error", () => {
    const result = evaluate("throw new Error('boom');");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("UnexpectedCharacter");
      if (result.error.kind === "UnexpectedCharacter") {
        expect(result.error.ch).toBe("(");
      }
    }
  });

  test("reassigning an immutable variable yields ImmutableReassignment", () => {
    const result = evaluate("let x = 0; x = 1; return x;");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("ImmutableReassignment");
    }
  });
});
