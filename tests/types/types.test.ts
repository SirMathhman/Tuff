import { describe, it } from "bun:test";
import { assertInterpretValid } from "../test-helpers";

describe("interpret - types - checking and aliases", () => {
  // 'is' operator not yet supported in compiler
  it("supports type check with 'is' operator", () => {
    assertInterpretValid("let temp : I32 = 100; temp is I32", 1);
  });

  it("supports type aliases and type checking", () => {
    assertInterpretValid(
      "type MyAlias = I32; let temp : MyAlias = 100I32; temp is I32 && temp is MyAlias",
      1,
    );
  });

  it("supports union types and type checking", () => {
    assertInterpretValid(
      "type MyUnion = Bool | I32; let temp : MyUnion = 100I32; temp is I32 && temp is MyUnion",
      1,
    );
  });

  it("supports forward type references - type declared after use", () => {
    assertInterpretValid("let x : Temp = 100; type Temp = I32; x", 100);
  });
});

describe("interpret - types - structs", () => {
  // Struct syntax not yet supported in compiler
  it("supports struct declaration and field access", () => {
    assertInterpretValid(
      "struct Wrapper { field : 100 } Wrapper { field : 100 }.field",
      100,
    );
  });

  it("supports method calls on struct instances", () => {
    assertInterpretValid(
      "struct Point { x : 3, y : 4 } fn manhattan(this : Point) : I32 => this.x + this.y; let p = Point { x: 3, y: 4 }; p.manhattan()",
      7,
    );
  });

  // Constructor 'this' returns not yet supported in compiler
  it("supports constructor functions that return struct-like objects", () => {
    assertInterpretValid(
      "fn Wrapper(field : I32) => this; Wrapper(100).field",
      100,
    );
  });
});

describe("interpret - types - arrays", () => {
  // Array syntax not yet supported in compiler
  it("supports typed arrays with indexing", () => {
    assertInterpretValid(
      "let array : [I32; 3; 3] = [1, 2, 3]; array[0] + array[1] + array[2]",
      6,
    );
  });

  it("supports array element assignment", () => {
    assertInterpretValid(
      "let mut array : [I32; 3; 3] = [0, 0, 0]; array[0] = 1; array[1] = 2; array[2] = 3; array[0] + array[1] + array[2]",
      6,
    );
  });

  it("supports array length property", () => {
    assertInterpretValid("let array = [1, 2, 3]; array.length", 3);
  });

  it("supports array init property", () => {
    assertInterpretValid("let array = [1, 2, 3]; array.init", 3);
  });
});

describe("interpret - types - destructors", () => {
  // Destructor syntax not yet supported in compiler
  it("supports type destructors with 'then' clause", () => {
    assertInterpretValid(
      "let mut count = 0; fn drop(this : I32) => count += 1; type MyDroppable = I32 then drop; { let temp : MyDroppable = 100; } count",
      1,
    );
  });

  it("supports type destructors on array elements", () => {
    assertInterpretValid(
      "let mut count = 0; fn drop(this : I32) => count += 1; type MyDroppable = I32 then drop; { let temp : [MyDroppable; 3; 3] = [1, 2, 3]; } count",
      3,
    );
  });

  it("supports type destructors on struct fields", () => {
    assertInterpretValid(
      "let mut count = 0; fn drop(this : MyDroppable) => count += 1; type MyDroppable = I32 then drop; struct Wrapper { field : MyDroppable } { let temp : Wrapper = Wrapper { field : 100 }; } count",
      1,
    );
  });
});
