import { compile } from "../src/index";

// Test helpers
function assertValid(input: string, expected?: string): void {
  expect(() => compile(input)).not.toThrow();
  if (expected) {
    expect(compile(input)).toBe(expected);
  }
}

function assertInvalid(input: string): void {
  expect(() => compile(input)).toThrow();
}

function assertInterpret(source: string, expected: number): void {
  const compiled = compile(source);
  try {
    const fn = new Function(compiled);
    const result = fn();
    expect(Number(result)).toBe(expected);
  } catch (error) {
    const errorMsg =
      "Failed to interpret. Compiled JS:\n" +
      compiled +
      "\n\nOriginal error: " +
      String(error);
    throw new Error(errorMsg);
  }
}

function assertInterpretNaN(source: string): void {
  const compiled = compile(source);
  try {
    const fn = new Function(compiled);
    const result = fn();
    expect(Number.isNaN(Number(result))).toBe(true);
  } catch (error) {
    const errorMsg =
      "Failed to interpret. Compiled JS:\n" +
      compiled +
      "\n\nOriginal error: " +
      String(error);
    throw new Error(errorMsg);
  }
}

// Interpret tests
test("interpret numeric literal", () => {
  assertInterpret("100", 100);
});

test("interpret returns number for numeric return", () => {
  // compile is identity for now; provide JS directly that returns a number
  assertInterpret("return 42;", 42);
});

test("interpret returns NaN for non-numeric output", () => {
  assertInterpretNaN("return 'not-a-number';");
});

// Compile validation tests
test("compile throws error for U8 underflow", () => {
  assertInvalid("-100U8");
});

test("compile throws error for I8 underflow", () => {
  assertInvalid("-129I8");
});

test("compile allows valid U8 value", () => {
  assertValid("255U8", "return 255;");
});

test("compile allows valid I8 value", () => {
  assertValid("-128I8", "return -128;");
});

test("compile throws error for U8 overflow (arithmetic)", () => {
  assertInvalid("1U8 + 255U8");
});

test("compile throws error for mixed type arithmetic", () => {
  assertInvalid("1U8 + 2I8");
});

test("compile allows coercion of compatible unsigned integer types", () => {
  assertValid("1U8 + 2U16", "return 1 + 2;");
});

test("interpret evaluates coerced types correctly", () => {
  assertInterpret("1U8 + 2U16", 3);
});

test("compile throws error for I8 underflow (arithmetic)", () => {
  expect(() => compile("-128I8 - 1I8")).toThrow(/Underflow/);
});

test("compile throws error message distinguishes underflow from overflow", () => {
  expect(() => compile("-128I8 - 1I8")).toThrow(/Underflow.*below minimum/);
});

test("interpret supports brace-wrapped numeric literals", () => {
  assertInterpret("{ 5 }", 5);
});

test("interpret supports brace-wrapped expressions", () => {
  assertInterpret("(2 + { 3 }) * 4", 20);
});

test("interpret supports variable binding in blocks", () => {
  assertInterpret("{ let x : U8 = 3; x }", 3);
});

test("interpret supports variable binding with arithmetic", () => {
  assertInterpret("(2 + { let x : U8 = 3; x }) * 4", 20);
});

test("interpret supports if expressions", () => {
  assertInterpret("if (true) { let z = 100; z } else 5", 100);
});

test("interpret supports function declarations", () => {
  assertInterpret(
    "fn get() : I32 => {\n  let y = if (true) { let z = 100; z } else 5;\n  y\n}\nget()",
    100,
  );
});

test("compile throws error for duplicate variable declaration", () => {
  assertInvalid("{ let x : U8 = 3; let x : U8 = 100; x }");
});

test("interpret supports top-level variable declaration", () => {
  assertInterpret("let z : U8 = (2 + { let x : U8 = 3; x }) * 4;\nz", 20);
});

test("compile throws error when assigning larger type to smaller type in declaration", () => {
  assertInvalid("let x : U8 = 100U16; x");
});

test("interpret supports variable declaration without type annotation", () => {
  assertInterpret("let x = 100U8; x", 100);
});

test("interpret defaults untyped numeric bindings to I32", () => {
  assertInterpret("let x = 100; x", 100);
});

test("compile throws error when assigning larger inferred type to smaller explicit type", () => {
  assertInvalid("let x = 100U16; let y : U8 = x; y");
});
test("interpret supports nested block expressions with variable binding", () => {
  assertInterpret("let x : U8 = {\n    let y : U8 = 100U8;\n    y\n};\nx", 100);
});

test("compile throws error when block expression returns larger type than variable type", () => {
  assertInvalid("let x : U8 = {\n    let y : U16 = 100;\n    y\n};\nx");
});

test("compile supports boolean type annotation", () => {
  assertValid("let x : Bool = true; x", "let x = true;\nreturn x;");
});

test("interpret returns 1 for true, 0 for false", () => {
  assertInterpret("let x : Bool = true; x", 1);
  assertInterpret("let x : Bool = false; x", 0);
});

test("interpret converts character literals to UTF-8 codes", () => {
  assertInterpret("let a : Char = 'a'; a", 97);
});

test("interpret supports character literals in expressions", () => {
  assertInterpret("'z'", 122);
});

test("interpret supports pointer declaration and dereference", () => {
  assertInterpret("let x = 100; let y : *I32 = x; *y", 100);
});

test("interpret supports pointer with expression", () => {
  assertInterpret("let x = 42; let p : *I32 = x; *p + 8", 50);
});

test("interpret returns 0 for empty program", () => {
  assertInterpret("", 0);
});

test("interpret ignores comments before expressions", () => {
  assertInterpret("// line comment\n/* block comment */\n100", 100);
});

test("interpret supports mutable variable declaration", () => {
  assertInterpret("let mut x = 100; x", 100);
});

test("interpret supports mutable variable reassignment", () => {
  assertInterpret("let mut x = 0; x = 100; x", 100);
});

test("interpret supports multiple mutable variable reassignments", () => {
  assertInterpret("let mut x = 0; x = 100; x = 200; x", 200);
});

test("compile throws error when assigning to immutable variable", () => {
  assertInvalid("let x = 100; x = 200; x");
});
test("interpret supports mutable reference with &mut", () => {
  assertInterpret("let mut x = 0; let y : *mut I32 = &mut x; *y = 100; x", 100);
});

test("interpret supports mutable pointer assignment", () => {
  assertInterpret("let mut x = 50; let z : *mut I32 = &mut x; *z = 75; x", 75);
});

test("interpret handles empty blocks without affecting return", () => {
  assertInterpret("let mut x = 100; {} x", 100);
});

test("compile generates valid code with empty blocks", () => {
  const compiled = compile("let mut x = 100; {} x");
  // Should not have automatic semicolon insertion breaking return
  expect(compiled).toContain("return");
  // The compiled code when executed should work (no NaN)
  const fn = new Function(compiled);
  const result = fn();
  expect(Number.isNaN(Number(result))).toBe(false);
});

test("compile generates clean code without unreachable statements", () => {
  const compiled = compile("let mut x = 200; x += 100; x");
  // Should not contain unreachable code after return
  expect(compiled).not.toMatch(/return\s+[\s\S]*;\s*\w+\s*;/);
  // Should contain proper statement separator
  expect(compiled).toContain("return");
});

test("interpret supports assignment followed by expression", () => {
  assertInterpret("let mut x = 200; x += 100; x", 300);
});

test("interpret handles multiple assignments in a block", () => {
  assertInterpret("let mut x = 100; { x = 200; x = 300; } x", 300);
});

test("interpret handles if-else with assignments in blocks", () => {
  assertInterpret(
    "let mut x = 0; if (x < 10) { x = 20; } else { x = 30; } x",
    20,
  );
});

test("interpret handles if-else as trailing expression", () => {
  assertInterpret(
    "let mut x = 0; if (x < 10) { x = 20; } else { x = 30; }",
    20,
  );
});

test("interpret handles if without else followed by expression", () => {
  assertInterpret("let mut x = 1; if (x < 10) { x = 2; } x", 2);
});

test("interpret handles while loop", () => {
  assertInterpret("let mut x = 0; while (x < 4) { x += 1; } x", 4);
});

test("interpret handles function definition without invocation", () => {
  assertInterpret("fn get() : I32 => {}", 0);
});

test("interpret handles function definition with expression body", () => {
  assertInterpret("fn get() : I32 => 100", 0);
});

test("interpret handles this.property access", () => {
  assertInterpret("let x = 100; this.x", 100);
});
