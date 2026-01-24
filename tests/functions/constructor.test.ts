import { describe, it, expect } from "bun:test";
import { interpret } from "../../src/utils/interpret";

describe("interpret - constructor pattern", () => {
  it("supports function returning this with nested function", () => {
    expect(
      interpret(
        "fn Wrapper(value : I32) => { fn get() => value; this }; Wrapper(100).get()",
      ),
    ).toBe(100);
  });

  it("supports nested functions in function returning this", () => {
    expect(
      interpret(
        "fn getAdder(a : I32) => { fn add(b : I32) => a + b; this }; getAdder(10).add(5)",
      ),
    ).toBe(15);
  });
});
