import { describe, expect, test } from "bun:test";
import { evaluate } from "./index.ts";

function unwrap(result: ReturnType<typeof evaluate>): unknown {
  if (!result.ok)
    throw new Error(`expected ok, got error: ${JSON.stringify(result.error)}`);
  return result.value;
}

function expectInvalidNumberLiteral(
  input: string,
  literal: string,
  position: number,
): void {
  const result = evaluate(input);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.kind).toBe("InvalidNumberLiteral");
    if (result.error.kind === "InvalidNumberLiteral") {
      expect(result.error.literal).toBe(literal);
      expect(result.error.position).toBe(position);
    }
  }
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

  test('evaluates "let x = true; return x;" to 1', () => {
    expect(unwrap(evaluate("let x = true; return x;"))).toBe(1);
  });

  test('evaluates "let x = true; let y = true; return x || y;" to 1', () => {
    expect(unwrap(evaluate("let x = true; let y = true; return x || y;"))).toBe(
      1,
    );
  });

  test("unsupported input yields a structured error with position", () => {
    const result = evaluate("throw new Error('boom');");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("UnexpectedCharacter");
      if (result.error.kind === "UnexpectedCharacter") {
        expect(result.error.ch).toBe("(");
        expect(result.error.position).toBe(15);
      }
    }
  });

  test("reassigning an immutable variable yields ImmutableReassignment with position", () => {
    const result = evaluate("let x = 0; x = 1; return x;");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("ImmutableReassignment");
      if (result.error.kind === "ImmutableReassignment") {
        expect(result.error.name).toBe("x");
        expect(result.error.position).toBe(11);
      }
    }
  });

  test("unbalanced brace yields UnbalancedBrace with position", () => {
    const result = evaluate("let x = 1; { return x;");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("UnbalancedBrace");
      if (result.error.kind === "UnbalancedBrace") {
        expect(result.error.position).toBe(21);
      }
    }
  });

  test("malformed number literal yields InvalidNumberLiteral with position", () => {
    expectInvalidNumberLiteral("return 1.2.3;", "1.2.3", 7);
  });

  test("trailing-dot number literal yields InvalidNumberLiteral", () => {
    expectInvalidNumberLiteral("let x = 1.; return x;", "1.", 8);
  });
});
