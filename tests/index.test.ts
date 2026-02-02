import { interpret } from "../src";

function expectValid(source: string, exitCode: number) {
  expect(interpret(source)).toBe(exitCode);
}

// function expectInvalid(source: string) {
//   expect(() => interpret(source)).toThrow();
// }

describe("The interpreter can interpret", () => {
  test("an empty program", () => {
    expectValid("", 0);
  });

  test("a numeric literal", () => {
    expectValid("100", 100);
  });

  test("a typed numeric literal", () => {
    expectValid("100U8", 100);
  });

  test("binary addition", () => {
    expectValid("1U8 + 2U8", 3);
  });

  test("chained addition", () => {
    expectValid("1U8 + 2U8 + 3U8", 6);
  });

  test("addition and subtraction", () => {
    expectValid("2 + 3 - 4", 1);
  });

  test("multiplication with precedence", () => {
    expectValid("2 * 3 - 4", 2);
  });

  test("addition with multiplication precedence", () => {
    expectValid("2 + 3 * 4", 14);
  });

  test("parentheses grouping", () => {
    expectValid("(2 + 3) * 4", 20);
  });

  test("curly braces grouping", () => {
    expectValid("(2 + { 3 }) * 4", 20);
  });

  test("variable binding with let", () => {
    expectValid("(2 + { let x : U8 = 3; x }) * 4", 20);
  });

  test("top-level let binding", () => {
    expectValid("let z : U8 = (2 + { let x : U8 = 3; x }) * 4; z", 20);
  });

  test("sequential let bindings", () => {
    expectValid(
      "let z : U8 = (2 + { let x : U8 = 3; let b : U8 = x; b }) * 4; let a : U8 = z; a",
      20,
    );
  });

  test("let binding without type annotation", () => {
    expectValid("let x = 100; x", 100);
  });

  test("mutable variable binding and reassignment", () => {
    expectValid("let mut x = 0; x = 100; x", 100);
  });

  test("compound assignment operator +=", () => {
    expectValid("let mut x = 0; x += 3; x", 3);
  });

  test("boolean literal true", () => {
    expectValid("let x = true; x", 1);
  });

  test("logical AND operator", () => {
    expectValid("let x = true; let y = false; x && y", 0);
  });

  test("logical OR operator", () => {
    expectValid("let x = true; let y = false; x || y", 1);
  });

  test("block-scoped mutable variable mutation", () => {
    expectValid("let mut x = 0; { x = 1; } x", 1);
  });

  test("less-than comparison operator", () => {
    expectValid("let x = 0; let y = 1; x < y", 1);
  });

  test("if-else expression", () => {
    expectValid("let x = if (true) 2 else 3; x", 2);
  });

  test("if-else statement with assignments", () => {
    expectValid("let mut x = 0; if (true) x = 1; else x = 2; x", 1);
  });

  test("if-else with block bodies", () => {
    expectValid("let mut x = 0; if (true) { x = 1; } else { x = 2; } x", 1);
  });

  test("nested if-else expressions", () => {
    expectValid("let x = if (false) 1 else if (false) 2 else 3; x", 3);
  });

  test("nested if-else statements", () => {
    expectValid("let mut x = 0; if (false) { x = 1; } else if (false) { x = 2; } else x = 3; x", 3);
  });

  test("match expression with case patterns", () => {
    expectValid("let x = match (100) { case 100 => 2; case _ => 3; }; x", 2);
  });
});
