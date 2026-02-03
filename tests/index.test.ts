import { interpret } from "../src";

function expectValid(source: string, exitCode: number) {
  expect(interpret(source)).toBe(exitCode);
}

function expectInvalid(source: string) {
  expect(() => interpret(source)).toThrow();
}

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

  test("function in block scope can mutate outer variable", () => {
    expectValid("let mut x = 0; fn add() => x += 1; add(); x", 1);
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

  test("while loop with break statement", () => {
    expectValid("let mut x = 0; while (x < 4) { x += 1; break; } x", 1);
  });

  test("while loop with simple continue", () => {
    expectValid("let mut x = 0; while (x < 4) { x += 1; continue; } x", 4);
  });

  test("yield statement in block expression", () => {
    expectValid("let x = { if (true) yield 100; 20 } + 1; x", 101);
  });

  test("function with yield expression in body", () => {
    expectValid(
      "fn get() : I32 => { if (true) yield 100; 20 } + 1; get()",
      101,
    );
  });

  test("function with return statement", () => {
    expectValid(
      "fn get() : I32 => { if (true) return 100; 20 } + 5; get()",
      100,
    );
  });

  test("for loop with range", () => {
    expectValid("let mut sum = 0; for (i in 0..10) sum += i; sum", 45);
  });

  test("for loop with range and block body", () => {
    expectValid("let mut sum = 0; for (i in 0..10) { sum += i; } sum", 45);
  });
});

describe("The interpreter can interpret functions", () => {
  test("function definition and call", () => {
    expectValid(
      "fn add(first : I32, second : I32) : I32 => first + second; add(3, 4)",
      7,
    );
  });

  test("extension method with this parameter", () => {
    expectValid("fn addOne(this : I32) => this + 1; 100.addOne()", 101);
  });

  test("function reference assignment and call", () => {
    expectValid(
      "let mut x = 0; fn add() : Void => x += 1; let temp : () => Void = add; temp(); x",
      1,
    );
  });

  test("function returning function reference", () => {
    expectValid(
      "let mut x = 0; fn add() : Void => x += 1; fn get() : () => Void => add; get()(); x",
      1,
    );
  });

  test("function parameter with function type and inline function argument", () => {
    expectValid("fn get0(get : () => I32) => get() + 1; get0(() => 100)", 101);
  });

  test("module definition and function call", () => {
    expectValid("module MyModule { fn get() => 100; } MyModule::get()", 100);
  });

  test("pointer reference and dereference", () => {
    expectValid("let x = 100; let y : *I32 = &x; *y", 100);
  });

  test("mutable pointer reference, dereference, and assignment", () => {
    expectValid("let mut x = 0; let y : *mut I32 = &mut x; *y = 100; x", 100);
  });
});

describe("The interpreter can interpret data: enums and generics", () => {
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
});

describe("The interpreter can interpret data: type aliases and is", () => {
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
});

describe("The interpreter can interpret data: unions", () => {
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

  test("union type pattern matching with struct variant matching", () => {
    expectValid(
      "struct Some { value : I32; } struct None {} type Option = Some | None; let temp : Option = Some { 100 }; match (temp) { case Some => temp.value; case None => 20; }",
      100,
    );
  });

  test("union type pattern matching with destructuring", () => {
    expectValid(
      "struct Some { value : I32; } struct None {} type Option = Some | None; let temp : Option = Some { 100 }; match (temp) { case Some { value } => value; case None => 20; }",
      100,
    );
  });

  test("is operator with destructuring pattern", () => {
    expectValid(
      "struct Some { value : I32; } struct None {} type Option = Some | None; let temp : Option = Some { 100 }; if (temp is Some { value }) value else 20",
      100,
    );
  });
});

describe("The interpreter can interpret collections: arrays", () => {
  test("array declaration and element access", () => {
    expectValid(
      "let array : [I32; 3; 3] = [1, 2, 3]; array[0] + array[1] + array[2]",
      6,
    );
  });

  test("array slicing with pointer reference and indexed dereference", () => {
    expectValid(
      "let array : [I32; 3; 3] = [1, 2, 3]; let slice : *[I32; 2; 2] = &array[0..2]; slice[0] + slice[1]",
      3,
    );
  });

  test("mutable array slicing with pointer reference, indexed assignment, and original array mutation", () => {
    expectValid(
      "let mut array : [I32; 3; 3] = [1, 2, 3]; let mut slice : *mut [I32; 2; 2] = &mut array[0..2]; slice[1] = 100; array[1]",
      100,
    );
  });

  test("mutable array slicing with non-zero starting index", () => {
    expectValid(
      "let mut array : [I32; 3; 3] = [1, 2, 3]; let mut slice : *mut [I32; 2; 2] = &mut array[1..3]; slice[1] = 100; array[1]",
      2,
    );
  });
});

describe("The interpreter can interpret structures and literals", () => {
  test("struct definition and instantiation with field access", () => {
    expectValid(
      "struct Point { x : I32; y : I32; } let temp : Point = Point { 3, 4 }; temp.x + temp.y",
      7,
    );
  });
  test("variable destructuring in let binding", () => {
    expectValid(
      "struct Wrapper { value : I32; } let { value } = Wrapper { 100 }; value",
      100,
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

describe("Boolean and Comparison Semantics", () => {
  describe("Boolean literals and negation", () => {
    test("boolean literal false", () => {
      expectValid("let x = false; x", 0);
    });

    test("negation of false", () => {
      expectValid("!false", 1);
    });

    test("negation of true", () => {
      expectValid("!true", 0);
    });

    test("double negation of true", () => {
      expectValid("!!true", 1);
    });

    test("triple negation of true", () => {
      expectValid("!!!true", 0);
    });

    test("boolean false in arithmetic", () => {
      expectValid("false + 5", 5);
    });

    test("boolean true in arithmetic", () => {
      expectValid("true + 5", 6);
    });
  });

  describe("Logical AND semantics", () => {
    test("both true", () => {
      expectValid("true && true", 1);
    });

    test("both false", () => {
      expectValid("false && false", 0);
    });

    test("left true, right false", () => {
      expectValid("true && false", 0);
    });

    test("left false, right true", () => {
      expectValid("false && true", 0);
    });

    test("numeric truthy values", () => {
      expectValid("5 && 3", 1);
    });

    test("numeric with zero on left", () => {
      expectValid("0 && 5", 0);
    });

    test("numeric with zero on right", () => {
      expectValid("5 && 0", 0);
    });

    test("both zero", () => {
      expectValid("0 && 0", 0);
    });

    test("AND with comparison results", () => {
      expectValid("(5 > 3) && (2 < 4)", 1);
    });

    test("AND with one false comparison", () => {
      expectValid("(5 > 10) && (2 < 4)", 0);
    });

    test("AND short-circuit behavior value", () => {
      expectValid("let x = false; (x && (3 + 5)) == 0", 1);
    });
  });

  describe("Logical OR semantics", () => {
    test("both true", () => {
      expectValid("true || true", 1);
    });

    test("both false", () => {
      expectValid("false || false", 0);
    });

    test("left true, right false", () => {
      expectValid("true || false", 1);
    });

    test("left false, right true", () => {
      expectValid("false || true", 1);
    });

    test("numeric truthy values", () => {
      expectValid("5 || 3", 1);
    });

    test("zero on left with truthy right", () => {
      expectValid("0 || 5", 1);
    });

    test("truthy left with zero on right", () => {
      expectValid("5 || 0", 1);
    });

    test("both zero", () => {
      expectValid("0 || 0", 0);
    });

    test("OR with comparison results", () => {
      expectValid("(5 < 3) || (2 < 4)", 1);
    });

    test("OR with both false comparisons", () => {
      expectValid("(5 < 3) || (2 > 4)", 0);
    });
  });

  describe("Comparison operators", () => {
    test("equality same numbers", () => {
      expectValid("0 == 0", 1);
    });

    test("inequality same numbers", () => {
      expectValid("0 != 0", 0);
    });

    test("negative number comparison", () => {
      expectValid("-5 < -3", 1);
    });

    test("negative to positive comparison", () => {
      expectValid("-5 < 3", 1);
    });

    test("large number equality", () => {
      expectValid("999999 == 999999", 1);
    });

    test("less-than with equal numbers", () => {
      expectValid("5 < 5", 0);
    });

    test("greater-than with equal numbers", () => {
      expectValid("5 > 5", 0);
    });

    test("less-than-or-equal equal numbers", () => {
      expectValid("5 <= 5", 1);
    });

    test("greater-than-or-equal equal numbers", () => {
      expectValid("5 >= 5", 1);
    });

    test("chained comparisons left-to-right", () => {
      expectValid("1 < 2 < 3", 1);
    });
  });

  describe("Operator precedence and combinations", () => {
    test("AND has higher precedence than OR", () => {
      expectValid("true && false || true", 1);
    });

    test("AND higher precedence than OR variant 2", () => {
      expectValid("false || true && false", 0);
    });

    test("NOT has highest precedence", () => {
      expectValid("!true || true", 1);
    });

    test("negated AND expression", () => {
      expectValid("!(true && false)", 1);
    });

    test("comparison in OR", () => {
      expectValid("(5 > 10) || (3 < 5)", 1);
    });

    test("comparison in AND", () => {
      expectValid("(5 > 3) && (3 < 5)", 1);
    });

    test("mixed operators with negation", () => {
      expectValid("!(5 > 10) && (3 < 5)", 1);
    });

    test("boolean in if expression", () => {
      expectValid("if (true && true) 42 else 0", 42);
    });

    test("boolean assignment and use", () => {
      expectValid("let x = (5 > 3); x", 1);
    });

    test("mutable boolean reassignment", () => {
      expectValid("let mut x = true; x = false; x", 0);
    });
  });

  describe("Type interactions", () => {
    test("typed literal equality", () => {
      expectValid("100U8 == 100I32", 1);
    });

    test("typed literal comparison", () => {
      expectValid("100U8 < 150I32", 1);
    });

    test("comparison result in arithmetic", () => {
      expectValid("(5 > 3) + 5", 6);
    });

    test("boolean AND result in arithmetic", () => {
      expectValid("(true && false) + 10", 10);
    });

    test("boolean OR result in arithmetic", () => {
      expectValid("(true || false) + 10", 11);
    });

    test("negation result in arithmetic", () => {
      expectValid("!false + 5", 6);
    });

    test("comparison in let with type annotation", () => {
      expectValid("let x : I32 = (5 > 3); x", 1);
    });
  });

  describe("Error cases: undefined variables", () => {
    test("undefined variable in comparison", () => {
      expectInvalid("x > 5");
    });

    test("undefined variable in AND", () => {
      expectInvalid("undefined && true");
    });

    test("undefined variable in OR", () => {
      expectInvalid("missingVar || false");
    });

    test("undefined variable in negation", () => {
      expectInvalid("!unknown");
    });

    test("undefined in let binding comparison", () => {
      expectInvalid("let x = (y > 5); x");
    });

    test("variable undefined after block scope", () => {
      expectInvalid("{ let x = 5; } x > 3");
    });
  });

  describe("Complex boolean expressions", () => {
    test("nested logical operators", () => {
      expectValid("(true && (false || true)) || false", 1);
    });

    test("multiple negations", () => {
      expectValid("!(!(true))", 1);
    });

    test("boolean with comparison chains", () => {
      expectValid("(1 < 2) && (2 < 3) && (3 < 4)", 1);
    });

    test("mixed comparisons in AND", () => {
      expectValid("(5 > 3) && (5 == 5) && (5 >= 5)", 1);
    });

    test("boolean variable in multiple operations", () => {
      expectValid("let x = true; let y = false; (x || y) && x", 1);
    });

    test("boolean in loop condition", () => {
      expectValid("let mut x = 0; while (x < 5 && x != 3) x += 1; x", 3);
    });

    test("boolean in if-else chain", () => {
      expectValid("let x = 5; if (x > 10) 1 else if (x > 3) 2 else 3", 2);
    });
  });
});

describe("Numerical Literal Semantics: Number Bases", () => {
  test("decimal literal zero", () => {
    expectValid("0", 0);
  });

  test("decimal literal single digit", () => {
    expectValid("5", 5);
  });

  test("decimal literal multi-digit", () => {
    expectValid("12345", 12345);
  });

  test("hexadecimal literal basic", () => {
    expectValid("0x10", 16);
  });

  test("hexadecimal literal uppercase", () => {
    expectValid("0xFF", 255);
  });

  test("hexadecimal literal lowercase", () => {
    expectValid("0xdeadbeef", 0xdeadbeef);
  });

  test("hexadecimal literal zero", () => {
    expectValid("0x0", 0);
  });

  test("octal literal basic", () => {
    expectValid("0o10", 8);
  });

  test("octal literal max digit", () => {
    expectValid("0o777", 511);
  });

  test("octal literal zero", () => {
    expectValid("0o0", 0);
  });

  test("binary literal basic", () => {
    expectValid("0b10", 2);
  });

  test("binary literal all ones", () => {
    expectValid("0b1111", 15);
  });

  test("binary literal zero", () => {
    expectValid("0b0", 0);
  });

  test("binary literal large", () => {
    expectValid("0b11111111", 255);
  });
});

describe("Numerical Literal Semantics: Type Suffixes", () => {
  test("decimal with U8 suffix", () => {
    expectValid("100U8", 100);
  });

  test("decimal with I32 suffix", () => {
    expectValid("42I32", 42);
  });

  test("hexadecimal with U8 suffix", () => {
    expectValid("0xFFU8", 255);
  });

  test("hexadecimal with I32 suffix", () => {
    expectValid("0xDEADBEEFI32", 0xdeadbeef);
  });

  test("octal with U8 suffix", () => {
    expectValid("0o377U8", 255);
  });

  test("octal with I32 suffix", () => {
    expectValid("0o1000I32", 512);
  });

  test("binary with U8 suffix", () => {
    expectValid("0b11111111U8", 255);
  });

  test("binary with I32 suffix", () => {
    expectValid("0b11110000I32", 240);
  });

  test("zero with type suffix U8", () => {
    expectValid("0U8", 0);
  });

  test("zero with type suffix I32", () => {
    expectValid("0I32", 0);
  });

  test("single digit with type suffix", () => {
    expectValid("7U8", 7);
  });

  test("type suffix applies correctly in expression", () => {
    expectValid("100U8 + 50U8", 150);
  });
});

describe("Numerical Literal Semantics: Negative Numbers", () => {
  test("negative decimal literal", () => {
    expectValid("-42", -42);
  });

  test("negative zero", () => {
    expectValid("-0", 0);
  });

  test("negative single digit", () => {
    expectValid("-5", -5);
  });

  test("negative hexadecimal", () => {
    expectValid("-0xFF", -255);
  });

  test("negative octal", () => {
    expectValid("-0o10", -8);
  });

  test("negative binary", () => {
    expectValid("-0b1010", -10);
  });

  test("negative with type suffix", () => {
    expectValid("-42I32", -42);
  });

  test("negative hexadecimal with type suffix", () => {
    expectValid("-0xFFU8", -255);
  });

  test("double negation", () => {
    expectValid("--5", 5);
  });

  test("triple negation", () => {
    expectValid("---5", -5);
  });

  test("negative in arithmetic expression", () => {
    expectValid("-10 + 20", 10);
  });

  test("negative in let binding", () => {
    expectValid("let x = -42; x", -42);
  });

  test("negative in comparison", () => {
    expectValid("-5 < 0", 1);
  });
});

describe("Numerical Literal Semantics: Type Coercion", () => {
  test("same type addition", () => {
    expectValid("100I32 + 50I32", 150);
  });

  test("narrow type with wide type promotes to wide", () => {
    expectValid("100U8 + 150I32", 250);
  });

  test("wide type with narrow type promotes to wide", () => {
    expectValid("150I32 + 100U8", 250);
  });

  test("untyped literal with typed literal", () => {
    expectValid("100 + 50I32", 150);
  });

  test("multiple untyped literals", () => {
    expectValid("100 + 50 + 25", 175);
  });

  test("untyped literal in let binding with type", () => {
    expectValid("let x : I32 = 100; x", 100);
  });

  test("type suffix enforces specific type", () => {
    expectValid("let x : U8 = 100U8; x", 100);
  });

  test("operation with consistent types", () => {
    expectValid("(10U8 + 20U8) * 2U8", 60);
  });

  test("mixed bases with same type", () => {
    expectValid("0xFFU8 + 0b1U8", 256);
  });

  test("negation preserves type in coercion", () => {
    expectValid("-42I32 + 10I32", -32);
  });
});

describe("Let and Mut Semantics", () => {
  describe("Immutability enforcement", () => {
    test("mutable variable can be reassigned", () => {
      expectValid("let mut x = 0; x = 42; x", 42);
    });

    test("immutable variable cannot be reassigned", () => {
      expectInvalid("let x = 0; x = 42; x");
    });

    test("attempt to reassign immutable let when already bound", () => {
      expectInvalid("let x = 5; x = 10; x");
    });

    test("mut keyword required to enable reassignment", () => {
      expectInvalid("let x = 1; x += 5; x");
    });

    test("compound assignment on immutable fails", () => {
      expectInvalid("let x = 10; x -= 5; x");
    });
  });

  describe("Scoping and no-shadowing", () => {
    test("variable scoped to block is not accessible outside", () => {
      expectInvalid("{ let x = 5; } x");
    });

    test("nested block can access outer scope variable", () => {
      expectValid("let x = 5; { x }", 5);
    });

    test("mutable variable in outer scope mutated in inner block", () => {
      expectValid("let mut x = 5; { x = 10; } x", 10);
    });

    test("shadowing in same scope is not allowed", () => {
      expectInvalid("let x = 0; let x = 0; x");
    });

    test("shadowing with different names in same scope is allowed", () => {
      expectValid("let x = 5; let y = 10; x + y", 15);
    });

    test("variable from outer scope preserved after inner block", () => {
      expectValid("let x = 5; { let y = 10; } x", 5);
    });

    test("in nested scopes, inner scope bindings do not affect outer", () => {
      expectValid("let x = 5; { let y = 10; y } x", 5);
    });

    test("nested blocks cannot shadow outer in same declaration block", () => {
      expectInvalid("let x = 1; { let x = 2; x }");
    });
  });

  describe("Type interactions with let/mut", () => {
    test("let with explicit type annotation", () => {
      expectValid("let x : I32 = 100; x", 100);
    });

    test("let with type annotation and reassignment (mut)", () => {
      expectValid("let mut x : I32 = 100; x = 200; x", 200);
    });

    test("let type inference from literal", () => {
      expectValid("let x = 42; x", 42);
    });

    test("mut type inference from literal with reassignment", () => {
      expectValid("let mut x = 42; x = 99; x", 99);
    });

    test("let with typed literal suffix", () => {
      expectValid("let x = 100U8; x", 100);
    });

    test("let mut with type coercion on reassignment", () => {
      expectValid("let mut x : I32 = 10U8; x = 20; x", 20);
    });

    test("multiple type annotations in sequence", () => {
      expectValid("let x : I32 = 10; let y : I32 = 20; x + y", 30);
    });

    test("type inference from binary operation", () => {
      expectValid("let x = 10 + 20; x", 30);
    });
  });

  describe("Let/mut in control flow", () => {
    test("let binding in if expression", () => {
      expectValid("let x = if (true) 42 else 0; x", 42);
    });

    test("mutable binding in loop with reassignment", () => {
      expectValid("let mut sum = 0; for (i in 0..5) sum += i; sum", 10);
    });

    test("let binding in function parameter does not shadow outer let", () => {
      expectValid("let x = 5; fn getId(x : I32) => x; getId(10)", 10);
    });

    test("function local let does not affect outer let", () => {
      expectValid("let x = 5; fn test() => { let x = 10; x }; test(); x", 5);
    });

    test("mutable binding in function modifying outer mutable", () => {
      expectValid("let mut x = 0; fn add() => x += 1; add(); x", 1);
    });

    test("let in while loop condition and body", () => {
      expectValid("let mut x = 0; while (x < 5) x += 1; x", 5);
    });
  });

  describe("Let/mut edge cases", () => {
    test("let binding uses value at binding time", () => {
      expectValid("let x = 10; let y = x; x", 10);
    });

    test("mut binding preserves previous value until reassignment", () => {
      expectValid("let mut x = 10; let y = x; x = 20; y", 10);
    });

    test("reassignment does not affect previous bindings", () => {
      expectValid("let mut x = 5; let y = x; x = 10; (y + x)", 15);
    });

    test("multiple sequential let bindings", () => {
      expectValid("let a = 1; let b = 2; let c = 3; a + b + c", 6);
    });

    test("let and mut can coexist", () => {
      expectValid("let x = 5; let mut y = 10; y = 15; x + y", 20);
    });

    test("reassignment to same value is allowed", () => {
      expectValid("let mut x = 42; x = 42; x", 42);
    });
  });
});

describe("Numerical Literal Semantics: Edge Cases & Boundaries", () => {
  test("U8 minimum value", () => {
    expectValid("0U8", 0);
  });

  test("U8 maximum value", () => {
    expectValid("255U8", 255);
  });

  test("I32 positive maximum", () => {
    expectValid("2147483647I32", 2147483647);
  });

  test("I32 negative minimum", () => {
    expectValid("-2147483648I32", -2147483648);
  });

  test("binary all zeros", () => {
    expectValid("0b0", 0);
  });

  test("binary all ones byte", () => {
    expectValid("0b11111111", 255);
  });

  test("octal all zeros", () => {
    expectValid("0o0", 0);
  });

  test("octal all sevens", () => {
    expectValid("0o7777", 4095);
  });

  test("hexadecimal all zeros", () => {
    expectValid("0x0", 0);
  });

  test("hexadecimal all F's", () => {
    expectValid("0xFFFFFFFF", 4294967295);
  });

  test("decimal one", () => {
    expectValid("1", 1);
  });

  test("large decimal number", () => {
    expectValid("999999999", 999999999);
  });

  test("leading zero octal interpretation", () => {
    expectValid("0o10", 8);
  });

  test("single bit binary", () => {
    expectValid("0b1", 1);
  });

  test("power of two in hex", () => {
    expectValid("0x100", 256);
  });

  test("max U8 in octal", () => {
    expectValid("0o377U8", 255);
  });

  test("zero appears same in all bases", () => {
    expectValid("0 == 0x0 && 0x0 == 0o0 && 0o0 == 0b0", 1);
  });
});
