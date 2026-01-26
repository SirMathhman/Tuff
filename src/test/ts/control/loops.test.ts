import { describe } from "bun:test";
import { itBoth } from "../test-helpers";

describe("control flow - loops", () => {
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

  itBoth("supports for-in loop with array iteration", (assertValid) => {
    assertValid(
      "let array = [1, 2, 3]; let mut sum = 0; for (let mut element in array) sum += element; sum",
      6,
    );
  });
});
