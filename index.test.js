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

// Block expression tests
test("simple block expression", () => {
  expectValid("{ 42 }", "", 42);
});

test("block with let and return value", () => {
  expectValid("{ let y = 100; y }", "", 100);
});

test("block assigned to variable", () => {
  expectValid("let x = { let y = 100; y }; x", "", 100);
});

test("block with multiple statements", () => {
  expectValid("{ let a = 1; let b = 2; a + b }", "", 3);
});

test("block as top-level statement", () => {
  expectValid("{ 10; 20 }", "", 20);
});

test("nested blocks", () => {
  expectValid("{ { 1; 2 }; 3 }", "", 3);
});

test("nested blocks inner value", () => {
  expectValid("{ { 42 } }", "", 42);
});

test("block scoping - variable not visible outside", () => {
  expectInvalid("{ let x = 10; x }; x");
});

test("block scoping - outer variable visible inside", () => {
  expectValid("let x = 10; { x }", "", 10);
});

test("block duplicate variable with outer scope", () => {
  expectInvalid("let x = 10; { let x = 20; x }");
});

test("block with expression", () => {
  expectValid("{ 1 + 2 }", "", 3);
});

test("block with mut variable", () => {
  expectValid("{ let mut x = 1; x = 2; x }", "", 2);
});

test("block used in binary expression", () => {
  expectValid("{ 5 } + { 3 }", "", 8);
});

test("block in parentheses", () => {
  expectValid("({ 42 })", "", 42);
});

test("empty block statement", () => {
  expectValid("let x = 42; {} x", "", 42);
});

test("block statement with trailing semicolon", () => {
  expectValid("let mut x = 0; { x = 1; } x", "", 1);
});

test("block statement with two trailing semicolons", () => {
  expectValid("let mut x = 0; { x = 1; x = 2; } x", "", 2);
});

test("block statement with let only", () => {
  expectValid("let mut x = 0; { let y = 10; x = y; } x", "", 10);
});

test("block statement with mut and no final expr", () => {
  expectValid("let mut x = 0; { let mut y = 1; y = 2; x = y; } x", "", 2);
});

test("deeply nested blocks", () => {
  expectValid("{ { { 42 } } }", "", 42);
});

test("block with complex expression", () => {
  expectValid("{ let a = 10; let b = 20; a * b + 5 }", "", 205);
});

test("block as last statement returns value", () => {
  expectValid("10; { 20; 30 }", "", 30);
});

test("block with boolean", () => {
  expectValid("{ true }", "", 1);
});

test("block with comparison", () => {
  expectValid("{ 1 < 2 }", "", 1);
});

test("block with type annotation", () => {
  expectValid("{ let x: U8 = 42; x }", "", 42);
});

// Block statement tests
test("block statement with assignment", () => {
  expectValid("let mut x = 0; { x = 1; } x", "", 1);
});

test("block statement with let", () => {
  expectValid("let mut x = 0; { let y = 10; x = y; } x", "", 10);
});

test("empty block statement", () => {
  expectValid("let x = 42; {} x", "", 42);
});

test("block statement with multiple statements", () => {
  expectValid("let mut x = 0; { x = 1; x = 2; } x", "", 2);
});

test("block statement as last statement", () => {
  expectValid("let mut x = 0; { x = 1; }", "", 0);
});

test("block statement with nested block", () => {
  expectValid("let mut x = 0; { { x = 1; } } x", "", 1);
});

test("block statement with expression inside", () => {
  expectValid("let mut x = 0; { x = 1 + 2; } x", "", 3);
});

test("block statement with boolean", () => {
  expectValid("let mut x: Bool = false; { x = true; } x", "", 1);
});

test("block statement with comparison", () => {
  expectValid("let mut x: Bool = false; { x = 1 < 2; } x", "", 1);
});

test("block statement with type annotation", () => {
  expectValid("let mut x: U8 = 0; { let y: U8 = 42; x = y; } x", "", 42);
});

test("block statement with mut inside", () => {
  expectValid("let mut x = 0; { let mut y = 1; y = 2; x = y; } x", "", 2);
});

test("block statement scoping", () => {
  expectInvalid("let x = 0; { let y = 10; }; y");
});

test("block statement in expression context is invalid", () => {
  expectInvalid("let x = 0; { x = 1; } + 2");
});

test("block statement with trailing semicolon in expression context is invalid", () => {
  expectInvalid("let x = 0; let y = { x = 1; }");
});

// If expression tests
test("basic if-else true branch", () => {
  expectValid("if (true) 1 else 2", "", 1);
});

test("basic if-else false branch", () => {
  expectValid("if (false) 1 else 2", "", 2);
});

test("if-else with variable condition", () => {
  expectValid("let x: Bool = true; if (x) 10 else 20", "", 10);
});

test("if-else with comparison condition", () => {
  expectValid("if (1 < 2) 100 else 200", "", 100);
});

test("if-else assigned to variable", () => {
  expectValid("let x = if (true) 1 else 2; x", "", 1);
});

test("if-else in expression", () => {
  expectValid("if (true) 1 else 2 + 3", "", 1);
});

test("if-else-if chain", () => {
  expectValid("let x = 2; if (x == 1) 10 else if (x == 2) 20 else 30", "", 20);
});

test("if-else-if falls through to else", () => {
  expectValid("let x = 5; if (x == 1) 10 else if (x == 2) 20 else 30", "", 30);
});

test("nested if expressions", () => {
  expectValid("if (true) if (false) 1 else 2 else 3", "", 2);
});

test("if-else with block in branch", () => {
  expectValid("if (true) { 1 + 2 } else { 3 + 4 }", "", 3);
});

test("if-else with expressions in branches", () => {
  expectValid("if (true) 10 * 2 else 20 / 2", "", 20);
});

test("if-else with boolean branches", () => {
  expectValid("if (true) true else false", "", 1);
});

test("if-else false branch boolean", () => {
  expectValid("if (false) true else false", "", 0);
});

test("if-else with complex condition", () => {
  expectValid("if (true && false) 1 else 2", "", 2);
});

test("if-else with negated condition", () => {
  expectValid("if (!false) 42 else 0", "", 42);
});

test("if-else as last statement", () => {
  expectValid("let a = 1; if (a == 1) 100 else 200", "", 100);
});

test("if-else with let in branch block", () => {
  expectValid("if (true) { let y = 5; y * 2 } else 0", "", 10);
});

test("if-else-if multiple conditions", () => {
  expectValid("let x = 3; if (x == 1) 1 else if (x == 2) 2 else if (x == 3) 3 else 0", "", 3);
});

test("if-else with parentheses around branches", () => {
  expectValid("if (true) (1) else (2)", "", 1);
});

test("if-else in let with type annotation", () => {
  expectValid("let x: U8 = if (true) 10 else 20; x", "", 10);
});

test("if-else with mut variable condition", () => {
  expectValid("let mut x: Bool = false; x = true; if (x) 1 else 2", "", 1);
});

test("if-else chained with arithmetic", () => {
  expectValid("let x = if (true) 5 else 10; x + 1", "", 6);
});

test("if-else with comparison in branches", () => {
  expectValid("if (true) 1 < 2 else 3 > 4", "", 1);
});

test("if without else is invalid", () => {
  expectInvalid("if (true) 1");
});

test("if with non-bool condition is invalid", () => {
  expectInvalid("if (42) 1 else 2");
});

test("if with numeric condition is invalid", () => {
  expectInvalid("if (1 + 2) 1 else 2");
});

test("if with mismatched branch types - number vs bool", () => {
  expectInvalid("if (true) 1 else true");
});

test("if with mismatched branch types - bool vs number", () => {
  expectInvalid("if (true) true else 1");
});

test("if-else-if without final else is invalid", () => {
  expectInvalid("if (true) 1 else if (false) 2");
});

test("if with missing closing paren", () => {
  expectInvalid("if true) 1 else 2");
});

test("if with missing else keyword", () => {
  expectInvalid("if (true) 1 2");
});

test("if-else with block statement in then branch is invalid", () => {
  expectInvalid("if (true) { 1; } else 2");
});

test("if-else with block statement in else branch is invalid", () => {
  expectInvalid("if (true) 1 else { 2; }");
});

// If statement tests
test("if statement without else", () => {
  expectValid("let mut x = 0; if (true) { x = 1; } x", "", 1);
});

test("if statement without else false branch", () => {
  expectValid("let mut x = 0; if (false) { x = 1; } x", "", 0);
});

test("if-else statement", () => {
  expectValid("let mut x = 0; if (true) { x = 1; } else { x = 2; } x", "", 1);
});

test("if-else statement false branch", () => {
  expectValid("let mut x = 0; if (false) { x = 1; } else { x = 2; } x", "", 2);
});

test("if-else-if statement", () => {
  expectValid("let mut x = 0; let y = 2; if (y == 1) { x = 10; } else if (y == 2) { x = 20; } else { x = 30; } x", "", 20);
});

test("if-else-if falls through to else", () => {
  expectValid("let mut x = 0; let y = 5; if (y == 1) { x = 10; } else if (y == 2) { x = 20; } else { x = 30; } x", "", 30);
});

test("if statement with multiple statements", () => {
  expectValid("let mut x = 0; let mut y = 0; if (true) { x = 1; y = 2; } x + y", "", 3);
});

test("if statement with let inside", () => {
  expectValid("let mut x = 0; if (true) { let y = 5; x = y; } x", "", 5);
});

test("if statement with comparison condition", () => {
  expectValid("let mut x = 0; if (1 < 2) { x = 10; } x", "", 10);
});

test("if statement with variable condition", () => {
  expectValid("let mut x = 0; let c: Bool = true; if (c) { x = 1; } x", "", 1);
});

test("if statement with complex condition", () => {
  expectValid("let mut x = 0; if (true && false) { x = 1; } else { x = 2; } x", "", 2);
});

test("if statement with negated condition", () => {
  expectValid("let mut x = 0; if (!false) { x = 42; } x", "", 42);
});

test("nested if statements", () => {
  expectValid("let mut x = 0; if (true) { if (true) { x = 1; } } x", "", 1);
});

test("if statement as last statement", () => {
  expectValid("let mut x = 1; if (x == 1) { x = 2; }", "", 0);
});

test("if-else-if without final else", () => {
  expectValid("let mut x = 0; let y = 2; if (y == 1) { x = 10; } else if (y == 2) { x = 20; } x", "", 20);
});

test("if-expression with block expression in branch is valid", () => {
  expectValid("if (true) { 1 } else 2", "", 1);
});

test("if statement with non-bool condition is invalid", () => {
  expectInvalid("if (42) { 1; }");
});

test("if statement with missing else for expression branch", () => {
  expectInvalid("if (true) 1");
});

// Compound assignment tests
test("+= compound assignment", () => {
  expectValid("let mut x = 1; x += 2; x", "", 3);
});

test("-= compound assignment", () => {
  expectValid("let mut x = 10; x -= 3; x", "", 7);
});

test("*= compound assignment", () => {
  expectValid("let mut x = 4; x *= 5; x", "", 20);
});

test("/= compound assignment", () => {
  expectValid("let mut x = 10; x /= 2; x", "", 5);
});

test("%= compound assignment", () => {
  expectValid("let mut x = 10; x %= 3; x", "", 1);
});

test("compound assignment with expression", () => {
  expectValid("let mut x = 1; x += 2 + 3; x", "", 6);
});

test("compound assignment chained", () => {
  expectValid("let mut x = 1; x += 2; x *= 3; x", "", 9);
});

test("compound assignment with suffix", () => {
  expectValid("let mut x = 100U8; x += 50; x", "", 150);
});

test("compound assignment with float", () => {
  const generated = compile("let mut x = 3.14; x += 1; x");
  const fn = new Function(generated);
  const result = fn();
  expect(Math.abs(result - 4.14)).toBeLessThan(0.001);
});

test("compound assignment with type annotation", () => {
  expectValid("let mut x: U8 = 100; x += 50; x", "", 150);
});

test("compound assignment RHS type mismatch", () => {
  expectInvalid("let mut x: U8 = 100; x += true;");
});

test("compound assignment to immutable variable is invalid", () => {
  expectInvalid("let x = 1; x += 2;");
});

test("compound assignment with Bool type mismatch", () => {
  expectInvalid("let mut x: Bool = true; x += 1;");
});

test("compound assignment with non-bool to Bool variable", () => {
  expectInvalid("let mut x: Bool = true; x = false; x += 1;");
});

// While statement tests
test("basic while loop", () => {
  expectValid("let mut x = 0; while (x < 3) { x = x + 1; } x", "", 3);
});

test("while loop with counter", () => {
  expectValid("let mut i = 0; let mut sum = 0; while (i < 5) { sum = sum + i; i = i + 1; } sum", "", 10);
});

test("while loop that never executes", () => {
  expectValid("let mut x = 0; while (x > 1) { x = x + 1; } x", "", 0);
});

test("while loop with comparison condition", () => {
  expectValid("let mut x = 10; while (x > 5) { x = x - 1; } x", "", 5);
});

test("while loop with boolean variable", () => {
  expectValid("let mut running: Bool = true; let mut count = 0; while (running) { count = count + 1; if (count == 3) { running = false; } } count", "", 3);
});

test("while loop with compound assignment", () => {
  expectValid("let mut x = 0; while (x < 4) { x += 2; } x", "", 4);
});

test("while loop with <= condition", () => {
  expectValid("let mut x = 0; while (x <= 2) { x = x + 1; } x", "", 3);
});

test("while loop with >= condition", () => {
  expectValid("let mut x = 10; while (x >= 8) { x = x - 1; } x", "", 7);
});

test("while loop with == condition", () => {
  expectValid("let mut x = 0; while (x == 0) { x = 1; } x", "", 1);
});

test("while loop with != condition", () => {
  expectValid("let mut x = 0; while (x != 2) { x = x + 1; } x", "", 2);
});

test("while loop with && condition", () => {
  expectValid("let mut x = 0; let mut y = 0; while (x < 3 && y < 3) { x = x + 1; y = y + 1; } x", "", 3);
});

test("while loop with || condition", () => {
  expectValid("let mut x = 0; let mut y = 5; while (x < 3 || y > 10) { x = x + 1; y = y - 1; } x", "", 3);
});

test("while loop with ! condition", () => {
  expectValid("let mut done: Bool = false; let mut x = 0; while (!done) { x = x + 1; if (x >= 3) { done = true; } } x", "", 3);
});

test("while loop nested in block", () => {
  expectValid("{ let mut x = 0; while (x < 2) { x = x + 1; } x }", "", 2);
});

test("while loop as last statement returns 0", () => {
  expectValid("let mut x = 0; while (x < 1) { x = x + 1; }", "", 0);
});

test("while loop with expression in body", () => {
  expectValid("let mut x = 0; while (x < 3) { x = x * 2 + 1; } x", "", 3);
});

test("while loop with float", () => {
  expectValid("let mut x = 0.0; while (x < 2.5) { x = x + 1.0; } x", "", 3.0);
});

test("while loop with complex condition", () => {
  expectValid("let mut x = 0; while (x + 1 < 4) { x = x + 1; } x", "", 3);
});

test("while with non-bool condition is invalid", () => {
  expectInvalid("let mut x = 0; while (x) { x = x + 1; }");
});

test("while with string-like condition is invalid", () => {
  expectInvalid("while (42) { }");
});

test("while missing opening paren is invalid", () => {
  expectInvalid("while true { }");
});

test("while missing closing paren is invalid", () => {
  expectInvalid("let mut x = 0; while (x < 3 { x = x + 1; }");
});

test("while missing opening brace is invalid", () => {
  expectInvalid("let mut x = 0; while (x < 3) x = x + 1;");
});

test("while missing closing brace is invalid", () => {
  expectInvalid("let mut x = 0; while (x < 3) { x = x + 1");
});

test("empty while body", () => {
  expectValid("let mut x = 0; while (x < 0) { } x", "", 0);
});

test("while with multiple statements in body", () => {
  expectValid("let mut x = 0; let mut y = 0; while (x < 3) { x = x + 1; y = y + 10; } y", "", 30);
});

test("while with nested while", () => {
  expectValid("let mut x = 0; let mut y = 0; while (x < 2) { while (y < 3) { y = y + 1; }; x = x + 1; } x + y", "", 5);
});

test("while loop with let inside body", () => {
  expectValid("let mut x = 0; while (x < 2) { let y = 10; x = x + y; } x", "", 10);
});

test("while with Bool-typed condition variable", () => {
  expectValid("let mut flag: Bool = true; let mut x = 0; while (flag) { x = x + 1; if (x >= 2) { flag = false; } } x", "", 2);
});

// Function tests
test("simple function call", () => {
  expectValid("fn add(a: U8, b: U8) : U8 => { a + b }; add(1, 2)", "", 3);
});

test("function with no parameters", () => {
  expectValid("fn fortyTwo() : U8 => { 42 }; fortyTwo()", "", 42);
});

test("function with one parameter", () => {
  expectValid("fn double(x: U8) : U8 => { x * 2 }; double(7)", "", 14);
});

test("function with three parameters", () => {
  expectValid("fn sum(a: U8, b: U8, c: U8) : U8 => { a + b + c }; sum(1, 2, 3)", "", 6);
});

test("function returning Bool", () => {
  expectValid("fn isPositive(x: U8) : Bool => { x > 0 }; isPositive(5)", "", 1);
});

test("function with Bool parameter", () => {
  expectValid("fn notBool(x: Bool) : Bool => { !x }; notBool(true)", "", 0);
});

test("function called multiple times", () => {
  expectValid("fn inc(x: U8) : U8 => { x + 1 }; inc(inc(0))", "", 2);
});

test("function with complex body", () => {
  expectValid("fn max(a: U8, b: U8) : U8 => { if (a > b) a else b }; max(3, 7)", "", 7);
});

test("function with let inside body", () => {
  expectValid("fn square(x: U8) : U8 => { let y = x * x; y }; square(5)", "", 25);
});

test("function with while inside body", () => {
  expectValid("fn factorial(n: U8) : U8 => { let mut result = 1; let mut i = 1; while (i <= n) { result = result * i; i = i + 1; } result }; factorial(5)", "", 120);
});

test("function with compound assignment in body", () => {
  expectValid("fn addTen(x: U8) : U8 => { x += 10; x }; addTen(5)", "", 15);
});

test("function with float return", () => {
  expectValid("fn half(x: F64) : F64 => { x / 2.0 }; half(7.0)", "", 3.5);
});

test("function with F32 return", () => {
  expectValid("fn pi() : F32 => { 3.14 }; pi()", "", parseFloat(3.14.toPrecision(6)));
});

test("function used in expression", () => {
  expectValid("fn inc(x: U8) : U8 => { x + 1 }; inc(1) + inc(2)", "", 5);
});

test("function assigned to variable", () => {
  expectValid("fn getVal() : U8 => { 42 }; let x = getVal(); x", "", 42);
});

test("function with comparison in body", () => {
  expectValid("fn isEven(x: U8) : Bool => { x % 2 == 0 }; isEven(4)", "", 1);
});

test("function with nested function call", () => {
  expectValid("fn addOne(x: U8) : U8 => { x + 1 }; fn addTwo(x: U8) : U8 => { addOne(addOne(x)) }; addTwo(5)", "", 7);
});

test("forward reference to function", () => {
  expectValid("fn addTwo(x: U8) : U8 => { addOne(addOne(x)) }; fn addOne(x: U8) : U8 => { x + 1 }; addTwo(5)", "", 7);
});

test("mutual recursion", () => {
  expectValid("fn isEven(x: U8) : Bool => { if (x == 0) true else isOdd(x - 1) }; fn isOdd(x: U8) : Bool => { if (x == 0) false else isEven(x - 1) }; isEven(4)", "", 1);
});

test("function with block expression in body", () => {
  expectValid("fn getVal() : U8 => { { 42 } }; getVal()", "", 42);
});

test("function with if-else in body", () => {
  expectValid("fn abs(x: I8) : I8 => { if (x >= 0) x else -x }; abs(-5)", "", 5);
});

test("function with multiple statements in body", () => {
  expectValid("fn swapSum(a: U8, b: U8) : U8 => { let s = a + b; let d = a - b; s + d }; swapSum(3, 4)", "", 6);
});

test("function with Bool return and complex condition", () => {
  expectValid("fn inRange(x: U8, lo: U8, hi: U8) : Bool => { x >= lo && x <= hi }; inRange(5, 1, 10)", "", 1);
});

test("function with I32 parameter", () => {
  expectValid("fn negate(x: I32) : I32 => { -x }; negate(42)", "", -42);
});

test("function with U16 parameter", () => {
  expectValid("fn addU16(a: U16, b: U16) : U16 => { a + b }; addU16(1000, 2000)", "", 3000);
});

test("function with U32 parameter", () => {
  expectValid("fn addU32(a: U32, b: U32) : U32 => { a + b }; addU32(100, 200)", "", 300);
});

test("function with I16 parameter", () => {
  expectValid("fn subI16(a: I16, b: I16) : I16 => { a - b }; subI16(10, 3)", "", 7);
});

test("function with I8 parameter", () => {
  expectValid("fn addI8(a: I8, b: I8) : I8 => { a + b }; addI8(50, 30)", "", 80);
});

test("function with no return type annotation", () => {
  expectInvalid("fn bad() => { 42 }; bad()");
});

test("function with missing parameter type", () => {
  expectInvalid("fn bad(x) : U8 => { x }; bad(1)");
});

test("function with duplicate parameter name", () => {
  expectInvalid("fn bad(x: U8, x: U8) : U8 => { x }; bad(1, 2)");
});

test("function with duplicate name", () => {
  expectInvalid("fn f() : U8 => { 1 }; fn f() : U8 => { 2 }; f()");
});

test("function call with wrong number of args (too few)", () => {
  expectInvalid("fn add(a: U8, b: U8) : U8 => { a + b }; add(1)");
});

test("function call with wrong number of args (too many)", () => {
  expectInvalid("fn add(a: U8, b: U8) : U8 => { a + b }; add(1, 2, 3)");
});

test("function call with undeclared function", () => {
  expectInvalid("undefinedFunc()");
});

test("function with missing opening brace", () => {
  expectInvalid("fn f(x: U8) : U8 => x; f(1)");
});

test("function with missing closing brace", () => {
  expectInvalid("fn f(x: U8) : U8 => { x; f(1)");
});

test("function with missing return type colon", () => {
  expectInvalid("fn f(x: U8) U8 => { x }; f(1)");
});

test("function with missing arrow", () => {
  expectInvalid("fn f(x: U8) : U8 { x }; f(1)");
});

test("function with missing LPAREN", () => {
  expectInvalid("fn f : U8 => { 1 }; f()");
});

test("function with missing RPAREN", () => {
  expectInvalid("fn f(x: U8 : U8 => { x }; f(1)");
});

test("function using variable from outer scope is invalid", () => {
  expectInvalid("let x = 10; fn f() : U8 => { x }; f()");
});

test("function parameter shadows top-level variable is invalid", () => {
  expectInvalid("let x = 10; fn f(x: U8) : U8 => { x }; f(5)");
});

test("function call in while condition", () => {
  expectValid("fn isDone(x: U8) : Bool => { x >= 3 }; let mut i = 0; while (!isDone(i)) { i = i + 1; } i", "", 3);
});

test("function returning if-else expression", () => {
  expectValid("fn sign(x: I8) : I8 => { if (x > 0) 1 else if (x < 0) -1 else 0 }; sign(-5)", "", -1);
});

test("function with empty body returns 0", () => {
  expectValid("fn nothing() : U8 => { }; nothing()", "", 0);
});

test("function with semicolon in body", () => {
  expectValid("fn f() : U8 => { 1; 2 }; f()", "", 2);
});

test("function call as argument to another function", () => {
  expectValid("fn inc(x: U8) : U8 => { x + 1 }; fn add(a: U8, b: U8) : U8 => { a + b }; add(inc(1), inc(2))", "", 5);
});

test("array literal", () => {
  expectValid("let arr = [1, 2, 3]; arr[1]", "", 2);
});

test("array with type annotation", () => {
  expectValid("let arr: [U8; 3] = [1, 2, 3]; arr[0]", "", 1);
});

test("array indexing with variable", () => {
  expectValid("let arr = [10, 20, 30]; let i = 2; arr[i]", "", 30);
});

test("array in expression", () => {
  expectValid("let arr = [5, 10]; arr[0] + arr[1]", "", 15);
});

test("array with different types", () => {
  expectValid("let arr = [1.5, 2.5]; arr[0]", "", 1.5);
});

test("array with Bool elements", () => {
  expectValid("let arr = [true, false]; arr[0]", "", 1);
});

test("array length 1", () => {
  expectValid("let arr = [42]; arr[0]", "", 42);
});

test("array with expressions", () => {
  expectValid("let arr = [1 + 2, 3 * 4]; arr[1]", "", 12);
});

test("array assigned to mut variable", () => {
  expectValid("let mut arr = [1, 2, 3]; arr[0] = 10; arr[0]", "", 10);
});

test("array indexing in function", () => {
  expectValid("fn getFirst(arr: [U8; 3]) : U8 => { arr[0] }; getFirst([5, 6, 7])", "", 5);
});

test("array with type annotation wrong length is invalid", () => {
  expectInvalid("let arr: [U8; 2] = [1, 2, 3]; arr[0]");
});

test("array with type annotation wrong element type is invalid", () => {
  expectInvalid("let arr: [Bool; 2] = [1, 2]; arr[0]");
});

test("array index out of bounds is invalid", () => {
  expectInvalid("let arr = [1, 2, 3]; arr[5]");
});

test("array index negative is invalid", () => {
  expectInvalid("let arr = [1, 2, 3]; arr[-1]");
});

test("array with non-constant length is invalid", () => {
  expectInvalid("let x = 3; let arr: [U8; x] = [1, 2, 3]");
});

test("array with function call in literal", () => {
  expectValid("fn getVal() : U8 => { 99 }; let arr = [getVal(), 1]; arr[0]", "", 99);
});

test("array of arrays not supported", () => {
  expectInvalid("let arr = [[1, 2], [3, 4]]");
});

// Struct tests
test("struct definition and instantiation", () => {
  expectValid("struct Point { x : I32, y : I32 }; let p = Point { x: 1, y: 2 }; p.x", "", 1);
});

test("struct field access", () => {
  expectValid("struct Point { x : I32, y : I32 }; let p = Point { x: 10, y: 20 }; p.y", "", 20);
});

test("struct with type annotation", () => {
  expectValid("struct Point { x : I32, y : I32 }; let p: Point = Point { x: 5, y: 10 }; p.x", "", 5);
});

test("struct mut field assignment", () => {
  expectValid("struct S { mut x : I32 }; let mut s = S { x: 1 }; s.x = 10; s.x", "", 10);
});

test("struct immutable field cannot be assigned", () => {
  expectInvalid("struct S { x : I32 }; let mut s = S { x: 1 }; s.x = 10");
});

test("struct immutable instance cannot have field assigned", () => {
  expectInvalid("struct S { mut x : I32 }; let s = S { x: 1 }; s.x = 10");
});

test("struct as function parameter", () => {
  expectValid("struct Point { x : I32, y : I32 }; fn distX(p: Point) : I32 => { p.x }; distX(Point { x: 42, y: 0 })", "", 42);
});

test("struct as function return type", () => {
  expectValid("struct Point { x : I32, y : I32 }; fn makePoint() : Point => { Point { x: 7, y: 8 } }; let p = makePoint(); p.x", "", 7);
});

test("struct with multiple fields", () => {
  expectValid("struct Rect { x : I32, y : I32, w : I32, h : I32 }; let r = Rect { x: 0, y: 0, w: 100, h: 50 }; r.w", "", 100);
});

test("struct with Bool field", () => {
  expectValid("struct Flag { active : Bool }; let f = Flag { active: true }; f.active", "", 1);
});

test("struct with F64 field", () => {
  expectValid("struct Vec { x : F64, y : F64 }; let v = Vec { x: 3.14, y: 2.71 }; v.x", "", 3.14);
});

test("struct field in expression", () => {
  expectValid("struct Point { x : I32, y : I32 }; let p = Point { x: 3, y: 4 }; p.x + p.y", "", 7);
});

test("struct nested field access", () => {
  expectValid("struct Inner { val : I32 }; struct Outer { inner : Inner }; let o = Outer { inner: Inner { val: 42 } }; o.inner.val", "", 42);
});

test("struct with array field", () => {
  expectValid("struct S { arr: [I32; 2] }; let s = S { arr: [10, 20] }; s.arr[0]", "", 10);
});

test("struct field assignment with expression", () => {
  expectValid("struct S { mut x : I32 }; let mut s = S { x: 1 }; s.x = 5 + 3; s.x", "", 8);
});

test("struct duplicate field in instantiation is invalid", () => {
  expectInvalid("struct S { x : I32 }; let s = S { x: 1, x: 2 }");
});

test("struct missing field in instantiation is invalid", () => {
  expectInvalid("struct S { x : I32, y : I32 }; let s = S { x: 1 }");
});

test("struct unknown struct name is invalid", () => {
  expectInvalid("let p = Point { x: 1, y: 2 }");
});

test("struct unknown field in instantiation is invalid", () => {
  expectInvalid("struct S { x : I32 }; let s = S { x: 1, z: 2 }");
});

test("struct wrong field type is invalid", () => {
  expectInvalid("struct S { x : I32 }; let s = S { x: true }");
});

test("struct definition duplicate name is invalid", () => {
  expectInvalid("struct S { x : I32 }; struct S { y : I32 }");
});

test("struct with single field", () => {
  expectValid("struct Wrapper { val : I32 }; let w = Wrapper { val: 99 }; w.val", "", 99);
});

test("struct used in if-else", () => {
  expectValid("struct Point { x : I32 }; let p = if (true) { Point { x: 1 } } else { Point { x: 2 } }; p.x", "", 1);
});

test("struct field compound assignment", () => {
  expectValid("struct S { mut x : I32 }; let mut s = S { x: 5 }; s.x += 3; s.x", "", 8);
});

test("struct field access on function result", () => {
  expectValid("struct Point { x : I32, y : I32 }; fn getPoint() : Point => { Point { x: 15, y: 25 } }; getPoint().x", "", 15);
});


