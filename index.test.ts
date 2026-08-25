import { describe, expect, test } from "bun:test";
import { evaluate } from "./index.ts";
import type { EvaluateError } from "./src/errors.ts";

function unwrap(result: ReturnType<typeof evaluate>): unknown {
  if (!result.ok)
    throw new Error(`expected ok, got error: ${JSON.stringify(result.error)}`);
  return result.value;
}

function expectError<K extends EvaluateError["kind"]>(
  input: string,
  kind: K,
  assert: (error: Extract<EvaluateError, { kind: K }>) => void,
): void {
  const result = evaluate(input);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.kind).toBe(kind);
    if (result.error.kind === kind) {
      assert(result.error as Extract<EvaluateError, { kind: K }>);
    }
  }
}

describe("evaluate", () => {
  test("empty string evaluates to 0", () => {
    expect(unwrap(evaluate(""))).toBe(0);
  });

  test('evaluates "let x = 1;" to 0', () => {
    expect(unwrap(evaluate("let x = 1;"))).toBe(0);
  });

  test('evaluates "let mut x = 0; x = 1;" to 0', () => {
    expect(unwrap(evaluate("let mut x = 0; x = 1;"))).toBe(0);
  });

  test('evaluates "let x = 0; let x = 1; return x;" to 1', () => {
    expect(unwrap(evaluate("let x = 0; let x = 1; return x;"))).toBe(1);
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

  test('evaluates "let mut x = 1; x += 2; return x;" to 3', () => {
    expect(unwrap(evaluate("let mut x = 1; x += 2; return x;"))).toBe(3);
  });

  test('evaluates "let mut x = 0; { x = 1; } return x;" to 1', () => {
    expect(unwrap(evaluate("let mut x = 0; { x = 1; } return x;"))).toBe(1);
  });

  test('evaluates "let mut x = 0; if (true) { x = 1; } else { x = 2; } return x;" to 1', () => {
    expect(
      unwrap(
        evaluate(
          "let mut x = 0; if (true) { x = 1; } else { x = 2; } return x;",
        ),
      ),
    ).toBe(1);
  });

  test('evaluates "let mut x = 0; if (false) { x = 1; } return x;" to 0', () => {
    expect(
      unwrap(evaluate("let mut x = 0; if (false) { x = 1; } return x;")),
    ).toBe(0);
  });

  test('evaluates "let mut x = 0; if (true) { x = 1; } return x;" to 1', () => {
    expect(
      unwrap(evaluate("let mut x = 0; if (true) { x = 1; } return x;")),
    ).toBe(1);
  });

  test('evaluates "let x = true; return x;" to 1', () => {
    expect(unwrap(evaluate("let x = true; return x;"))).toBe(1);
  });

  test('evaluates "let x = true; let y = true; return x || y;" to 1', () => {
    expect(unwrap(evaluate("let x = true; let y = true; return x || y;"))).toBe(
      1,
    );
  });

  test('evaluates "let mut x = 0; while (x < 4) { x += 1; } return x;" to 4', () => {
    expect(
      unwrap(evaluate("let mut x = 0; while (x < 4) { x += 1; } return x;")),
    ).toBe(4);
  });

  test('evaluates "let mut x = 0; while (x < 4) { x += 1; break; } return x;" to 1', () => {
    expect(
      unwrap(
        evaluate("let mut x = 0; while (x < 4) { x += 1; break; } return x;"),
      ),
    ).toBe(1);
  });

  test('evaluates "let mut x = 0; while (x < 4) { x += 1; continue; } return x;" to 4', () => {
    expect(
      unwrap(
        evaluate(
          "let mut x = 0; while (x < 4) { x += 1; continue; } return x;",
        ),
      ),
    ).toBe(4);
  });

  test('evaluates "return 1 + 2;" to 3', () => {
    expect(unwrap(evaluate("return 1 + 2;"))).toBe(3);
  });

  test('evaluates "return 2 + 3 - 4;" to 1', () => {
    expect(unwrap(evaluate("return 2 + 3 - 4;"))).toBe(1);
  });

  test('evaluates "return 2 * 3 + 4;" to 10', () => {
    expect(unwrap(evaluate("return 2 * 3 + 4;"))).toBe(10);
  });

  test('evaluates "return 2 * (3 + 4);" to 14', () => {
    expect(unwrap(evaluate("return 2 * (3 + 4);"))).toBe(14);
  });

  test('evaluates "let mut x = 0; match (1) { case 1 => { x = 2; }; case _ => { x = 3; }; } return x;" to 2', () => {
    expect(
      unwrap(
        evaluate(
          "let mut x = 0; match (1) { case 1 => { x = 2; }; case _ => { x = 3; }; } return x;",
        ),
      ),
    ).toBe(2);
  });

  test('evaluates "let x = 0; let y = 1; return x == y;" to 0', () => {
    expect(unwrap(evaluate("let x = 0; let y = 1; return x == y;"))).toBe(0);
  });

  test('evaluates "return 1 == true;" to 0', () => {
    expect(unwrap(evaluate("return 1 == true;"))).toBe(0);
  });

  test('evaluates "let x = 0; let y = 1; return x < y;" to 1', () => {
    expect(unwrap(evaluate("let x = 0; let y = 1; return x < y;"))).toBe(1);
  });

  test('evaluates "let x = true; let y = true; return x && y;" to 1', () => {
    expect(unwrap(evaluate("let x = true; let y = true; return x && y;"))).toBe(
      1,
    );
  });

  test("unsupported input yields a structured error with position", () => {
    const result = evaluate("throw new Error('boom');");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("UnexpectedCharacter");
      if (result.error.kind === "UnexpectedCharacter") {
        expect(result.error.ch).toBe("'");
        expect(result.error.position).toBe(16);
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

  test.each([
    ["let mut x = 0; x = true;", 15],
    ["if (false) { let mut x = 0; x = true; }", 28],
  ])(
    "type mismatch yields TypeMismatch with position (%s)",
    (input, position) => {
      expectError(input, "TypeMismatch", (error) => {
        expect(error.name).toBe("x");
        expect(error.expected).toBe("number");
        expect(error.found).toBe("boolean");
        expect(error.position).toBe(position);
      });
    },
  );

  test.each([
    ["let mut x = true; x += 1;", 18],
    ["let mut x = 0; x += true;", 15],
  ])(
    "compound assignment type mismatch yields TypeMismatch with position (%s)",
    (input, position) => {
      expectError(input, "TypeMismatch", (error) => {
        expect(error.name).toBe("x");
        expect(error.expected).toBe("number");
        expect(error.position).toBe(position);
      });
    },
  );

  test("compound assignment to an immutable variable yields ImmutableReassignment with position", () => {
    expectError("let x = 0; x += 1;", "ImmutableReassignment", (error) => {
      expect(error.name).toBe("x");
      expect(error.position).toBe(11);
    });
  });

  test("code after a return is ignored", () => {
    expect(unwrap(evaluate("return 1; let x = 2;"))).toBe(1);
  });

  test("variable declared in a block is not visible outside it", () => {
    expectError("{ let x = 0; } return x;", "UndeclaredVariable", (error) => {
      expect(error.name).toBe("x");
      expect(error.position).toBe(22);
    });
  });

  test("variable declared in an if body is not visible outside it", () => {
    expectError(
      "if (true) { let x = 1; } return x;",
      "UndeclaredVariable",
      (error) => {
        expect(error.name).toBe("x");
        expect(error.position).toBe(32);
      },
    );
  });

  test("variable declared in a while body is not visible outside it", () => {
    expectError(
      "while (false) { let y = 2; } return y;",
      "UndeclaredVariable",
      (error) => {
        expect(error.name).toBe("y");
        expect(error.position).toBe(36);
      },
    );
  });

  test("variable declared in a match case body is not visible outside it", () => {
    expectError(
      "match (1) { case 1 => { let z = 3; }; } return z;",
      "UndeclaredVariable",
      (error) => {
        expect(error.name).toBe("z");
        expect(error.position).toBe(47);
      },
    );
  });

  test("undeclared variable in an unexecuted branch yields UndeclaredVariable with position", () => {
    expectError("if (false) { let x = y; }", "UndeclaredVariable", (error) => {
      expect(error.name).toBe("y");
      expect(error.position).toBe(21);
    });
  });

  test("assignment to an undeclared variable in an unexecuted branch yields UndeclaredVariable with position", () => {
    expectError("if (false) { x = 5; }", "UndeclaredVariable", (error) => {
      expect(error.name).toBe("x");
      expect(error.position).toBe(13);
    });
  });

  test("declaration without a name yields ExpectedToken with position", () => {
    const result = evaluate("let = 1;");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("ExpectedToken");
      if (result.error.kind === "ExpectedToken") {
        expect(result.error.expected).toBe("'='");
        expect(result.error.found).toBe("1");
        expect(result.error.position).toBe(6);
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

  test("unbalanced paren in if condition yields UnbalancedParen with position", () => {
    const result = evaluate("if (x { return 1; }");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("UnbalancedParen");
      if (result.error.kind === "UnbalancedParen") {
        expect(result.error.position).toBe(18);
      }
    }
  });

  test("malformed number literal yields InvalidNumberLiteral with position", () => {
    expectError("return 1.2.3;", "InvalidNumberLiteral", (error) => {
      expect(error.literal).toBe("1.2.3");
      expect(error.position).toBe(7);
    });
  });

  test("trailing-dot number literal yields InvalidNumberLiteral", () => {
    expectError("let x = 1.; return x;", "InvalidNumberLiteral", (error) => {
      expect(error.literal).toBe("1.");
      expect(error.position).toBe(8);
    });
  });
});
