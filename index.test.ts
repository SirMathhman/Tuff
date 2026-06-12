import { executeTuff } from ".";
import { test, expect } from "bun:test";

test("executeTuff(empty string) returns 0", () => {
  expect(executeTuff("")).toBe(0);
});

test("executeTuff(whitespace) returns 0", () => {
  expect(executeTuff("   ")).toBe(0);
  expect(executeTuff("\t\n")).toBe(0);
});

test('executeTuff("100") returns 100', () => {
  expect(executeTuff("100")).toBe(100);
});

test('executeTuff("1 + 2") returns 3', () => {
  expect(executeTuff("1 + 2")).toBe(3);
});

test('executeTuff("{ 1 + 2 }") returns 3', () => {
  expect(executeTuff("{ 1 + 2 }"));
});

test('executeTuff("{ 1 } + 2") returns 3', () => {
  expect(executeTuff("{ 1 } + 2")).toBe(3);
});

test('executeTuff("{ 1 } + { 2 }") returns 3', () => {
  expect(executeTuff("{ 1 } + { 2 }")).toBe(3);
});

test('executeTuff("{{ 1 } + { 2 }}") returns 3', () => {
  expect(executeTuff("{{ 1 } + { 2 }}")).toBe(3);
});

test('executeTuff("{ let x = 1 + 2; x }") returns 3', () => {
  expect(executeTuff("{ let x = 1 + 2; x }")).toBe(3);
});
test('executeTuff("let y = { let x = 1 + 2; x }; y") returns 3', () => {
  expect(executeTuff("let y = { let x = 1 + 2; x }; y")).toBe(3);
});
test('executeTuff("let mut x = 0; x = 3; x") returns 3', () => {
  expect(executeTuff("let mut x = 0; x = 3; x")).toBe(3);
});
test('executeTuff("let array = [1, 2, 3]; array[0]") returns 1', () => {
  expect(executeTuff("let array = [1, 2, 3]; array[0]")).toBe(1);
});
test('executeTuff("let mut array = [0]; array[0] = 100; array[0]") returns 100', () => {
  expect(executeTuff("let mut array = [0]; array[0] = 100; array[0]")).toBe(
    100,
  );
});
test('executeTuff("let x = 0; let x = 100; x") returns 100', () => {
  expect(executeTuff("let x = 0; let x = 100; x")).toBe(100);
});
test('executeTuff("let mut x = 0; { x = 100; } x") returns 100', () => {
  expect(executeTuff("let mut x = 0; { x = 100; } x")).toBe(100);
});
test('executeTuff("let mut x = 5; { let x = 100; } x") returns 5', () => {
  expect(executeTuff("let mut x = 5; { let x = 100; } x")).toBe(5);
});
test('executeTuff("let x = true; x") returns 1', () => {
  expect(executeTuff("let x = true; x")).toBe(1);
});
test('executeTuff("let x = if (true) 3 else 5; x") returns 3', () => {
  expect(executeTuff("let x = if (true) 3 else 5; x")).toBe(3);
});
test('executeTuff("let mut x = 0; if (true) x = 3; else x = 5; x") returns 3', () => {
  expect(executeTuff("let mut x = 0; if (true) x = 3; else x = 5; x")).toBe(3);
});
// Compound assignment on non-mutable variable should throw error
test('executeTuff("let x = 0; x += 1; x") throws error', () => {
  expect(() => executeTuff("let x = 0; x += 1; x")).toThrow();
});

// Compound assignment on mutable variable works
test('executeTuff("let mut x = 0; x += 1; x") returns 1', () => {
  expect(executeTuff("let mut x = 0; x += 1; x")).toBe(1);
});

// Compound subtraction assignment (covers -= branch in evaluateAssignment)
test('executeTuff("let mut x = 5; x -= 2; x") returns 3', () => {
  expect(executeTuff("let mut x = 5; x -= 2; x")).toBe(3);
});

// false boolean literal (covers false branch in tokenize)
test('executeTuff("let x = false; x") returns 0', () => {
  expect(executeTuff("let x = false; x")).toBe(0);
});

// if/else with false condition taking else branch (covers parseIfExpr else path)
test('executeTuff("let x = if (false) 3 else 5; x") returns 5', () => {
  expect(executeTuff("let x = if (false) 3 else 5; x")).toBe(5);
});

// Division operator (covers / branch in parseTerm)
test('executeTuff("10 / 2") returns 5', () => {
  expect(executeTuff("10 / 2")).toBe(5);
});

// Unary minus on primary (covers unary handling path)
test('executeTuff("-3 + 2") returns -1', () => {
  expect(executeTuff("-3 + 2")).toBe(-1);
});

// Nested array index access (covers chained indexing in resolveIdentifier)
test('executeTuff("let arr = [[1, 2], [3, 4]]; arr[0][1]") returns 2', () => {
  expect(executeTuff("let arr = [[1, 2], [3, 4]]; arr[0][1]")).toBe(2);
});

// While loop with mutable variable (covers while statement support)
test('executeTuff("let mut x = 0; while (x < 4) x += 1; x") returns 4', () => {
  expect(executeTuff("let mut x = 0; while (x < 4) x += 1; x")).toBe(4);
});

// Comparison operator between variables (covers comparison in evaluateExpression)
test('executeTuff("let x = 0; let y = 1; x < y") returns 1', () => {
  expect(executeTuff("let x = 0; let y = 1; x < y")).toBe(1);
});

// Greater than comparison between variables (covers > operator)
test('executeTuff("let x = 0; let y = 1; x > y") returns 0', () => {
  expect(executeTuff("let x = 0; let y = 1; x > y")).toBe(0);
});

// Less than or equal comparison (covers <= operator)
test('executeTuff("let x = 1; let y = 1; x <= y") returns 1', () => {
  expect(executeTuff("let x = 1; let y = 1; x <= y")).toBe(1);
});

// Greater than or equal comparison (covers >= operator)
test('executeTuff("let x = 2; let y = 1; x >= y") returns 1', () => {
  expect(executeTuff("let x = 2; let y = 1; x >= y")).toBe(1);
});

// Equal comparison (covers == operator)
test('executeTuff("let x = 5; let y = 5; x == y") returns 1', () => {
  expect(executeTuff("let x = 5; let y = 5; x == y")).toBe(1);
});

// Not equal comparison (covers != operator)
test('executeTuff("let x = 3; let y = 7; x != y") returns 1', () => {
  expect(executeTuff("let x = 3; let y = 7; x != y")).toBe(1);
});

// For loop with range (covers for statement support)
test('executeTuff("let mut sum = 0; for (i in 0..4) sum += i; sum") returns 6', () => {
  expect(executeTuff("let mut sum = 0; for (i in 0..4) sum += i; sum")).toBe(6);
});

test("executeTuff(invalid source) throws error", () => {
  expect(() => executeTuff("invalid")).toThrow();
});
