import { describe, test, expect } from "vitest";
import { interpret } from "../src/interpret";

describe("Struct definition", () => {
  test("Define a simple struct with single field", () => {
    const result = interpret("struct Point { x : I32 }; 5");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(5);
  });

  test("Define a struct with multiple fields", () => {
    const result = interpret("struct Point { x : I32, y : I32 }; 42");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(42);
  });

  test("Define a struct with different types", () => {
    const result = interpret("struct Data { count : I32, rate : F64 }; 10");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(10);
  });

  test("Multiple struct definitions", () => {
    const result = interpret(
      "struct Point { x : I32, y : I32 }; struct Rect { w : I32, h : I32 }; 99"
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(99);
  });
});

describe("Struct instantiation", () => {
  test("Instantiate a struct with literal values", () => {
    const result = interpret(
      "struct Point { x : I32, y : I32 }; let p : Point = Point { 3, 4 }; 7"
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(7);
  });

  test("Instantiate a struct with expression values", () => {
    const result = interpret(
      "struct Point { x : I32, y : I32 }; let p : Point = Point { 1 + 2, 3 * 4 }; 5"
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(5);
  });

  test("Error when instantiating with wrong field count (too few)", () => {
    const result = interpret("struct Point { x : I32, y : I32 }; Point { 3 }");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("field count mismatch");
  });

  test("Error when instantiating with wrong field count (too many)", () => {
    const result = interpret("struct Point { x : I32 }; Point { 3, 4 }");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("field count mismatch");
  });

  test("Error when instantiating undefined struct", () => {
    const result = interpret("Point { 3, 4 }");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Undefined struct");
  });
});

describe("Struct field access", () => {
  test("Access a single field from struct", () => {
    const result = interpret(
      "struct Point { x : I32, y : I32 }; let p : Point = Point { 3, 4 }; p.x"
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(3);
  });

  test("Access multiple fields in sequence", () => {
    const result = interpret(
      "struct Point { x : I32, y : I32 }; let p : Point = Point { 10, 20 }; p.y"
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(20);
  });

  test("Use field access in arithmetic expression", () => {
    const result = interpret(
      "struct Point { x : I32, y : I32 }; let p : Point = Point { 3, 4 }; p.x + p.y"
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(7);
  });

  test("Use field access in multiplication", () => {
    const result = interpret(
      "struct Point { x : I32, y : I32 }; let p : Point = Point { 5, 6 }; p.x * p.y"
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(30);
  });

  test("Error when accessing undefined field", () => {
    const result = interpret(
      "struct Point { x : I32, y : I32 }; let p : Point = Point { 3, 4 }; p.z"
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Undefined field");
  });

  test("Error when accessing field on non-struct variable", () => {
    const result = interpret("let x : I32 = 5; x.field");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Cannot access field");
  });
});

describe("Structs in expressions", () => {
  test("Field access in if condition", () => {
    const result = interpret(
      "struct Point { x : I32 }; let p : Point = Point { 10 }; if (p.x > 5) 100 else 200"
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(100);
  });

  test("Field access in comparison", () => {
    const result = interpret(
      "struct Point { x : I32, y : I32 }; let p : Point = Point { 3, 4 }; p.x == 3"
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(1);
  });

  test("Field access in if with false condition", () => {
    const result = interpret(
      "struct Point { x : I32 }; let p : Point = Point { 3 }; if (p.x > 5) 100 else 200"
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(200);
  });

  test("Complex expression with multiple field accesses", () => {
    const result = interpret(
      "struct Rect { w : I32, h : I32 }; let r : Rect = Rect { 5, 6 }; r.w + r.h * 2"
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(17);
  });
});

describe("Structs with functions", () => {
  test("Pass struct field to function", () => {
    const result = interpret(
      "fn double(x: I32) : I32 => x * 2; struct Point { x : I32 }; let p : Point = Point { 5 }; double(p.x)"
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(10);
  });

  test("Function returning computed struct fields", () => {
    const result = interpret(
      "fn add(x: I32, y: I32) : I32 => x + y; struct Point { x : I32, y : I32 }; let p : Point = Point { 3, 4 }; add(p.x, p.y)"
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(7);
  });
});

describe("Structs with while loop", () => {
  test("Use struct field in while condition", () => {
    const result = interpret(
      `struct Counter { count : I32 };
       let c : Counter = Counter { 3 };
       let mut result : I32 = 0;
       while (c.count > result) {
         result = result + 1;
       };
       result`
    );
    expect(result.ok).toBe(true);
  });
});

describe("Struct edge cases", () => {
  test("Struct with single field instantiation", () => {
    const result = interpret(
      "struct Single { val : I32 }; let s : Single = Single { 42 }; s.val"
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(42);
  });

  test("Struct instantiation with nested expressions", () => {
    const result = interpret(
      "struct Point { x : I32, y : I32 }; let p : Point = Point { if (1 > 0) 5 else 0, 10 }; p.x + p.y"
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(15);
  });

  test("Multiple structs with different field names", () => {
    const result = interpret(
      `struct Point { x : I32, y : I32 };
       struct Rect { width : I32, height : I32 };
       let p : Point = Point { 1, 2 };
       let r : Rect = Rect { 3, 4 };
       p.x + r.width`
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(4);
  });

  test("Struct field with expression using variables", () => {
    const result = interpret(
      "let a : I32 = 5; struct Point { x : I32 }; let p : Point = Point { a * 2 }; p.x"
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(10);
  });
});

describe("Struct arithmetic restrictions", () => {
  test("Error when trying to add struct instances", () => {
    const result = interpret(
      "struct Point { x : I32 }; let p1 : Point = Point { 1 }; let p2 : Point = Point { 2 }; p1 + p2"
    );
    expect(result.ok).toBe(false);
  });

  test("Error when trying to multiply struct with number", () => {
    const result = interpret(
      "struct Point { x : I32 }; let p : Point = Point { 5 }; p * 2"
    );
    expect(result.ok).toBe(false);
  });
});

describe("Struct type annotations", () => {
  test("Struct variable with explicit type annotation", () => {
    const result = interpret(
      "struct Point { x : I32, y : I32 }; let p : Point = Point { 5, 6 }; p.x"
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(5);
  });

  test("Return struct field from block expression", () => {
    const result = interpret(
      "struct Point { x : I32 }; let p : Point = Point { 99 }; { p.x }"
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(99);
  });
});
