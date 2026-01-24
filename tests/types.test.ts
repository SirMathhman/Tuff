import { describe, it, expect } from "bun:test";
import { interpret } from "../src/utils/interpret";

describe("interpret - types", () => {
  it("supports type check with 'is' operator", () => {
    expect(interpret("let temp : I32 = 100; temp is I32")).toBe(1);
  });

  it("supports type aliases and type checking", () => {
    expect(
      interpret(
        "type MyAlias = I32; let temp : MyAlias = 100I32; temp is I32 && temp is MyAlias",
      ),
    ).toBe(1);
  });

  it("supports union types and type checking", () => {
    expect(
      interpret(
        "type MyUnion = Bool | I32; let temp : MyUnion = 100I32; temp is I32 && temp is MyUnion",
      ),
    ).toBe(1);
  });

  it("supports struct declaration and field access", () => {
    expect(
      interpret("struct Wrapper { field : 100 } Wrapper { field : 100 }.field"),
    ).toBe(100);
  });

  it("supports method calls on struct instances", () => {
    expect(
      interpret(
        "struct Point { x : 3, y : 4 } fn manhattan(this : Point) : I32 => this.x + this.y; let p = Point { x: 3, y: 4 }; p.manhattan()",
      ),
    ).toBe(7);
  });
});
