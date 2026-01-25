import { describe, it } from "bun:test";
import { assertInterpretValid } from "../test-helpers";

describe("interpret - control flow - basic", () => {
  it("supports boolean literal true", () => {
    assertInterpretValid("true", 1);
  });

  it("supports boolean literal false", () => {
    assertInterpretValid("false", 0);
  });

  it("supports boolean variable declarations with Bool type", () => {
    assertInterpretValid("let x : Bool = true; x", 1);
  });

  it("supports boolean variable with false", () => {
    assertInterpretValid("let y : Bool = false; y", 0);
  });

  it("supports if-else expression with true condition", () => {
    assertInterpretValid("if (true) 3 else 4", 3);
  });

  it("supports if-else expression with false condition", () => {
    assertInterpretValid("if (false) 3 else 4", 4);
  });

  it("supports if-else in variable declaration", () => {
    assertInterpretValid("let x : I32 = if (true) 3 else 4; x", 3);
  });

  it("supports if-else with arithmetic", () => {
    assertInterpretValid("if (1 + 1 > 1) 10 else 20", 10);
  });

  it("supports nested if-else-if-else expressions", () => {
    assertInterpretValid(
      "let x : I32 = if (true) 3 else if (false) 4 else 5; x",
      3,
    );
  });

  it("supports match expression with literal pattern", () => {
    assertInterpretValid(
      "let x : I32 = match (100) { case 100 => 3; case _ => 2; } x",
      3,
    );
  });
});

describe("interpret - control flow - loops", () => {
  it("supports loop expression with break", () => {
    assertInterpretValid("let x : I32 = loop { break 5; }; x", 5);
  });

  it("supports loop with break inside if condition", () => {
    assertInterpretValid("let x : I32 = loop { if (true) break 5; }; x", 5);
  });

  it("supports compound assignment and loop with break value", () => {
    assertInterpretValid(
      "let mut i = 0; loop { if (i < 4) i += 1; else break i; }",
      4,
    );
  });

  it("supports while loop with condition and increment", () => {
    assertInterpretValid("let mut i = 0; while (i < 4) i += 1; i", 4);
  });

  it("supports for-in loop with range", () => {
    assertInterpretValid(
      "let mut sum = 0; for (let mut i in 0..10) sum += i; sum",
      45,
    );
  });
});
