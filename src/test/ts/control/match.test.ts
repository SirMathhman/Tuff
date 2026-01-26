import { describe } from "bun:test";
import { itBoth } from "../test-helpers";

describe("control flow - match", () => {
  itBoth("supports match expression with literal pattern", (assertValid) => {
    assertValid(
      "let x : I32 = match (100) { case 100 => 3; case _ => 2; } x",
      3,
    );
  });

  itBoth("supports match expression with default case", (assertValid) => {
    assertValid(
      "let x : I32 = match (50) { case 100 => 3; case _ => 2; } x",
      2,
    );
  });

  itBoth("supports match with multiple sequential cases", (assertValid) => {
    assertValid(
      "let x : I32 = match (3) { case 1 => 10; case 2 => 20; case 3 => 30; case _ => 0; } x",
      30,
    );
  });

  itBoth("supports match with computation in matched value", (assertValid) => {
    assertValid(
      "let x : I32 = match (10 + 5) { case 15 => 100; case _ => 50; } x",
      100,
    );
  });

  itBoth("supports match with zero value", (assertValid) => {
    assertValid("let x : I32 = match (0) { case 0 => 42; case _ => 1; } x", 42);
  });

  itBoth("supports match with negative number case", (assertValid) => {
    assertValid(
      "let x : I32 = match (-5) { case -5 => 100; case _ => 0; } x",
      100,
    );
  });

  itBoth("supports match case ordering", (assertValid) => {
    assertValid(
      "let val = 2; let x : I32 = match (val) { case 1 => 100; case 2 => 200; case 3 => 300; case _ => 0; } x",
      200,
    );
  });
});
