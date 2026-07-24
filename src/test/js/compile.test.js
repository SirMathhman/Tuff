const { test, expect } = require("bun:test");
const { compile } = require("../../main/js/compile");

function expectValid(source, args, expectedExitCode) {
  const result = compile(source);
  expect(result.error).toBeUndefined();

  const argsCopy = ["node", "test.js", ...args];
  const actualExitCode = Function("__args__", result.value)(argsCopy);
  if (actualExitCode !== expectedExitCode) {
    expect(
      "Expected '" +
        actualExitCode +
        "' to be '" +
        expectedExitCode +
        "'. Generated: " +
        result.value,
    ).toBeUndefined();
  }
}

function expectInvalid(source, expectedError) {
  const result = compile(source);
  expect(result.ok).toBe(false);
  if (expectedError !== undefined) {
    expect(result.error).toBe(expectedError);
  }
}

test("empty source compiles to valid empty program", () => {
  expectValid("", "", 0);
});

test("invalid source throws an error", () => {
  expectInvalid("garbage@#!", "Unknown source code: garbage@#!");
});

test("__args__.length returns 2 for empty args", () => {
  expectValid("__args__.length", [], 2);
});

test("let declaration with property access", () => {
  expectValid("let temp = __args__; temp.length", [], 2);
});

test("multiple let declarations with property access", () => {
  expectValid("let foo = __args__; let bar = foo; bar.length", [], 2);
});

test("let declaration with numeric literal", () => {
  expectValid("let foo = 100; foo", [], 100);
});

test("object literal with property access", () => {
  expectValid("let obj = { field : 100 }; obj.field", [], 100);
});

test("object literal with multiple fields", () => {
  expectValid("let obj = { a : 1, b : 2, c : 3 }; obj.b", [], 2);
});

test("string literal length", () => {
  expectValid('let s = "hello"; s.length', [], 5);
});

test("string literal with escape sequences", () => {
  expectValid('let s = "a\\nb\\tc"; s.length', [], 5);
});

test("string literal with escaped quote", () => {
  expectValid('let s = "he said \\"hi\\""; s.length', [], 12);
});

test("string literal in object literal", () => {
  expectValid('let obj = { name : "test" }; obj.name.length', [], 4);
});

test("empty string literal", () => {
  expectValid('let s = ""; s.length', [], 0);
});

test("simple function definition and call", () => {
  expectValid("fn double(x) => x * 2; double(5)", [], 10);
});

test("function with no parameters", () => {
  expectValid("fn getTen() => 10; getTen()", [], 10);
});

test("function with multiple parameters", () => {
  expectValid("fn add(a, b) => a + b; add(3, 7)", [], 10);
});

test("function call in let declaration", () => {
  expectValid("fn square(x) => x * x; let result = square(4); result", [], 16);
});

test("function using __args__", () => {
  expectValid("fn argLen(args) => args.length; argLen(__args__)", [], 2);
});

// --- Booleans ---

test("true literal returns 1", () => {
  expectValid("true", [], 1);
});

test("false literal returns 0", () => {
  expectValid("false", [], 0);
});

test("let declaration with boolean", () => {
  expectValid("let flag = true; flag", [], 1);
});

test("let declaration with false", () => {
  expectValid("let flag = false; flag", [], 0);
});

test("boolean in object literal", () => {
  expectValid("let obj = { flag : true }; obj.flag", [], 1);
});

test("boolean false in object literal", () => {
  expectValid("let obj = { flag : false }; obj.flag", [], 0);
});

// --- Comparison operators ---

test("equality == true", () => {
  expectValid("5 == 5", [], 1);
});

test("equality == false", () => {
  expectValid("5 == 3", [], 0);
});

test("inequality != true", () => {
  expectValid("5 != 3", [], 1);
});

test("inequality != false", () => {
  expectValid("5 != 5", [], 0);
});

test("less than < true", () => {
  expectValid("3 < 5", [], 1);
});

test("less than < false", () => {
  expectValid("5 < 3", [], 0);
});

test("greater than > true", () => {
  expectValid("5 > 3", [], 1);
});

test("greater than > false", () => {
  expectValid("3 > 5", [], 0);
});

test("less than or equal <= true (equal)", () => {
  expectValid("5 <= 5", [], 1);
});

test("less than or equal <= true (less)", () => {
  expectValid("3 <= 5", [], 1);
});

test("less than or equal <= false", () => {
  expectValid("5 <= 3", [], 0);
});

test("greater than or equal >= true (equal)", () => {
  expectValid("5 >= 5", [], 1);
});

test("greater than or equal >= true (greater)", () => {
  expectValid("5 >= 3", [], 1);
});

test("greater than or equal >= false", () => {
  expectValid("3 >= 5", [], 0);
});

// --- Logical operators ---

test("logical AND true", () => {
  expectValid("true && true", [], 1);
});

test("logical AND false", () => {
  expectValid("true && false", [], 0);
});

test("logical OR true", () => {
  expectValid("false || true", [], 1);
});

test("logical OR false", () => {
  expectValid("false || false", [], 0);
});

test("logical NOT true", () => {
  expectValid("!true", [], 0);
});

test("logical NOT false", () => {
  expectValid("!false", [], 1);
});

test("comparison in let declaration", () => {
  expectValid("let result = 5 == 5; result", [], 1);
});

test("boolean in function", () => {
  expectValid("fn isTrue() => true; isTrue()", [], 1);
});

test("comparison with variable", () => {
  expectValid("let x = 10; x > 5", [], 1);
});

test("chained logical operators", () => {
  expectValid("true && false || true", [], 1);
});

// --- Block Expressions ---

test("simple block expression with let and return value", () => {
  expectValid("{ let x = 5; x + 1 }", [], 6);
});

test("block expression as last statement in program", () => {
  expectValid("let a = 10; { let b = a * 2; b }", [], 20);
});

test("block expression in let binding", () => {
  expectValid("let result = { let x = 3; x * 4 }", [], 12);
});

test("block expression in function call argument", () => {
  expectValid("fn identity(x) => x; identity({ let y = 7; y + 3 })", [], 10);
});

test("nested block expressions", () => {
  expectValid("{ let x = 2; { let y = x + 1; y * 3 } }", [], 9);
});

test("block with multiple let declarations", () => {
  expectValid("{ let a = 1; let b = 2; a + b }", [], 3);
});

test("block with function declaration and call", () => {
  expectValid("{ fn double(x) => x * 2; double(5) }", [], 10);
});

test("block with single expression (no let)", () => {
  expectValid("{ 42 }", [], 42);
});

test("empty block returns 0", () => {
  expectValid("{}", [], 0);
});

test("block with boolean expression", () => {
  expectValid("{ let x = 5; x > 3 }", [], 1);
});

test("block with object literal inside", () => {
  expectValid("{ let obj = { val : 10 }; obj.val }", [], 10);
});

test("object literal still works (not confused with block)", () => {
  expectValid("let obj = { a : 1, b : 2 }; obj.a", [], 1);
});

test("block in binary expression", () => {
  expectValid("{ let x = 5; x } + 1", [], 6);
});

test("block with function using __args__", () => {
  expectValid("{ let args = __args__; args.length }", [], 2);
});

test("deeply nested blocks", () => {
  expectValid("{ let x = 1; { let y = 2; { let z = 3; x + y + z } } }", [], 6);
});

test("block as function body expression", () => {
  expectValid("fn compute(x) => { let y = x * 2; y + 1 }; compute(4)", [], 9);
});

// --- Match Expressions ---

test("simple match with number literal", () => {
  expectValid("let x = 100; match (x) { case 100 => 1; case _ => 0 }", [], 1);
});

test("match wildcard default", () => {
  expectValid("let x = 42; match (x) { case 100 => 1; case _ => 2 }", [], 2);
});

test("match in let binding", () => {
  expectValid(
    "let x = 5; let result = match (x) { case 5 => 10; case _ => 20 }; result",
    [],
    10,
  );
});

test("match as function argument", () => {
  expectValid(
    "fn identity(x) => x; let v = 1; identity(match (v) { case 1 => 99; case _ => 0 })",
    [],
    99,
  );
});

test("match with string literal", () => {
  expectValid(
    'let s = "hello"; match (s) { case "hello" => 1; case _ => 0 }',
    [],
    1,
  );
});

test("match with boolean literal", () => {
  expectValid("let b = true; match (b) { case true => 1; case _ => 0 }", [], 1);
});

test("match with multiple cases", () => {
  expectValid(
    "let x = 2; match (x) { case 1 => 10; case 2 => 20; case 3 => 30; case _ => 0 }",
    [],
    20,
  );
});

test("match with expression as discriminant", () => {
  expectValid("let x = 5; match (x + 5) { case 10 => 1; case _ => 0 }", [], 1);
});

test("match without wildcard is invalid", () => {
  expectInvalid(
    "let x = 1; match (x) { case 1 => 10 }",
    "Missing wildcard case",
  );
});

test("nested match expressions", () => {
  expectValid(
    "let x = 1; let y = 2; match (x) { case 1 => match (y) { case 2 => 42; case _ => 0 }; case _ => 0 }",
    [],
    42,
  );
});

test("match in binary expression", () => {
  expectValid("let x = 10; match (x) { case 10 => 5; case _ => 0 } + 3", [], 8);
});

test("match with false boolean", () => {
  expectValid(
    "let b = false; match (b) { case true => 1; case false => 2; case _ => 0 }",
    [],
    2,
  );
});

// --- Loop Expressions ---

test("simple loop with break expression", () => {
  expectValid("let x = loop { break 5 }; x", [], 5);
});

test("loop as last statement", () => {
  expectValid("loop { break 42 }", [], 42);
});

test("loop in let binding", () => {
  expectValid("let result = loop { break 10 }; result", [], 10);
});

test("loop as function argument", () => {
  expectValid("fn identity(x) => x; identity(loop { break 7 })", [], 7);
});

test("loop with expression in break", () => {
  expectValid("let x = 3; loop { break x * 2 }", [], 6);
});

test("loop without break is invalid", () => {
  expectInvalid("loop { 42 }", "Loop must contain at least one break");
});

test("nested loop expressions", () => {
  expectValid(
    "let outer = loop { let inner = loop { break 5 }; break inner + 1 }",
    [],
    6,
  );
});

test("loop in binary expression", () => {
  expectValid("loop { break 3 } + loop { break 4 }", [], 7);
});

test("loop with boolean break value", () => {
  expectValid("loop { break true }", [], 1);
});

test("loop with let and break", () => {
  expectValid("loop { let x = 2; break x + 3 }", [], 5);
});

test("loop with match inside", () => {
  expectValid(
    "let x = 1; loop { break match (x) { case 1 => 10; case _ => 20 } }",
    [],
    10,
  );
});
