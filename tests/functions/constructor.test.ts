import { describe } from "bun:test";
import { itBoth } from "../test-helpers";

describe("constructor pattern", () => {
  itBoth(
    "supports function returning this with nested function",
    (assertValid) => {
      assertValid(
        "fn Wrapper(value : I32) => { fn get() => value; this }; Wrapper(100).get()",
        100,
      );
    },
  );

  itBoth(
    "supports nested functions in function returning this",
    (assertValid) => {
      assertValid(
        "fn getAdder(a : I32) => { fn add(b : I32) => a + b; this }; getAdder(10).add(5)",
        15,
      );
    },
  );
});
