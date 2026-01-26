import { describe } from "bun:test";
import { itBoth } from "../test-helpers";

describe("control flow - booleans", () => {
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
});
