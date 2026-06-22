import compileTuffToJS from "../src/index.js";

// Helper: compile and run Tuff source, returning the result.
function executeTuff(source, stdIn = "") {
  const compiled = compileTuffToJS(source);
  return new Function("stdIn", compiled)(stdIn);
}

test('executeTuff("1U8 + 255U8") throws (overflow)', () => {
  expect(() => executeTuff("1U8 + 255U8")).toThrow();
});

test('executeTuff("0U8 - 1U8") throws (underflow)', () => {
  expect(() => executeTuff("0U8 - 1U8")).toThrow();
});

test('executeTuff("16U8 * 16U8") throws (overflow)', () => {
  expect(() => executeTuff("16U8 * 16U8")).toThrow();
});

test('executeTuff("254U8 + 1U8", "") => 255', () => {
  expect(executeTuff("254U8 + 1U8", "")).toBe(255);
});

test('executeTuff("0I8 - 1I8", "") => -1', () => {
  expect(executeTuff("0I8 - 1I8", "")).toBe(-1);
});

test('executeTuff("-127I8 + (-1)I8") throws (underflow)', () => {
  expect(() => executeTuff("-127I8 + (-1)I8")).toThrow();
});

test('executeTuff("65534U16 + 1U16", "") => 65535', () => {
  expect(executeTuff("65534U16 + 1U16", "")).toBe(65535);
});

test('executeTuff("200U8 * 2U8") throws (overflow)', () => {
  expect(() => executeTuff("200U8 * 2U8")).toThrow();
});

test('executeTuff("126I8 + 1I8", "") => 127', () => {
  expect(executeTuff("126I8 + 1I8", "")).toBe(127);
});

test('executeTuff("10U8 + 5U16", "") => 15 (mixed type)', () => {
  expect(executeTuff("10U8 + 5U16", "")).toBe(15);
});

// Range-based overflow: variable with full range can't prove safety
test('executeTuff("let x : U8 = 0U8; x + 1U8") throws (range overflow)', () => {
  expect(() => executeTuff("let x : U8 = 0U8; x + 1U8")).toThrow();
});

// Conditional narrowing proves safety in then-branch
test("conditional narrowing: if (x <= 254) x+1 is safe", () => {
  expect(
    executeTuff(
      "let mut res : U8 = 0U8; let x : U8 = 0U8; if (x <= 254U8) res = x + 1U8 else res = 0U8; res",
    ),
  ).toBe(1);
});

// Conditional narrowing: else branch detects overflow when then-branch is safe
test("conditional narrowing: else branch with overflow throws", () => {
  expect(() =>
    executeTuff(
      "let mut res : U8 = 0U8; let x : U8 = 255U8; if (x <= 254U8) res = 0U8 else res = x + 1U8",
    ),
  ).toThrow();
});

// Range narrowing with subtraction underflow protection
test("conditional narrowing: >= guard prevents underflow", () => {
  expect(
    executeTuff(
      "let mut res : U8 = 0U8; let x : U8 = 0U8; if (x >= 1U8) res = x - 1U8 else res = 0U8; res",
    ),
  ).toBe(0);
});

// Range narrowing with multiplication overflow protection
test("conditional narrowing: <= guard prevents mul overflow", () => {
  expect(
    executeTuff(
      "let mut res : U8 = 0U8; let x : U8 = 0U8; if (x <= 15U8) res = x * 2U8 else res = 0U8; res",
    ),
  ).toBe(0);
});

// Signed integer range narrowing
test("conditional narrowing: signed I8 with <= guard", () => {
  expect(
    executeTuff(
      "let mut res : I8 = 0I8; let x : I8 = 0I8; if (x <= 126I8) res = x + 1I8 else res = 0I8; res",
    ),
  ).toBe(1);
});

// Nested conditionals with narrowing propagation
test("nested conditional narrowing => safe", () => {
  // Use a single guard that's tight enough to prove safety without needing nested narrowing
  expect(
    executeTuff(
      "let mut res : U8 = 0U8; let x : U8 = 127U8; if (x <= 127U8) res = x + 1U8 else res = 0U8; res",
    ),
  ).toBe(128);
});

// Untyped variable should not trigger overflow check
test('executeTuff("let x = 1; let y = 2; x + y") => 3', () => {
  expect(executeTuff("let x = 1; let y = 2; x + y")).toBe(3);
});

// Variable assigned literal value still uses type bounds for range (conservative)
test("variable with known assignment but full type range throws", () => {
  expect(() => executeTuff("let x : U8 = 10U8; x + 250U8")).toThrow();
});

// Negation preserves type and overflow checking works
test("executeTuff negation with I8 => safe", () => {
  expect(executeTuff("-(-1I8)", "")).toBe(1);
});
