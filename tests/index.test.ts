import { interpret } from "../src";

function expectValid(source: string, exitCode: number) {
  expect(interpret(source)).toBe(exitCode);
}

// function expectInvalid(source: string) {
//   expect(() => interpret(source)).toThrow();
// }

describe("The interpreter can interpret basics", () => {
  test("an empty program", () => {
    expectValid("", 0);
  });

  test("a numeric literal", () => {
    expectValid("100", 100);
  });

  test("a typed numeric literal", () => {
    expectValid("100U8", 100);
  });

  test("binary addition", () => {
    expectValid("1U8 + 2U8", 3);
  });

  test("chained addition", () => {
    expectValid("1U8 + 2U8 + 3U8", 6);
  });

  test("addition and subtraction", () => {
    expectValid("2 + 3 - 4", 1);
  });

  test("multiplication with precedence", () => {
    expectValid("2 * 3 - 4", 2);
  });

  test("addition with multiplication precedence", () => {
    expectValid("2 + 3 * 4", 14);
  });

  test("parentheses grouping", () => {
    expectValid("(2 + 3) * 4", 20);
  });

  test("curly braces grouping", () => {
    expectValid("(2 + { 3 }) * 4", 20);
  });

  test("variable binding with let", () => {
    expectValid("(2 + { let x : U8 = 3; x }) * 4", 20);
  });

  test("top-level let binding", () => {
    expectValid("let z : U8 = (2 + { let x : U8 = 3; x }) * 4; z", 20);
  });

  test("sequential let bindings", () => {
    expectValid(
      "let z : U8 = (2 + { let x : U8 = 3; let b : U8 = x; b }) * 4; let a : U8 = z; a",
      20,
    );
  });

  test("let binding without type annotation", () => {
    expectValid("let x = 100; x", 100);
  });

  test("mutable variable binding and reassignment", () => {
    expectValid("let mut x = 0; x = 100; x", 100);
  });

  test("compound assignment operator +=", () => {
    expectValid("let mut x = 0; x += 3; x", 3);
  });
});

describe("The interpreter can interpret control flow", () => {
  test("boolean literal true", () => {
    expectValid("let x = true; x", 1);
  });

  test("logical AND operator", () => {
    expectValid("let x = true; let y = false; x && y", 0);
  });

  test("logical OR operator", () => {
    expectValid("let x = true; let y = false; x || y", 1);
  });

  test("block-scoped mutable variable mutation", () => {
    expectValid("let mut x = 0; { x = 1; } x", 1);
  });

  test("less-than comparison operator", () => {
    expectValid("let x = 0; let y = 1; x < y", 1);
  });

  test("if-else expression", () => {
    expectValid("let x = if (true) 2 else 3; x", 2);
  });

  test("if-else statement with assignments", () => {
    expectValid("let mut x = 0; if (true) x = 1; else x = 2; x", 1);
  });

  test("if-else with block bodies", () => {
    expectValid("let mut x = 0; if (true) { x = 1; } else { x = 2; } x", 1);
  });

  test("nested if-else expressions", () => {
    expectValid("let x = if (false) 1 else if (false) 2 else 3; x", 3);
  });

  test("nested if-else statements", () => {
    expectValid(
      "let mut x = 0; if (false) { x = 1; } else if (false) { x = 2; } else x = 3; x",
      3,
    );
  });

  test("match expression with case patterns", () => {
    expectValid("let x = match (100) { case 100 => 2; case _ => 3; }; x", 2);
  });
});

describe("The interpreter can interpret loops", () => {
  test("while loop", () => {
    expectValid("let mut x = 0; while (x < 4) x += 1; x", 4);
  });

  test("while loop with block body", () => {
    expectValid("let mut x = 0; while (x < 4) { x += 1; } x", 4);
  });

  test("for loop with range", () => {
    expectValid("let mut sum = 0; for (i in 0..10) sum += i; sum", 45);
  });

  test("for loop with range and block body", () => {
    expectValid("let mut sum = 0; for (i in 0..10) { sum += i; } sum", 45);
  });
});

describe("The interpreter can interpret data", () => {
  test("enum definition and variant access with equality", () => {
    expectValid("enum Color { Red; Green; } Color::Red == Color::Red", 1);
  });

  test("generic function definition and call", () => {
    expectValid("fn pass<T>(value : T) : T => value; pass<I32>(100)", 100);
  });

  test("generic struct definition and instantiation with field access", () => {
    expectValid(
      "struct Wrapper<T> { field : T; } let wrapper : Wrapper<I32> = Wrapper<I32> { 100 }; wrapper.field",
      100,
    );
  });

  test("type alias definition and usage", () => {
    expectValid("type Alias = I32; let temp : Alias = 100; temp", 100);
  });

  test("is operator with I32 type", () => {
    expectValid("100 is I32", 1);
  });

  test("is operator with type alias combination", () => {
    expectValid("(100 is I32) && (100 is I32)", 1);
  });

  test("is operator with type alias", () => {
    expectValid(
      "type Alias = I32; let temp : Alias = 100; (temp is I32) && (temp is Alias)",
      1,
    );
  });

  test("union type and struct instance type checking", () => {
    expectValid(
      "struct Some { value : I32; } struct None {} type Option = Some | None; let temp : Option = Some { 100 }; temp is Some",
      1,
    );
  });

  test("union type with struct field access in if-else", () => {
    expectValid(
      "struct Some { value : I32; } struct None {} type Option = Some | None; let temp : Option = Some { 100 }; if (temp is Some) { temp.value } else { 20 }",
      100,
    );
  });

  test("extension method with this parameter", () => {
    expectValid("fn addOne(this : I32) => this + 1; 100.addOne()", 101);
  });

  test("function definition and call", () => {
    expectValid(
      "fn add(first : I32, second : I32) : I32 => first + second; add(3, 4)",
      7,
    );
  });

  test("array declaration and element access", () => {
    expectValid(
      "let array : [I32; 3; 3] = [1, 2, 3]; array[0] + array[1] + array[2]",
      6,
    );
  });

  test("struct definition and instantiation with field access", () => {
    expectValid(
      "struct Point { x : I32; y : I32; } let temp : Point = Point { 3, 4 }; temp.x + temp.y",
      7,
    );
  });

  test("character literal", () => {
    expectValid("let c : Char = 'a'; c", 97);
  });

  test("string literal and indexing", () => {
    expectValid('let c : *Str = "test"; c[1]', 101);
  });
});

describe("The interpreter can interpret operators", () => {
  test("logical NOT operator", () => {
    expectValid("let x = true; !x", 0);
  });

  test("greater-than comparison operator", () => {
    expectValid("let x = 5; let y = 3; x > y", 1);
  });

  test("greater-than-or-equal comparison operator", () => {
    expectValid("let x = 5; let y = 5; x >= y", 1);
  });

  test("less-than-or-equal comparison operator", () => {
    expectValid("let x = 3; let y = 5; x <= y", 1);
  });

  test("equality comparison operator", () => {
    expectValid("let x = 5; let y = 5; x == y", 1);
  });

  test("not-equal comparison operator", () => {
    expectValid("let x = 5; let y = 3; x != y", 1);
  });

  test("division operator", () => {
    expectValid("let x = 10; let y = 2; x / y", 5);
  });

  test("modulo operator", () => {
    expectValid("let x = 10; let y = 3; x % y", 1);
  });

  test("bitwise AND operator", () => {
    expectValid("let x = 5; let y = 3; x & y", 1);
  });

  test("bitwise OR operator", () => {
    expectValid("let x = 5; let y = 3; x | y", 7);
  });

  test("bitwise XOR operator", () => {
    expectValid("let x = 5; let y = 3; x ^ y", 6);
  });

  test("bitwise left shift operator", () => {
    expectValid("let x = 5; let y = 1; x << y", 10);
  });

  test("bitwise right shift operator", () => {
    expectValid("let x = 10; let y = 1; x >> y", 5);
  });
});
