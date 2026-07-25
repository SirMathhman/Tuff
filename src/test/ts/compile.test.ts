import { test } from "bun:test";
import {
  expectValid,
  expectInvalid,
  expectValidWithModules,
} from "./test-helpers";

test("An empty program", () => {
  expectValid("", [], 0);
});

test("An invalid program", () => {
  expectInvalid("~");
});

test("A single numeric literal", () => {
  expectValid("42", [], 42);
});

test("Zero literal", () => {
  expectValid("0", [], 0);
});

test("Large integer literal", () => {
  expectValid("999999", [], 999999);
});

test("Numeric literal with whitespace", () => {
  expectValid("  42  ", [], 42);
});

test("Non-numeric text is invalid", () => {
  expectInvalid("hello!");
});

test("Let declaration with exit", () => {
  expectValid("let x = 42; x", [], 42);
});

test("Let declaration with zero", () => {
  expectValid("let x = 0; x", [], 0);
});

test("Let declaration without exit expression", () => {
  expectValid("let x = 42;", [], 0);
});

test("Multiple let declarations", () => {
  expectValid("let x = 1; let y = 99; y", [], 99);
});

test("Let with variable initializer", () => {
  expectValid("let x = 10; let y = x; y", [], 10);
});

test("Let missing initializer is invalid", () => {
  expectInvalid("let x; x");
});

test("Let missing semicolon is invalid", () => {
  expectInvalid("let x = 42 x");
});

test("Let mut declaration with reassignment", () => {
  expectValid("let mut x = 42; x = 10; x", [], 10);
});

test("Let mut declaration without reassignment", () => {
  expectValid("let mut x = 42; x", [], 42);
});

test("Let mut with variable reassignment", () => {
  expectValid("let mut x = 1; let y = 2; x = y; x", [], 2);
});

test("Reassigning immutable variable is invalid", () => {
  expectInvalid("let x = 42; x = 10; x");
});

test("Reassigning undeclared variable is invalid", () => {
  expectInvalid("x = 10;");
});

test("Using undeclared variable in expression is invalid", () => {
  expectInvalid("let y = x;");
});

test("Redeclaring variable is valid (shadowing)", () => {
  expectValid("let x = 42; let x = 10; x", [], 10);
});

test("Let mut missing semicolon is invalid", () => {
  expectInvalid("let mut x = 42 x");
});

test("Let mut missing initializer is invalid", () => {
  expectInvalid("let mut x;");
});

// --- Type Annotations ---

test("Typed literal with matching annotation", () => {
  expectValid("let x : U8 = 100U8; x", [], 100);
});

test("Typed literal U32", () => {
  expectValid("let x : U32 = 42U32; x", [], 42);
});

test("Typed literal I32", () => {
  expectValid("let x : I32 = 42I32; x", [], 42);
});

test("Typed literal I64", () => {
  expectValid("let x : I64 = 42I64; x", [], 42);
});

test("Typed literal U64", () => {
  expectValid("let x : U64 = 42U64; x", [], 42);
});

test("Typed literal U16", () => {
  expectValid("let x : U16 = 42U16; x", [], 42);
});

test("Typed literal I8", () => {
  expectValid("let x : I8 = 42I8; x", [], 42);
});

test("Typed literal I16", () => {
  expectValid("let x : I16 = 42I16; x", [], 42);
});

test("Typed literal U64", () => {
  expectValid("let x : U64 = 42U64; x", [], 42);
});

test("Typed literal with mismatched annotation is invalid", () => {
  expectInvalid("let x : U8 = 100U32;");
});

test("Typed literal without annotation is invalid", () => {
  expectInvalid("let x : U8 = 100;");
});

test("Typed literal without suffix is invalid", () => {
  expectInvalid("let x = 100U8;");
});

test("Typed variable assignment with matching types", () => {
  expectValid("let x : U8 = 10U8; let y : U8 = x; y", [], 10);
});

test("Typed variable assignment with mismatched types is invalid", () => {
  expectInvalid("let x : U8 = 10U8; let y : U32 = x;");
});

test("Untyped literal in expression", () => {
  expectValid("42", [], 42);
});

test("Typed literal in exit expression", () => {
  expectValid("100U8", [], 100);
});

test("Invalid type name is invalid", () => {
  expectInvalid("let x : InvalidType = 42U8;");
});

test("Typed mutable variable with reassignment", () => {
  expectValid("let mut x : U8 = 10U8; x = 20U8; x", [], 20);
});

test("Typed mutable reassignment with type mismatch is invalid", () => {
  expectInvalid("let mut x : U8 = 10U8; x = 20U32;");
});

// --- Struct Tests ---

test("Struct definition with instantiation", () => {
  expectValid(
    "struct Point { x : I32, y : I32 }; let p : Point = Point { x: 100I32, y: 200I32 }; p.x",
    [],
    100,
  );
});

test("Struct instantiation without type annotation", () => {
  expectValid(
    "struct Point { x : I32, y : I32 }; let p = Point { x: 42I32, y: 0I32 }; p.x",
    [],
    42,
  );
});

test("Struct field access second field", () => {
  expectValid(
    "struct Point { x : I32, y : I32 }; let p : Point = Point { x: 10I32, y: 99I32 }; p.y",
    [],
    99,
  );
});

test("Struct field reassignment with mut", () => {
  expectValid(
    "struct Point { x : I32, y : I32 }; let mut p : Point = Point { x: 1I32, y: 2I32 }; p.x = 42I32; p.x",
    [],
    42,
  );
});

test("Struct field reassignment without mut is invalid", () => {
  expectInvalid(
    "struct Point { x : I32, y : I32 }; let p : Point = Point { x: 1I32, y: 2I32 }; p.x = 42I32;",
  );
});

test("Struct field assignment type mismatch is invalid", () => {
  expectInvalid(
    "struct Point { x : I32, y : I32 }; let mut p : Point = Point { x: 1I32, y: 2I32 }; p.x = 42U8;",
  );
});

test("Struct with undefined struct name is invalid", () => {
  expectInvalid("let p : Point = Point { x: 1I32 };");
});

test("Struct with missing field is invalid", () => {
  expectInvalid(
    "struct Point { x : I32, y : I32 }; let p : Point = Point { x: 1I32 };",
  );
});

test("Struct with extra field is invalid", () => {
  expectInvalid(
    "struct Point { x : I32 }; let p : Point = Point { x: 1I32, y: 2I32 };",
  );
});

test("Struct field type mismatch is invalid", () => {
  expectInvalid(
    "struct Point { x : I32, y : I32 }; let p : Point = Point { x: 1U8, y: 2I32 };",
  );
});

test("Struct with untyped field is invalid", () => {
  expectInvalid("struct Point { x, y : I32 };");
});

test("Nested struct member access", () => {
  expectValid(
    "struct Inner { v : I32 }; struct Outer { inner : Inner }; let o : Outer = Outer { inner: Inner { v: 77I32 } }; o.inner.v",
    [],
    77,
  );
});

test("Nested struct field reassignment", () => {
  expectValid(
    "struct Inner { v : I32 }; struct Outer { inner : Inner }; let mut o : Outer = Outer { inner: Inner { v: 1I32 } }; o.inner.v = 55I32; o.inner.v",
    [],
    55,
  );
});

test("Struct used as exit expression", () => {
  expectValid(
    "struct Point { x : I32, y : I32 }; let p : Point = Point { x: 42I32, y: 0I32 }; p",
    [],
    0,
  );
});

test("Struct definition without usage is valid", () => {
  expectValid("struct Point { x : I32, y : I32 }; 42", [], 42);
});

test("Struct with single field", () => {
  expectValid(
    "struct Count { n : U8 }; let c : Count = Count { n: 255U8 }; c.n",
    [],
    255,
  );
});

test("Struct with Bool field", () => {
  expectValid(
    "struct Flags { active : Bool, count : I32 }; let f : Flags = Flags { active: true, count: 42I32 }; f.active",
    [],
    1,
  );
});

test("Struct with Bool field false value", () => {
  expectValid(
    "struct Flags { active : Bool }; let f : Flags = Flags { active: false }; f.active",
    [],
    0,
  );
});

test("Struct instantiation with wrong struct type is invalid", () => {
  expectInvalid(
    "struct Point { x : I32, y : I32 }; struct Color { r : U8, g : U8, b : U8 }; let p : Point = Color { r: 1U8, g: 2U8, b: 3U8 };",
  );
});

// --- Generic Struct Tests ---

test("Generic struct with single type param", () => {
  expectValid(
    "struct Point<T> { x : T, y : T }; let p : Point<I32> = Point<I32> { x: 42I32, y: 100I32 }; p.x",
    [],
    42,
  );
});

test("Generic struct with inferred type args", () => {
  expectValid(
    "struct Point<T> { x : T, y : T }; let p : Point<I32> = Point { x: 42I32, y: 100I32 }; p.y",
    [],
    100,
  );
});

test("Generic struct with multiple type params", () => {
  expectValid(
    "struct Pair<T, U> { first : T, second : U }; let p : Pair<I32, U8> = Pair { first: 42I32, second: 255U8 }; p.first",
    [],
    42,
  );
});

test("Generic struct with inferred multiple type args", () => {
  expectValid(
    "struct Pair<T, U> { first : T, second : U }; let p : Pair<I32, U8> = Pair { first: 10I32, second: 5U8 }; p.second",
    [],
    5,
  );
});

test("Generic struct field reassignment with mut", () => {
  expectValid(
    "struct Point<T> { x : T, y : T }; let mut p : Point<I32> = Point { x: 1I32, y: 2I32 }; p.x = 99I32; p.x",
    [],
    99,
  );
});

test("Generic struct field reassignment without mut is invalid", () => {
  expectInvalid(
    "struct Point<T> { x : T, y : T }; let p : Point<I32> = Point { x: 1I32, y: 2I32 }; p.x = 99I32;",
  );
});

test("Generic struct with wrong type arg count is invalid", () => {
  expectInvalid(
    "struct Point<T> { x : T, y : T }; let p : Point<I32, U8> = Point { x: 1I32, y: 2I32 };",
  );
});

test("Generic struct field type mismatch is invalid", () => {
  expectInvalid(
    "struct Point<T> { x : T, y : T }; let p : Point<I32> = Point { x: 1U8, y: 2I32 };",
  );
});

test("Nested generic struct", () => {
  expectValid(
    "struct Point<T> { x : T, y : T }; struct Wrapper<T> { inner : Point<T> }; let w : Wrapper<I32> = Wrapper { inner: Point { x: 42I32, y: 100I32 } }; w.inner.x",
    [],
    42,
  );
});

test("Struct field with nested generic type arg", () => {
  expectValid(
    "struct Inner<T> { val : T }; struct Outer<T> { inner : T }; struct Container { f : Outer<Inner<I32>> }; let c : Container = Container { f : Outer { inner : Inner { val : 42I32 } } }; c.f.inner.val",
    [],
    42,
  );
});

test("Struct field with union type", () => {
  expectValid(
    "struct A { x : I32 }; struct B { x : I32 }; struct Container { f : A | B }; let c : Container = Container { f : A { x : 42I32 } }; 42",
    [],
    42,
  );
});

test("Generic struct used as exit expression", () => {
  expectValid(
    "struct Point<T> { x : T, y : T }; let p : Point<I32> = Point { x: 42I32, y: 0I32 }; p",
    [],
    0,
  );
});

test("Generic struct definition without usage is valid", () => {
  expectValid("struct Point<T> { x : T, y : T }; 42", [], 42);
});

test("Generic struct with undefined type param is invalid", () => {
  expectInvalid(
    "struct Point<T> { x : T, y : T }; let p : Point<UnknownType> = Point { x: 1I32, y: 2I32 };",
  );
});

test("Generic struct instantiation without type annotation is invalid", () => {
  expectInvalid(
    "struct Point<T> { x : T, y : T }; let p = Point { x: 1I32, y: 2I32 };",
  );
});

test("Struct definition without semicolon is valid", () => {
  expectValid("struct Point { x : I32, y : I32 } 42", [], 42);
});

test("Struct definition without semicolon followed by let declaration", () => {
  expectValid(
    "struct Point { x : I32, y : I32 } let p : Point = Point { x: 42I32, y: 100I32 }; p.x",
    [],
    42,
  );
});

test("Generic struct definition without semicolon is valid", () => {
  expectValid(
    "struct Point<T> { x : T, y : T } let p : Point<I32> = Point { x: 42I32, y: 100I32 }; p.y",
    [],
    100,
  );
});

test("Multiple struct definitions without semicolons", () => {
  expectValid(
    "struct Inner { v : I32 } struct Outer { inner : Inner } let o : Outer = Outer { inner: Inner { v: 77I32 } }; o.inner.v",
    [],
    77,
  );
});

test("Struct definition with semicolon still works", () => {
  expectValid(
    "struct Point { x : I32, y : I32 }; let p : Point = Point { x: 42I32, y: 100I32 }; p.x",
    [],
    42,
  );
});

test("String literal .length", () => {
  expectValid('let s : &Str = "hello"; s.length', [], 5);
});

test("Empty string .length", () => {
  expectValid('let s : &Str = ""; s.length', [], 0);
});

test("String literal with escape sequences .length", () => {
  expectValid('let s : &Str = "a\\nb\\tc"; s.length', [], 5);
});

test("Literal string .length", () => {
  expectValid('"hello".length', [], 5);
});

test("String literal .length returns USize", () => {
  expectValid('let s : &Str = "hi"; let len : USize = s.length; len', [], 2);
});

test("String in is expression", () => {
  expectValid('let s : &Str = "hi"; s is Str', [], 1);
});

test("Missing closing quote", () => {
  expectInvalid('let s : &Str = "hello;');
});

test("Type mismatch: string assigned to I32", () => {
  expectInvalid('let x : I32 = "hello";');
});

test("dot length on non-string", () => {
  expectInvalid("42.length");
});

test("String literal as exit expression", () => {
  expectInvalid('"hello"');
});

test("String variable as exit expression", () => {
  expectInvalid('let s : &Str = "hi"; s');
});

test("&Str as type argument", () => {
  expectValid(
    'struct Box<T> { value: T } let b : Box<&Str> = Box { value: "hello" }; b.value.length',
    [],
    5,
  );
});

test("Line comment on its own line", () => {
  expectValid("// this is a comment\n42", [], 42);
});

test("Line comment after code", () => {
  expectValid("42 // inline comment", [], 42);
});

test("Multiple line comments", () => {
  expectValid("// comment 1\n// comment 2\n42", [], 42);
});

test("Block comment on its own line", () => {
  expectValid("/* this is a block comment */\n42", [], 42);
});

test("Block comment after code", () => {
  expectValid("42 /* inline block comment */", [], 42);
});

test("Multi-line block comment", () => {
  expectValid("/* line 1\nline 2\nline 3 */\n42", [], 42);
});

test("Nested block comments not supported", () => {
  expectInvalid("/* outer /* inner */ outer */");
});

test("Unclosed block comment", () => {
  expectInvalid("/* unclosed comment");
});

test("Comment delimiters in string literal", () => {
  expectValid(
    'let s : &Str = "// not a comment /* also not */"; s.length',
    [],
    31,
  );
});

test("Line comment inside block comment", () => {
  expectValid("/* comment with // inside */\n42", [], 42);
});

test("Block comment inside line comment", () => {
  expectValid("// comment with /* inside\n42", [], 42);
});

test("Line comment at EOF without newline", () => {
  expectValid("42 // comment at end", [], 42);
});

test("Block comment at EOF", () => {
  expectValid("42 /* comment at end */", [], 42);
});

test("Module with a single numeric literal exits 0", () => {
  expectValidWithModules(["index"], { ["index"]: "100" }, [], 0);
});

// --- Module export keyword: out ---

test("out let in non-module mode is a no-op", () => {
  expectValid("out let x = 42; x", [], 42);
});

test("out struct in non-module mode is a no-op", () => {
  expectValid("out struct Point { x : I32 } 42", [], 42);
});

test("out type alias in non-module mode is a no-op", () => {
  expectValid("out type MyAlias = I32; 42", [], 42);
});

test("out enum in non-module mode is a no-op", () => {
  expectValid("out enum Color { Red, Blue } 42", [], 42);
});

test("bare out without following statement is invalid", () => {
  expectInvalid("out");
});

test("out out double keyword is invalid", () => {
  expectInvalid("out out let x = 42;");
});

test("out followed by non-statement keyword is invalid", () => {
  expectInvalid("out 42");
});

test("out let in module mode exits 0", () => {
  expectValidWithModules(["index"], { ["index"]: "out let x = 42;" }, [], 0);
});

test("out struct in module mode exits 0", () => {
  expectValidWithModules(
    ["index"],
    { ["index"]: "out struct Point { x : I32 }" },
    [],
    0,
  );
});

test("out type alias in module mode exits 0", () => {
  expectValidWithModules(
    ["index"],
    { ["index"]: "out type MyAlias = I32;" },
    [],
    0,
  );
});

test("out enum in module mode exits 0", () => {
  expectValidWithModules(
    ["index"],
    { ["index"]: "out enum Color { Red, Blue }" },
    [],
    0,
  );
});
