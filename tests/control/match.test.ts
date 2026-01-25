import { describe } from "bun:test";
import { itBoth } from "../test-helpers";

describe("interpret - control flow - match", () => {
  itBoth("supports match expression with literal pattern", (assertValid) => {
    assertValid(
      "let x : I32 = match (100) { case 100 => 3; case _ => 2; } x",
      3,
    );
  });
});
