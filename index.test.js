import { expect, test } from "bun:test";
import { compile } from ".";

function expectValid(source, stdIn, expectedExitCode) {
  const generated = compile(source);
  try {
    const actualExitCode = new Function("stdIn", generated)(stdIn);
    if (actualExitCode !== expectedExitCode) {
      throw new Error(
        "Expected '" +
          expectedExitCode +
          "' but was actually '" +
          actualExitCode +
          "'. Generated: '" +
          generated +
          "'",
      );
    }
  } catch (e) {
    throw new Error("Failed to execute generated code: '" + generated + "'", e);
  }
}

function expectInvalid(source) {
  expect(() => compile(source)).toThrow();
}

test("empty source compiles and exits with code 0", () => {
  expectValid("", "", 0);
});

test("read() returns stdin value", () => {
  expectValid("read()", "1", 1);
});

test("read() parses first token from multi-value input", () => {
  expectValid("read()", "1 2", 1);
});

test("multiple read() calls consume tokens sequentially", () => {
  expectValid("read() + read()", "1 2", 3);
});

test("block expressions work with read()", () => {
  expectValid("read() + { read() }", "1 2", 3);
});

test("blocks support let declarations and statements", () => {
  expectValid("read() + { let x = read(); x }", "1 2", 3);
});

test("top-level let with nested block expressions", () => {
  expectValid("let y = read() + { let x = read(); x }; y", "1 2", 3);
});

test("multi-character identifiers work in valid contexts", () => {
  expectValid("let invalid = read(); invalid", "1", 1);
});

test("mutable variables support reassignment", () => {
  expectValid("let mut x = read(); x = read(); x", "1 2", 2);
});

test("mutable variables support compound assignment", () => {
  expectValid("let mut x = read(); x += read(); x", "1 2", 3);
});

test("mutable variables can be reassigned inside blocks", () => {
  expectValid("let mut x = 0; { x = read(); } x", "3", 3);
});

test("numeric type suffixes like U8 are supported", () => {
  expectValid("read() + 100U8", "1", 101);
});

test("U16 and U32 types work correctly", () => {
  expectValid("read() + 50000U16", "1", 50001);
  expectValid("read() + 4000000000U32", "1", 4000000001);
});

test("I8, I16, and I32 types work correctly", () => {
  expectValid("read() - 50I8", "1", -49);
  expectValid("read() + 30000I16", "1", 30001);
});

test("typed variable declarations and typed read calls work correctly", () => {
  expectValid("let x : U8 = read<U8>(); x", "100", 100);
});

test("read<Bool>() parses boolean literals", () => {
  expectValid("read<Bool>()", "true", 1);
});

test("logical OR with boolean expressions works", () => {
  expectValid("read<Bool>() || false", "true", 1);
});

test("logical AND with boolean expressions works", () => {
  expectValid("read<Bool>() && false", "true", 0);
});

test("equality comparison returns 1 for equal values", () => {
  expectValid("5 == 5", "", 1);
});

test("if/else expression with boolean condition works", () => {
  expectValid("let temp = if (read<Bool>()) 3 else 5; temp", "true", 3);
});

test("bare let declaration with no trailing expression returns 0", () => {
  expectValid("let x = read();", "100", 0);
});

test("variable shadowing allows redeclaration", () => {
  expectValid("let x = read(); let x = read(); x", "2 3", 3);
});

test("block-scoped variable shadows outer variable", () => {
  expectValid("let x = read(); { let x = read(); } x", "2 3", 2);
});

test("while loop with mutable counter works", () => {
  expectValid("let mut counter = 0; let limit = read(); while (counter < limit) counter += 1; counter", "3", 3);
});

test("break exits while loop early", () => {
  expectValid("let mut temp = 0; while (true) { temp = 1; break; } temp", "", 1);
});

test("continue skips to next loop iteration", () => {
  expectValid("let mut temp = 0; while (true) { if (temp > 4) break; else { temp += 1; continue; } } temp", "", 5);
});

test("break exits while loop when condition met", () => {
  expectValid("let mut temp = 0; while (true) { if (temp >= 4) break; else { temp += 1; continue; } } temp", "", 4);
});

test("for loop with range iterates and accumulates", () => {
  expectValid("let mut sum = 0; for (i in 0..read()) sum += i; sum", "4", 6);
});

test("for loop with range variable works", () => {
  expectValid("let mut sum = 0; let range = 0..read(); for (i in range) sum += i; sum", "4", 6);
});

test("function declaration and call works", () => {
  expectValid("fn get() => read(); get()", "4", 4);
});

test("function with typed parameter works", () => {
  expectValid("fn add(temp : I32) => read() + temp; add(1)", "4", 5);
});

test("function with typed parameter and return type works", () => {
  expectValid("fn add(temp : I32) : I32 => read() + temp; add(1)", "4", 5);
});

test("recursive function works", () => {
  expectValid("fn fact(n : I32) : I32 => if (n < 2) 1 else n * fact(n - 1); fact(read())", "5", 120);
});

test("function with if/return in block body works", () => {
  expectValid("fn get() => { if (true) return 3 } + 1; get()", "", 3);
});

test("function with empty block body works", () => {
  expectValid("fn get() => {} 100", "", 100);
});

test("yield returns early from block", () => {
  expectValid("{ if (true) yield 1; 2 } + 3", "", 4);
});

test("array literal with indexing works", () => {
  expectValid("let array = [read(), read()]; array[0] + array[1]", "1 2", 3);
});

test("typed array declaration with indexing works", () => {
  expectValid("let array : [I32; 2] = [read(), read()]; array[0] + array[1]", "1 2", 3);
});

test("array .length property returns array size", () => {
  expectValid("let array = [100]; array.length", "", 1);
});

test("struct declaration compiles and evaluates to 0", () => {
  expectValid("struct empty {}", "", 0);
});

test("struct declaration with fields compiles and evaluates to 0", () => {
  expectValid("struct wrapper { field : I32 }", "", 0);
});

test("struct declaration with duplicate field names is invalid", () => {
  expectInvalid("struct wrapper { field : I32, field : I32 }");
});

test("struct declaration with unknown type is invalid", () => {
  expectInvalid("struct wrapper { field : UnknownType }");
});

test("struct instantiation compiles and evaluates to 0", () => {
  expectValid("struct Empty {} let wrapper = Empty {};", "", 0);
});

test("struct instantiation with fields compiles and evaluates to 0", () => {
  expectValid("struct Wrapper { field : I32 } let wrapper = Wrapper { field : 100 };", "", 0);
});

test("struct field access returns field value", () => {
  expectValid("struct Wrapper { field : I32 } let wrapper = Wrapper { field : 100 }; wrapper.field", "", 100);
});

test("wider type assigned to narrower array element is invalid", () => {
  expectInvalid("let array : [U8; 1] = [read<U16>()]; array[0]");
});

test("array literal with too many elements is invalid", () => {
  expectInvalid("let array : [U16; 1] = [read<U16>(), read<U16>()]; array[0]");
});

test("assigning array variable to mismatched typed array is invalid", () => {
  expectInvalid("let array = [read<U16>(), read<U16>()]; let array0 : [U16; 1] = array;");
});

test("narrower type assigned to wider declaration is valid", () => {
  expectValid("let x : U16 = read<U8>(); x", "100", 100);
});

test("wider type assigned to narrower declaration is invalid", () => {
  expectInvalid("let x : U8 = read<U16>(); x");
});

test("assigning wider variable to narrower declaration is invalid", () => {
  expectInvalid("let x = read<U16>(); let y : U8 = x;");
});

test("reassigning immutable variable is invalid", () => {
  expectInvalid("let x = read(); x = read(); x");
});

test("compound assignment on immutable variable is invalid", () => {
  expectInvalid("let x = read(); x += read(); x");
});

test("bare numeric literal with type suffix is invalid", () => {
  expectInvalid("256U8");
  expectInvalid("65536U16");
  expectInvalid("-1U16");
  expectInvalid("128I8");
});

test("negative value with unsigned type suffix is invalid", () => {
  expectInvalid("-1U8");
});

test("invalid source throws error", () => {
  expectInvalid("@invalid");
});

test("upper-case identifier is valid", () => {
  expectValid("let X = read(); X", "42", 42);
});

test("mixed-case identifier is valid", () => {
  expectValid("let myVar = read(); myVar", "42", 42);
});

test("unknown identifier throws error", () => {
  expectInvalid("unknownIdentifier");
});

test("address-of operator passes through", () => {
  expectValid("let x = 0; &x == &x", "", 1);
});

test("address-of operator differs across distinct variables", () => {
  expectValid("let x = 0; let y = 0; &x == &y", "", 0);
});

test("dereference of address-of returns the variable value", () => {
  expectValid("let temp = 100; *&temp", "", 100);
});

test("string literal .length returns character count", () => {
  expectValid("\"foo\".length", "", 3);
});

test("read<&Str>().length returns character count of input", () => {
  expectValid("read<&Str>().length", "foo", 3);
});

test("character literal returns ASCII value", () => {
  expectValid("'a'", "", 97);
});

test("Char type declaration with character literal works", () => {
  expectValid("let temp : Char = 't'; temp", "", 116);
});

test("string indexing returns ASCII value", () => {
  expectValid("\"test\"[0]", "", 116);
});

test("mutable reference writes through to the original variable", () => {
  expectValid("let mut x = read(); let y : &mut I32 = &mut x; *y = read(); x", "1 2", 2);
});
