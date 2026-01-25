import { describe, it } from "bun:test";
import { assertInterpretValid } from "../test-helpers";

describe("interpret - constructor pattern", () => {
  it("supports function returning this with nested function", () => {
    assertInterpretValid(
      "fn Wrapper(value : I32) => { fn get() => value; this }; Wrapper(100).get()",
      100,
    );
  });

  it("supports nested functions in function returning this", () => {
    assertInterpretValid(
      "fn getAdder(a : I32) => { fn add(b : I32) => a + b; this }; getAdder(10).add(5)",
      15,
    );
  });
});
