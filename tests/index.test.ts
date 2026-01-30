import { interpret, compile } from "../src/index";

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

// Interpret tests
test("interpret numeric literal", () => {
  expect(interpret("100")).toBe(100);
});

test("interpret returns number for numeric return", () => {
  // compile is identity for now; provide JS directly that returns a number
  expect(interpret("return 42;")).toBe(42);
});

test("interpret returns NaN for non-numeric output", () => {
  expect(Number.isNaN(interpret("return 'not-a-number';"))).toBe(true);
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
  expect(interpret("1U8 + 2U16")).toBe(3);
});

test("compile throws error for I8 underflow (arithmetic)", () => {
  expect(() => compile("-128I8 - 1I8")).toThrow(/Underflow/);
});

test("compile throws error message distinguishes underflow from overflow", () => {
  expect(() => compile("-128I8 - 1I8")).toThrow(/Underflow.*below minimum/);
});

test("interpret supports brace-wrapped numeric literals", () => {
  expect(interpret("{ 5 }")).toBe(5);
});

test("interpret supports brace-wrapped expressions", () => {
  expect(interpret("(2 + { 3 }) * 4")).toBe(20);
});

test("interpret supports variable binding in blocks", () => {
  expect(interpret("{ let x : U8 = 3; x }")).toBe(3);
});

test("interpret supports variable binding with arithmetic", () => {
  expect(interpret("(2 + { let x : U8 = 3; x }) * 4")).toBe(20);
});

test("compile throws error for duplicate variable declaration", () => {
  assertInvalid("{ let x : U8 = 3; let x : U8 = 100; x }");
});

test("interpret supports top-level variable declaration", () => {
  expect(
    interpret("let z : U8 = (2 + { let x : U8 = 3; x }) * 4;\nz"),
  ).toBe(20);
});

test("compile throws error when assigning larger type to smaller type in declaration", () => {
  assertInvalid("let x : U8 = 100U16; x");
});

test("interpret supports variable declaration without type annotation", () => {
  expect(interpret("let x = 100U8; x")).toBe(100);
});

test("compile throws error when assigning larger inferred type to smaller explicit type", () => {
  assertInvalid("let x = 100U16; let y : U8 = x; y");
});
test("interpret supports nested block expressions with variable binding", () => {
  expect(
    interpret("let x : U8 = {\n    let y : U8 = 100U8;\n    y\n};\nx"),
  ).toBe(100);
});

test("compile throws error when block expression returns larger type than variable type", () => {
  assertInvalid("let x : U8 = {\n    let y : U16 = 100;\n    y\n};\nx");
});

test("compile supports boolean type annotation", () => {
  assertValid("let x : Bool = true; x", "let x = true;\nreturn x;");
});

test("interpret returns 1 for true, 0 for false", () => {
  expect(interpret("let x : Bool = true; x")).toBe(1);
  expect(interpret("let x : Bool = false; x")).toBe(0);
});
