import { interpret, compile } from "../src/index";

// Test helpers
function assertValid(input: string, expected?: string): void {
  expect(() => compile(input)).not.toThrow();
  if (expected) {
    expect(compile(input)).toBe(expected);
  }
}

function assertInvalid(input: string, expectedError: string): void {
  expect(() => compile(input)).toThrow(expectedError);
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
  assertInvalid("-100U8", "Underflow: -100 is below minimum for U8 (0)");
});

test("compile throws error for I8 underflow", () => {
  assertInvalid("-129I8", "Underflow: -129 is below minimum for I8 (-128)");
});

test("compile allows valid U8 value", () => {
  assertValid("255U8", "return 255;");
});

test("compile allows valid I8 value", () => {
  assertValid("-128I8", "return -128;");
});

test("compile throws error for U8 overflow (arithmetic)", () => {
  assertInvalid("1U8 + 255U8", "Overflow: 256 is above maximum for U8 (255)");
});

test("compile throws error for mixed type arithmetic", () => {
  assertInvalid(
    "1U8 + 65535U16",
    "Type mismatch: cannot mix U16 and U8 in arithmetic expression",
  );
});
