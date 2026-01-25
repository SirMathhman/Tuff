import { describe } from "bun:test";
import { itBoth } from "../test-helpers";

describe("interpret - control flow - basic", () => {
  itBoth("supports boolean literal true", (assertValid) => {
    assertValid("true", 1);
  });

  itBoth("supports boolean literal false", (assertValid) => {
    assertValid("false", 0);
  });

  itBoth(
    "supports boolean variable declarations with Bool type",
    (assertValid) => {
      assertValid("let x : Bool = true; x", 1);
    },
  );

  itBoth("supports boolean variable with false", (assertValid) => {
    assertValid("let y : Bool = false; y", 0);
  });

  itBoth("supports if-else expression with true condition", (assertValid) => {
    assertValid("if (true) 3 else 4", 3);
  });

  itBoth("supports if-else expression with false condition", (assertValid) => {
    assertValid("if (false) 3 else 4", 4);
  });

  itBoth("supports if-else in variable declaration", (assertValid) => {
    assertValid("let x : I32 = if (true) 3 else 4; x", 3);
  });

  itBoth("supports if-else with arithmetic", (assertValid) => {
    assertValid("if (1 + 1 > 1) 10 else 20", 10);
  });

  itBoth("supports nested if-else-if-else expressions", (assertValid) => {
    assertValid("let x : I32 = if (true) 3 else if (false) 4 else 5; x", 3);
  });

  itBoth("supports match expression with literal pattern", (assertValid) => {
    assertValid(
      "let x : I32 = match (100) { case 100 => 3; case _ => 2; } x",
      3,
    );
  });
});

describe("interpret - control flow - loops", () => {
  itBoth("supports loop expression with break", (assertValid) => {
    assertValid("let x : I32 = loop { break 5; }; x", 5);
  });

  itBoth("supports loop with break inside if condition", (assertValid) => {
    assertValid("let x : I32 = loop { if (true) break 5; }; x", 5);
  });

  itBoth(
    "supports compound assignment and loop with break value",
    (assertValid) => {
      assertValid(
        "let mut i = 0; loop { if (i < 4) i += 1; else break i; }",
        4,
      );
    },
  );

  itBoth("supports while loop with condition and increment", (assertValid) => {
    assertValid("let mut i = 0; while (i < 4) i += 1; i", 4);
  });

  itBoth("supports for-in loop with range", (assertValid) => {
    assertValid("let mut sum = 0; for (let mut i in 0..10) sum += i; sum", 45);
  });
});
