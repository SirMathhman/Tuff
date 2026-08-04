import { test, expect } from "bun:test";
import { evaluate } from "../src";

test("evaluate empty string returns 0", () => {
  expect(evaluate("")).toBe(0);
});

test("evaluate whitespace string returns 0", () => {
  expect(evaluate(" ")).toBe(0);
});

test("evaluate single digit returns its value", () => {
  expect(evaluate("1")).toBe(1);
});

test("evaluate addition", () => {
  expect(evaluate("1 + 2")).toBe(3);
});

test("evaluate chained addition", () => {
  expect(evaluate("1 + 2 + 3")).toBe(6);
});

test("evaluate multiplication before addition", () => {
  expect(evaluate("2 * 3 + 4")).toBe(10);
});

test("evaluate parentheses override precedence", () => {
  expect(evaluate("2 * (3 + 4)")).toBe(14);
});

test("evaluate curly braces override precedence", () => {
  expect(evaluate("2 * { 3 + 4 }")).toBe(14);
});

test("evaluate block with variable declaration", () => {
  expect(evaluate("2 * { let x = 3 + 4; x }")).toBe(14);
});

test("evaluate top-level variable declaration", () => {
  expect(evaluate("let y = 2 * { let x = 3 + 4; x }; y")).toBe(14);
});

test("evaluate program ending in let declaration returns 0", () => {
  expect(evaluate("let x = 14;")).toBe(0);
});

test("evaluate block without expression value throws", () => {
  expect(() => evaluate("let x = { let y = 100; };")).toThrow();
});

test("evaluate mutable variable reassignment", () => {
  expect(evaluate("let mut x = 0; x = 1; x")).toBe(1);
});

test("evaluate reassigning immutable variable throws", () => {
  expect(() => evaluate("let x = 0; x = 1; x")).toThrow();
});

test("evaluate boolean literal true", () => {
  expect(evaluate("let x = true; x")).toBe(1);
});

test("evaluate logical or", () => {
  expect(evaluate("let x = true; let y = false; x || y")).toBe(1);
});

test("evaluate equality", () => {
  expect(evaluate("let x = true; let y = false; x == y")).toBe(0);
});

test("evaluate boolean not equal to number", () => {
  expect(evaluate("true == 1")).toBe(0);
});

test("evaluate logical and", () => {
  expect(evaluate("let x = true; let y = false; x && y")).toBe(0);
});

test("evaluate logical not", () => {
  expect(evaluate("!true")).toBe(0);
});

test("evaluate unary minus", () => {
  expect(evaluate("let x = 1; -x")).toBe(-1);
});

test("evaluate less than", () => {
  expect(evaluate("1 < 2")).toBe(1);
});

test("evaluate less than or equal", () => {
  expect(evaluate("2 <= 2")).toBe(1);
});

test("evaluate greater than", () => {
  expect(evaluate("3 > 2")).toBe(1);
});

test("evaluate greater than or equal", () => {
  expect(evaluate("1 >= 2")).toBe(0);
});

test("evaluate not equal", () => {
  expect(evaluate("1 != 2")).toBe(1);
});

test("evaluate if expression", () => {
  expect(evaluate("let x = if (false) 2 else 3; x")).toBe(3);
});

test("evaluate chained else if", () => {
  expect(evaluate("let x = if (false) 2 else if (false) 3 else 4; x")).toBe(4);
});

test("evaluate assignment inside block mutates outer variable", () => {
  expect(evaluate("let mut x = 0; { x = 1; } x")).toBe(1);
});

test("evaluate if with block branches", () => {
  expect(evaluate("let mut x = 0; if (false) { x = 2; } else { x = 3; } x")).toBe(3);
});

test("evaluate if without else", () => {
  expect(evaluate("let mut x = 0; if (false) { x = 2; } x")).toBe(0);
});

test("evaluate if without else keeps original value", () => {
  expect(evaluate("let mut x = 1; if (false) { x = 2; } x")).toBe(1);
});

test("evaluate compound assignment", () => {
  expect(evaluate("let mut x = 1; x += 2; x")).toBe(3);
});

test("evaluate compound subtraction assignment", () => {
  expect(evaluate("let mut x = 1; x -= 2; x")).toBe(-1);
});

test("evaluate compound multiplication assignment", () => {
  expect(evaluate("let mut x = 3; x *= 2; x")).toBe(6);
});

test("evaluate compound division assignment", () => {
  expect(evaluate("let mut x = 6; x /= 2; x")).toBe(3);
});

test("evaluate compound or assignment", () => {
  expect(evaluate("let mut x = false; x ||= true; x")).toBe(1);
});

test("evaluate compound and assignment", () => {
  expect(evaluate("let mut x = true; x &&= false; x")).toBe(0);
});

test("evaluate while loop", () => {
  expect(evaluate("let mut x = 0; while (x < 4) { x += 1; } x")).toBe(4);
});

test("evaluate while loop with statement body", () => {
  expect(evaluate("let mut x = 0; while (x < 4) x += 1; x")).toBe(4);
});

test("evaluate if with statement body", () => {
  expect(evaluate("let mut x = 0; if (x < 4) x += 1; x")).toBe(1);
});

test("evaluate break in while loop", () => {
  expect(evaluate("let mut x = 0; while (x < 4) { x += 1; break; } x")).toBe(1);
});

test("evaluate continue in while loop", () => {
  expect(evaluate("let mut x = 0; while (x < 4) { x += 1; continue; } x")).toBe(4);
});

test("evaluate match expression", () => {
  expect(evaluate("let x = match (2) { case 2 => 4; case _ => 5; }; x")).toBe(4);
});

test("evaluate match wildcard arm", () => {
  expect(evaluate("let x = match (3) { case 2 => 4; case _ => 5; }; x")).toBe(5);
});

test("evaluate reference and dereference", () => {
  expect(evaluate("let x = 1; let y = &x; *y")).toBe(1);
});

test("evaluate mutable reference assignment", () => {
  expect(evaluate("let mut x = 0; let y = &mut x; *y = 1; x")).toBe(1);
});

test("evaluate null literal", () => {
  expect(evaluate("let x = null; x")).toBe(0);
});

test("evaluate undefined identifier throws", () => {
  expect(() => evaluate("undefinedIdentifier")).toThrow();
});

test("evaluate null not equal to zero", () => {
  expect(evaluate("null == 0")).toBe(0);
});

test("evaluate match against null pattern", () => {
  expect(evaluate("match (null) { case null => 2; case _ => 3; }")).toBe(2);
});

test("evaluate match null pattern with non-null value", () => {
  expect(evaluate("match (100) { case null => 2; case _ => 3; }")).toBe(3);
});

test("evaluate function definition and call", () => {
  expect(evaluate("fn add(a, b) => a + b; add(3, 4)")).toBe(7);
});

test("evaluate function call with wrong arity throws", () => {
  expect(() => evaluate("fn add(a, b) => a + b; add(3)")).toThrow();
});

test("evaluate object literal and member access", () => {
  expect(evaluate("let pt = { x: 3, y: 4 }; pt.x + pt.y")).toBe(7);
});

test("evaluate array literal and indexing", () => {
  expect(evaluate("let array = [1, 2, 3]; array[0] + array[1] + array[2]")).toBe(6);
});

test("evaluate character literal", () => {
  expect(evaluate("'A'")).toBe(65);
});

test("evaluate character not equal to its char code", () => {
  expect(evaluate("'A' == 65")).toBe(0);
});

test("evaluate array element assignment", () => {
  expect(evaluate("let mut array = [0]; array[0] = 100; array[0]")).toBe(100);
});

