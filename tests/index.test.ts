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
    expectValid("let z : U8 = (2 + { let x : U8 = 3; let b : U8 = x; b }) * 4; let a : U8 = z; a", 20);
  });

  test("let binding without type annotation", () => {
    expectValid("let x = 100; x", 100);
  });
});
