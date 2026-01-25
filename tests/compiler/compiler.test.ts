import { describe, test } from "bun:test";
import { assertCompileInvalid, assertExecuteValid } from "../test-helpers";

describe("compiler - arithmetic", () => {
  test("returns 0 for empty string", () => {
    assertExecuteValid("", 0);
  });

  test("parses a number string and returns the number", () => {
    assertExecuteValid("100", 100);
  });

  test("parses simple addition", () => {
    assertExecuteValid("1 + 2", 3);
  });

  test("parses addition with multiple operands", () => {
    assertExecuteValid("1 + 2 + 3", 6);
  });

  test("parses mixed addition and subtraction", () => {
    assertExecuteValid("2 + 3 - 4", 1);
  });

  test("respects operator precedence: multiplication before subtraction", () => {
    assertExecuteValid("2 * 3 - 4", 2);
  });

  test("respects operator precedence: multiplication before addition", () => {
    assertExecuteValid("2 + 3 * 4", 14);
  });

  test("respects parentheses for grouping", () => {
    assertExecuteValid("(2 + 3) * 4", 20);
  });

  test("supports unary minus on positive number", () => {
    assertExecuteValid("-(5)", -5);
  });

  test("supports unary minus on expression", () => {
    assertExecuteValid("-(2 + 3)", -5);
  });

  test("throws for negative value with unsigned suffix", () => {
    assertCompileInvalid("-100U8");
  });

  test("throws for overflow with unsigned suffix U8", () => {
    assertCompileInvalid("256U8");
  });

  test("throws on overflow when adding two U8 values", () => {
    assertCompileInvalid("1000U8");
  });
});

describe("compiler - variables - basic", () => {
  test("supports simple variable declaration", () => {
    assertExecuteValid("let x = 3; x", 3);
  });

  test("supports variable declaration with type annotation", () => {
    assertExecuteValid("let x : I32 = 50; x", 50);
  });

  test("supports variable references in declarations", () => {
    assertExecuteValid("let x = 100; let y = x; y", 100);
  });

  test("supports variable declarations without type annotations", () => {
    assertExecuteValid("let x = 100; let y = x; y", 100);
  });

  test("supports mutable variable assignment", () => {
    assertExecuteValid("let mut x = 0; x = 100; x", 100);
  });

  test("supports variable in arithmetic expression", () => {
    assertExecuteValid("let x = 5; x + 3", 8);
  });

  test("supports multiple variable declarations and references", () => {
    assertExecuteValid("let x = 10; let y = 20; x + y", 30);
  });

  test("supports variable reassignment in mutable variable", () => {
    assertExecuteValid("let mut x = 5; x = 10; x = 15; x", 15);
  });

  test("supports grouped expression with variable", () => {
    assertExecuteValid("let x = 100; { x }", 100);
  });

  test("supports variable declaration in grouped expression", () => {
    assertExecuteValid("{ let x = 5; x }", 5);
  });

  test("supports type validation for U8 assignment", () => {
    assertExecuteValid("let x : U8 = 100U8; x", 100);
  });

  test("supports type validation for I32 assignment", () => {
    assertExecuteValid("let x : I32 = 50; x", 50);
  });
});

describe("compiler - variables - errors", () => {
  test("throws on duplicate variable declaration in same scope", () => {
    assertCompileInvalid("let x = 100; let x = 200; x");
  });

  test("throws when reassigning immutable variable", () => {
    assertCompileInvalid("let x = 0; x = 100; x");
  });

  test("throws when variable is used before declaration", () => {
    assertCompileInvalid("x + 5");
  });

  test("throws on type mismatch in variable declaration", () => {
    assertCompileInvalid("let x : U8 = 300; x");
  });

  test("throws when assigning wider type to narrower type variable", () => {
    assertCompileInvalid("let x : U8 = 100U16; x");
  });

  test("throws on negative value assignment to unsigned type variable", () => {
    assertCompileInvalid("let x : U8 = -10; x");
  });
});
