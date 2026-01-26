import { describe } from "bun:test";
import { itBoth } from "../test-helpers";

describe("control flow - if-else", () => {
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
});
