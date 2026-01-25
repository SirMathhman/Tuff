import { describe, it } from "bun:test";
import { assertInterpretValid, assertInterpretInvalid } from "../test-helpers";

describe("interpret - arithmetic - basic", () => {
  it("returns 0 for empty string", () => {
    assertInterpretValid("", 0);
  });

  it("parses a number string and returns the number", () => {
    assertInterpretValid("100", 100);
  });

  it("parses a number with a type suffix and returns the number", () => {
    assertInterpretValid("100U8", 100);
  });

  it("throws for negative value with unsigned suffix", () => {
    assertInterpretInvalid("-100U8");
  });

  it("throws for overflow with unsigned suffix U8", () => {
    assertInterpretInvalid("256U8");
  });

  it("parses simple addition with typed literals", () => {
    assertInterpretValid("1U8 + 2U8", 3);
  });

  it("throws on overflow when adding two U8 values", () => {
    assertInterpretInvalid("1U8 + 255U8");
  });

  it("parses addition with mixed typed and untyped operands", () => {
    assertInterpretValid("1 + 2U8", 3);
  });

  it("parses addition with typed operand on left and untyped on right", () => {
    assertInterpretValid("1U8 + 2", 3);
  });

  it("parses chained addition expressions", () => {
    assertInterpretValid("1 + 2 + 3", 6);
  });

  it("parses mixed addition and subtraction", () => {
    assertInterpretValid("2 + 3 - 4", 1);
  });

  it("respects operator precedence: multiplication before subtraction", () => {
    assertInterpretValid("2 * 3 - 4", 2);
  });

  it("respects operator precedence: multiplication before addition", () => {
    assertInterpretValid("2 + 3 * 4", 14);
  });

  it("respects parentheses for grouping", () => {
    assertInterpretValid("(2 + 3) * 4", 20);
  });

  it("respects curly braces for grouping", () => {
    assertInterpretValid("(2 + { 3 }) * 4", 20);
  });
});

describe("interpret - arithmetic - unary", () => {
  it("supports logical not operator on boolean literal true", () => {
    assertInterpretValid("!true", 0);
  });

  it("supports logical not operator on boolean literal false", () => {
    assertInterpretValid("!false", 1);
  });

  it("supports logical not on variable", () => {
    assertInterpretValid("let x = true; !x", 0);
  });

  it("supports logical not on expression", () => {
    assertInterpretValid("!(1 + 1 > 2)", 1);
  });

  it("supports double negation", () => {
    assertInterpretValid("!!true", 1);
  });

  it("supports unary minus on positive number", () => {
    assertInterpretValid("-(5)", -5);
  });

  it("supports unary minus on variable", () => {
    assertInterpretValid("let x = 10; -x", -10);
  });

  it("supports unary minus on expression", () => {
    assertInterpretValid("-(2 + 3)", -5);
  });
});
