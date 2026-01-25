import { describe, it, expect } from "bun:test";
import { interpret } from "../../src/utils/interpret";

describe("struct destructuring", () => {
  it("supports struct field destructuring", () => {
    const result = interpret(
      'struct Point { x : I32, y : I32 } let { x, y } = Point { x  : 3, y :  4 }; x + y'
    );
    expect(result).toBe(7);
  });
});
