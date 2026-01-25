import { describe, it, expect } from "bun:test";
import { interpret } from "../../src/utils/interpret";

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

  it("supports constructor functions that return struct-like objects", () => {
    expect(
      interpret("fn Wrapper(field : I32) => this; Wrapper(100).field"),
    ).toBe(100);
  });

  it("supports typed arrays with indexing", () => {
    expect(
      interpret(
        "let array : [I32; 3; 3] = [1, 2, 3]; array[0] + array[1] + array[2]",
      ),
    ).toBe(6);
  });

  it("supports array element assignment", () => {
    expect(
      interpret(
        "let mut array : [I32; 3; 3] = [0, 0, 0]; array[0] = 1; array[1] = 2; array[2] = 3; array[0] + array[1] + array[2]",
      ),
    ).toBe(6);
  });

  it("supports array length property", () => {
    expect(interpret("let array = [1, 2, 3]; array.length")).toBe(3);
  });

  it("supports array init property", () => {
    expect(interpret("let array = [1, 2, 3]; array.init")).toBe(3);
  });

  it("supports forward type references - type declared after use", () => {
    expect(interpret("let x : Temp = 100; type Temp = I32; x")).toBe(100);
  });

  it("supports type destructors with 'then' clause", () => {
    expect(
      interpret(
        "let mut count = 0; fn drop(this : I32) => count += 1; type MyDroppable = I32 then drop; { let temp : MyDroppable = 100; } count",
      ),
    ).toBe(1);
  });

  it("supports type destructors on array elements", () => {
    expect(
      interpret(
        "let mut count = 0; fn drop(this : I32) => count += 1; type MyDroppable = I32 then drop; { let temp : [MyDroppable; 3; 3] = [1, 2, 3]; } count",
      ),
    ).toBe(3);
  });
});
