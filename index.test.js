import { test, expect } from "bun:test";
import { compile } from ".";
import { act } from "react";

function expectValid(source, stdIn, expectedExitCode) {
  const generated = compile(source);

  try {
    const fn = new Function("stdIn", generated);
    const actualExitCode = fn(stdIn);
    if (expectedExitCode != actualExitCode) {
      throw new Error(
        "Expected '" +
          expectedExitCode +
          "' but was actually '" +
          actualExitCode +
          "'. Generated: " +
          generated,
      );
    }
  } catch (e) {
    throw new Error("Failed to execute generated code: '" + generated + "'");
  }
}

function expectInvalid(source) {
  expect(() => compile(source)).toThrow();
}

test("empty source", () => {
  expectValid("", "", 0);
});

test("positive integer literal", () => {
  expectValid("42", "", 42);
});

test("negative integer literal", () => {
  expectValid("-42", "", -42);
});

test("float literal", () => {
  expectValid("3.14", "", 3.14);
});

test("negative float literal", () => {
  expectValid("-3.14", "", -3.14);
});

test("U8 suffix", () => {
  expectValid("255U8", "", 255);
});

test("U8 out of range is invalid", () => {
  expectInvalid("256U8");
});

test("U8 clamping", () => {
  expectInvalid("300U8");
});

test("U16 suffix", () => {
  expectValid("65535U16", "", 65535);
});

test("U32 suffix", () => {
  expectValid("4294967295U32", "", 4294967295);
});

test("I8 suffix", () => {
  expectValid("127I8", "", 127);
});

test("I8 negative", () => {
  expectValid("-128I8", "", -128);
});

test("I16 suffix", () => {
  expectValid("32767I16", "", 32767);
});

test("I32 suffix", () => {
  expectValid("2147483647I32", "", 2147483647);
});

test("F32 suffix", () => {
  expectValid("3.14F32", "", parseFloat(3.14.toPrecision(6)));
});

test("F64 suffix", () => {
  expectValid("3.14F64", "", 3.14);
});

test("multiple statements", () => {
  expectValid("10; 20; 30", "", 30);
});

test("single statement with semicolon", () => {
  expectValid("42;", "", 42);
});

test("invalid syntax throws", () => {
  expectInvalid("abc");
});

test("invalid suffix throws", () => {
  expectInvalid("42U99");
});

test("unexpected character throws", () => {
  expectInvalid("!");
});

test("minus without number throws", () => {
  expectInvalid("-");
});

// Arithmetic tests
test("addition", () => {
  expectValid("1 + 2", "", 3);
});

test("subtraction", () => {
  expectValid("10 - 3", "", 7);
});

test("multiplication", () => {
  expectValid("4 * 5", "", 20);
});

test("division", () => {
  expectValid("10 / 2", "", 5);
});

test("modulo", () => {
  expectValid("10 % 3", "", 1);
});

test("operator precedence", () => {
  expectValid("2 + 3 * 4", "", 14);
});

test("parentheses override precedence", () => {
  expectValid("(2 + 3) * 4", "", 20);
});

test("chained addition", () => {
  expectValid("1 + 2 + 3", "", 6);
});

test("chained subtraction", () => {
  expectValid("10 - 2 - 3", "", 5);
});

test("mixed operators", () => {
  expectValid("2 * 3 + 4 * 5", "", 26);
});

test("division with floats", () => {
  expectValid("7 / 2", "", 3.5);
});

test("modulo with floats", () => {
  expectValid("7.5 % 2", "", 1.5);
});

test("negative in expression", () => {
  expectValid("-5 + 3", "", -2);
});

test("expression with suffix", () => {
  expectValid("200U8 + 1", "", 201);
});

test("both operands with suffix", () => {
  expectValid("200U8 + 100U8", "", 300);
});

test("nested parentheses", () => {
  expectValid("((2 + 3)) * 4", "", 20);
});

test("complex expression", () => {
  expectValid("(1 + 2) * (3 + 4)", "", 21);
});

test("expression with semicolon", () => {
  expectValid("1 + 2;", "", 3);
});

test("multiple expressions last wins", () => {
  expectValid("1 + 2; 3 + 4", "", 7);
});

test("invalid expression: missing operand", () => {
  expectInvalid("1 +");
});

test("invalid expression: missing operand right", () => {
  expectInvalid("+ 1");
});

test("invalid expression: empty parentheses", () => {
  expectInvalid("()");
});

test("invalid expression: unclosed parenthesis", () => {
  expectInvalid("(1 + 2");
});

test("invalid suffix on negative number", () => {
  expectInvalid("-42U99");
});

test("unary minus in expression", () => {
  expectValid("-(1 + 2)", "", -3);
});

// Let statement tests
test("simple let statement", () => {
  expectValid("let x = 42; x", "", 42);
});

test("let with expression", () => {
  expectValid("let x = 1 + 2; x * 3", "", 9);
});

test("let with suffix", () => {
  expectValid("let x = 200U8; x + 1", "", 201);
});

test("let with negative value", () => {
  expectValid("let x = -10; x + 5", "", -5);
});

test("multiple let statements", () => {
  expectValid("let x = 10; let y = 20; x + y", "", 30);
});

test("let used in complex expression", () => {
  expectValid("let x = 5; let y = 3; x * y + 1", "", 16);
});

test("let with float", () => {
  expectValid("let x = 3.14; x * 2", "", 6.28);
});

test("let with F32 suffix", () => {
  expectValid("let x = 3.14F32; x", "", parseFloat(3.14.toPrecision(6)));
});

test("let variable in parentheses", () => {
  expectValid("let x = 2; (x + 3) * 4", "", 20);
});

test("let with out-of-range suffix is invalid", () => {
  expectInvalid("let x = 300U8; x");
});

test("let with invalid identifier", () => {
  expectInvalid("let 123 = 42;");
});

test("let without initializer", () => {
  expectInvalid("let x;");
});

test("let with duplicate name", () => {
  expectInvalid("let x = 1; let x = 2;");
});

test("use undeclared variable", () => {
  expectInvalid("let x = 1; y");
});

// let mut and assignment tests
test("let mut declaration", () => {
  expectValid("let mut x = 42; x", "", 42);
});

test("let mut reassignment", () => {
  expectValid("let mut x = 42; x = 10; x", "", 10);
});

test("let mut multiple reassignments", () => {
  expectValid("let mut x = 1; x = 2; x = 3; x", "", 3);
});

test("let mut with expression", () => {
  expectValid("let mut x = 1; x = x + 1; x", "", 2);
});

test("let mut with complex expression", () => {
  expectValid("let mut x = 5; x = x * 2 + 3; x", "", 13);
});

test("let mut with suffix", () => {
  expectValid("let mut x = 200U8; x = 100U8; x", "", 100);
});

test("let mut with negative value", () => {
  expectValid("let mut x = 10; x = -5; x", "", -5);
});

test("let mut used in expression after reassignment", () => {
  expectValid("let mut x = 10; let y = 20; x = y; x + x", "", 40);
});

test("assign to immutable variable is invalid", () => {
  expectInvalid("let x = 42; x = 10;");
});

test("let mut with out-of-range reassignment is invalid", () => {
  expectInvalid("let mut x = 200U8; x = 300U8;");
});

test("let mut without initializer", () => {
  expectInvalid("let mut x;");
});

// Type annotation tests
test("let with type annotation", () => {
  expectValid("let x: U8 = 42; x", "", 42);
});

test("let with type annotation and matching suffix", () => {
  expectValid("let x: U8 = 42U8; x", "", 42);
});

test("let with type annotation, no suffix", () => {
  expectValid("let x: U16 = 1000; x", "", 1000);
});

test("let with type annotation negative", () => {
  expectValid("let x: I8 = -50; x", "", -50);
});

test("let with type annotation F32", () => {
  expectValid("let x: F32 = 3.14; x", "", parseFloat(3.14.toPrecision(6)));
});

test("let with type annotation F64", () => {
  expectValid("let x: F64 = 2.718; x", "", 2.718);
});

test("let with type annotation out of range", () => {
  expectInvalid("let x: U8 = 300; x");
});

test("let with mismatched suffix and annotation", () => {
  expectInvalid("let x: U8 = 42U16; x");
});

test("let mut with type annotation", () => {
  expectValid("let mut x: U8 = 42; x", "", 42);
});

test("let mut with type annotation reassignment", () => {
  expectValid("let mut x: U8 = 42; x = 100; x", "", 100);
});

test("let mut with type annotation reassignment out of range", () => {
  expectInvalid("let mut x: U8 = 42; x = 300;");
});

test("let with type annotation expression", () => {
  expectValid("let x: U32 = 10 + 20; x", "", 30);
});

test("let with invalid type annotation", () => {
  expectInvalid("let x: InvalidType = 42;");
});

test("let with type annotation missing colon", () => {
  expectInvalid("let x U8 = 42;");
});

// Boolean literal tests
test("true literal", () => {
  expectValid("true", "", 1);
});

test("false literal", () => {
  expectValid("false", "", 0);
});

test("let with true", () => {
  expectValid("let x = true; x", "", 1);
});

test("let with false", () => {
  expectValid("let x = false; x", "", 0);
});

test("let with Bool type annotation true", () => {
  expectValid("let x: Bool = true; x", "", 1);
});

test("let with Bool type annotation false", () => {
  expectValid("let x: Bool = false; x", "", 0);
});

test("let mut Bool reassignment", () => {
  expectValid("let mut x: Bool = true; x = false; x", "", 0);
});

test("Bool type mismatch with number", () => {
  expectInvalid("let x: Bool = 42;");
});

test("Bool type mismatch with true in numeric type", () => {
  expectInvalid("let x: U8 = true;");
});

test("invalid Bool reassignment with number", () => {
  expectInvalid("let mut x: Bool = true; x = 10;");
});

// Boolean operator tests
test("&& operator true and true", () => {
  expectValid("true && true", "", 1);
});

test("&& operator true and false", () => {
  expectValid("true && false", "", 0);
});

test("&& operator false and true", () => {
  expectValid("false && true", "", 0);
});

test("&& operator false and false", () => {
  expectValid("false && false", "", 0);
});

test("|| operator true or false", () => {
  expectValid("true || false", "", 1);
});

test("|| operator false or false", () => {
  expectValid("false || false", "", 0);
});

test("|| operator true or true", () => {
  expectValid("true || true", "", 1);
});

test("! operator not true", () => {
  expectValid("!true", "", 0);
});

test("! operator not false", () => {
  expectValid("!false", "", 1);
});

test("double ! operator", () => {
  expectValid("!!true", "", 1);
});

test("&& with variables", () => {
  expectValid("let a: Bool = true; let b: Bool = false; a && b", "", 0);
});

test("|| with variables", () => {
  expectValid("let a: Bool = true; let b: Bool = false; a || b", "", 1);
});

test("! with variables", () => {
  expectValid("let a: Bool = true; !a", "", 0);
});

test("complex boolean expression", () => {
  expectValid("true && false || true", "", 1);
});

test("&& has higher precedence than ||", () => {
  expectValid("false || true && false", "", 0);
});

test("boolean expression in parentheses", () => {
  expectValid("(true || false) && true", "", 1);
});

test("&& with numeric operand is invalid", () => {
  expectInvalid("true && 42");
});

test("|| with numeric operand is invalid", () => {
  expectInvalid("false || 10");
});

test("! on numeric is invalid", () => {
  expectInvalid("!42");
});

test("&& with Bool type annotation", () => {
  expectValid("let x: Bool = true && false; x", "", 0);
});

test("|| with Bool type annotation", () => {
  expectValid("let x: Bool = true || false; x", "", 1);
});

test("! with Bool type annotation", () => {
  expectValid("let x: Bool = !true; x", "", 0);
});

test("&& result in numeric context is invalid", () => {
  expectInvalid("let x: U8 = true && false;");
});

// Comparison operator tests
test("== equality true", () => {
  expectValid("1 == 1", "", 1);
});

test("== equality false", () => {
  expectValid("1 == 2", "", 0);
});

test("!= inequality true", () => {
  expectValid("1 != 2", "", 1);
});

test("!= inequality false", () => {
  expectValid("1 != 1", "", 0);
});

test("< less than true", () => {
  expectValid("1 < 2", "", 1);
});

test("< less than false", () => {
  expectValid("2 < 1", "", 0);
});

test("> greater than true", () => {
  expectValid("2 > 1", "", 1);
});

test("> greater than false", () => {
  expectValid("1 > 2", "", 0);
});

test("<= less or equal true", () => {
  expectValid("1 <= 1", "", 1);
});

test("<= less or equal false", () => {
  expectValid("2 <= 1", "", 0);
});

test(">= greater or equal true", () => {
  expectValid("1 >= 1", "", 1);
});

test(">= greater or equal false", () => {
  expectValid("1 >= 2", "", 0);
});

test("== with bools", () => {
  expectValid("true == true", "", 1);
});

test("!= with bools", () => {
  expectValid("true != false", "", 1);
});

test("comparison with variables", () => {
  expectValid("let x: U8 = 5; x == 5", "", 1);
});

test("comparison in let statement", () => {
  expectValid("let x: Bool = 1 < 2; x", "", 1);
});

test("comparison with float", () => {
  expectValid("1.5 < 2.0", "", 1);
});

test("comparison chaining with &&", () => {
  expectValid("1 < 2 && 3 > 2", "", 1);
});

test("comparison result in Bool annotation", () => {
  expectValid("let x: Bool = 1 == 1; x", "", 1);
});

test("comparison result in numeric context is invalid", () => {
  expectInvalid("let x: U8 = 1 == 2;");
});

test("ordering op with bool is invalid", () => {
  expectInvalid("true < false");
});

test("ordering op with bool >= is invalid", () => {
  expectInvalid("true >= false");
});

test("comparison with negative numbers", () => {
  expectValid("-1 < 0", "", 1);
});

test("comparison with expressions", () => {
  expectValid("1 + 2 == 3", "", 1);
});

test("complex comparison expression", () => {
  expectValid("let x: U8 = 10; x > 5 && x < 20", "", 1);
});


