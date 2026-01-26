import { describe } from "bun:test";
import { itBoth, itInterpreter } from "../test-helpers";

describe("types - checking and aliases", () => {
  itBoth("supports type check with 'is' operator", (assertValid) => {
    assertValid("let temp : I32 = 100; temp is I32", 1);
  });

  itBoth("supports type aliases and type checking", (assertValid) => {
    assertValid(
      "type MyAlias = I32; let temp : MyAlias = 100I32; temp is I32 && temp is MyAlias",
      1,
    );
  });

  itBoth("supports union types and type checking", (assertValid) => {
    assertValid(
      "type MyUnion = Bool | I32; let temp : MyUnion = 100I32; temp is I32 && temp is MyUnion",
      1,
    );
  });

  itBoth(
    "supports forward type references - type declared after use",
    (assertValid) => {
      assertValid("let x : Temp = 100; type Temp = I32; x", 100);
    },
  );
});

describe("types - structs", () => {
  itBoth("supports struct declaration and field access", (assertValid) => {
    assertValid(
      "struct Wrapper { field : 100 } Wrapper { field : 100 }.field",
      100,
    );
  });

  itBoth("supports method calls on struct instances", (assertValid) => {
    assertValid(
      "struct Point { x : 3, y : 4 } fn manhattan(this : Point) : I32 => this.x + this.y; let p = Point { x: 3, y: 4 }; p.manhattan()",
      7,
    );
  });

  // Constructor 'this' returns not supported in compiler
  itInterpreter(
    "supports constructor functions that return struct-like objects",
    (ok) => {
      ok("fn Wrapper(field : I32) => this; Wrapper(100).field", 100);
    },
  );
});

describe("types - arrays", () => {
  itBoth("supports typed arrays with indexing", (assertValid) => {
    assertValid(
      "let array : [I32; 3; 3] = [1, 2, 3]; array[0] + array[1] + array[2]",
      6,
    );
  });

  itBoth("supports array element assignment", (assertValid) => {
    assertValid(
      "let mut array : [I32; 3; 3] = [0, 0, 0]; array[0] = 1; array[1] = 2; array[2] = 3; array[0] + array[1] + array[2]",
      6,
    );
  });

  itBoth("supports array length property", (assertValid) => {
    assertValid("let array = [1, 2, 3]; array.length", 3);
  });

  itBoth("supports array init property", (ok) => {
    ok("let array = [1, 2, 3]; array.init", 3);
  });

  itBoth(
    "supports array element mutation and retrieval",
    (assertValid) => {
      assertValid(
        "let mut myArray = [0]; myArray[0] = 100; myArray[0]",
        100,
      );
    },
  );
});

// Destructor syntax not supported in compiler
describe("types - destructors", () => {
  itInterpreter("supports type destructors with 'then' clause", (ok) => {
    ok(
      "let mut count = 0; fn drop(this : I32) => count += 1; type MyDroppable = I32 then drop; { let temp : MyDroppable = 100; } count",
      1,
    );
  });

  itInterpreter("supports type destructors on array elements", (ok) => {
    ok(
      "let mut count = 0; fn drop(this : I32) => count += 1; type MyDroppable = I32 then drop; { let temp : [MyDroppable; 3; 3] = [1, 2, 3]; } count",
      3,
    );
  });

  itInterpreter("supports type destructors on struct fields", (ok) => {
    ok(
      "let mut count = 0; fn drop(this : MyDroppable) => count += 1; type MyDroppable = I32 then drop; struct Wrapper { field : MyDroppable } { let temp : Wrapper = Wrapper { field : 100 }; } count",
      1,
    );
  });
});
