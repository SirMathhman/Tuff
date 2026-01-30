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
