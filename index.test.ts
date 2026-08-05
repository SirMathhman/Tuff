import { test, expect } from "bun:test";
import { evaluate } from ".";

test('evaluate("") => 0', () => {
  expect(evaluate("")).toBe(0);
});

test('evaluate(" ") => 0', () => {
  expect(evaluate(" ")).toBe(0);
});

test('evaluate("1") => 1', () => {
  expect(evaluate("1")).toBe(1);
});

test('evaluate("1 + 2") => 3', () => {
  expect(evaluate("1 + 2")).toBe(3);
});

test('evaluate("1 + 2 + 3") => 6', () => {
  expect(evaluate("1 + 2 + 3")).toBe(6);
});

test('evaluate("2 + 3 - 1") => 4', () => {
  expect(evaluate("2 + 3 - 1")).toBe(4);
});

test('evaluate("2 * 3 + 4") => 10', () => {
  expect(evaluate("2 * 3 + 4")).toBe(10);
});

test('evaluate("2 + 3 * 4") => 14', () => {
  expect(evaluate("2 + 3 * 4")).toBe(14);
});

test('evaluate("(2 + 3) * 4") => 20', () => {
  expect(evaluate("(2 + 3) * 4")).toBe(20);
});

test('evaluate("{ 2 + 3 } * 4") => 20', () => {
  expect(evaluate("{ 2 + 3 } * 4")).toBe(20);
});

test('evaluate("{ let x = 2 + 3; x } * 4") => 20', () => {
  expect(evaluate("{ let x = 2 + 3; x } * 4")).toBe(20);
});

test('evaluate("let y = { let x = 2 + 3; x } * 4; y") => 20', () => {
  expect(evaluate("let y = { let x = 2 + 3; x } * 4; y")).toBe(20);
});

test('evaluate("let x = 0; let x = 1; x") => 1', () => {
  expect(evaluate("let x = 0; let x = 1; x")).toBe(1);
});

test('evaluate("let x = { let y = 100; }; x") => Error', () => {
  expect(() => evaluate("let x = { let y = 100; }; x")).toThrow();
});

test('evaluate("let mut x = 0; x = 1; x") => 1', () => {
  expect(evaluate("let mut x = 0; x = 1; x")).toBe(1);
});

test('evaluate("let x = true; x") => 1', () => {
  expect(evaluate("let x = true; x")).toBe(1);
});

test('evaluate("let x = false; x") => 0', () => {
  expect(evaluate("let x = false; x")).toBe(0);
});

test('evaluate("let x = 2; let y = 2; x == y") => 1', () => {
  expect(evaluate("let x = 2; let y = 2; x == y")).toBe(1);
});

test('evaluate("true == 1") => 0', () => {
  expect(evaluate("true == 1")).toBe(0);
});

test('evaluate("let x = true; let y = false; x || y") => 1', () => {
  expect(evaluate("let x = true; let y = false; x || y")).toBe(1);
});

test('evaluate("let x = true; let y = false; x && y") => 0', () => {
  expect(evaluate("let x = true; let y = false; x && y")).toBe(0);
});

test('evaluate("1 < 2") => 1', () => {
  expect(evaluate("1 < 2")).toBe(1);
});

test('evaluate("2 < 1") => 0', () => {
  expect(evaluate("2 < 1")).toBe(0);
});

test('evaluate("1 <= 1") => 1', () => {
  expect(evaluate("1 <= 1")).toBe(1);
});

test('evaluate("2 <= 1") => 0', () => {
  expect(evaluate("2 <= 1")).toBe(0);
});

test('evaluate("2 > 1") => 1', () => {
  expect(evaluate("2 > 1")).toBe(1);
});

test('evaluate("1 > 2") => 0', () => {
  expect(evaluate("1 > 2")).toBe(0);
});

test('evaluate("1 >= 1") => 1', () => {
  expect(evaluate("1 >= 1")).toBe(1);
});

test('evaluate("1 >= 2") => 0', () => {
  expect(evaluate("1 >= 2")).toBe(0);
});

test('evaluate("1 != 2") => 1', () => {
  expect(evaluate("1 != 2")).toBe(1);
});

test('evaluate("1 != 1") => 0', () => {
  expect(evaluate("1 != 1")).toBe(0);
});

test('evaluate("let x = true; !x") => 0', () => {
  expect(evaluate("let x = true; !x")).toBe(0);
});

test('evaluate("let x = 100; -x") => -100', () => {
  expect(evaluate("let x = 100; -x")).toBe(-100);
});

test('evaluate("let x = if (false) 2 else 3; x") => 3', () => {
  expect(evaluate("let x = if (false) 2 else 3; x")).toBe(3);
});

test('evaluate("let x = if (false) 2 else if (false) 3 else 4; x") => 4', () => {
  expect(evaluate("let x = if (false) 2 else if (false) 3 else 4; x")).toBe(4);
});

test('evaluate("let mut x = 0; { x = 1; } x") => 1', () => {
  expect(evaluate("let mut x = 0; { x = 1; } x")).toBe(1);
});

test('evaluate("let mut x = 0; if (false) { x = 1; } else { x = 2; } x") => 2', () => {
  expect(evaluate("let mut x = 0; if (false) { x = 1; } else { x = 2; } x")).toBe(2);
});

test('evaluate("let mut x = 0; if (false) x = 1; else x = 2; x") => 2', () => {
  expect(evaluate("let mut x = 0; if (false) x = 1; else x = 2; x")).toBe(2);
});

test('evaluate("let mut x = 1; x += 2; x") => 3', () => {
  expect(evaluate("let mut x = 1; x += 2; x")).toBe(3);
});

test('evaluate("let mut x = 0; while (x < 4) { x += 1; } x") => 4', () => {
  expect(evaluate("let mut x = 0; while (x < 4) { x += 1; } x")).toBe(4);
});

test('evaluate("let mut x = 0; while (x < 4) { x += 1; continue; } x") => 4', () => {
  expect(evaluate("let mut x = 0; while (x < 4) { x += 1; continue; } x")).toBe(4);
});

test('evaluate("let mut x = 0; while (x < 4) { x += 1; break; } x") => 1', () => {
  expect(evaluate("let mut x = 0; while (x < 4) { x += 1; break; } x")).toBe(1);
});

test('evaluate("let mut x = 0; while (x < 4) x += 1; x") => 4', () => {
  expect(evaluate("let mut x = 0; while (x < 4) x += 1; x")).toBe(4);
});

test('evaluate("let mut x = 0; if (true) x = 4; x") => 4', () => {
  expect(evaluate("let mut x = 0; if (true) x = 4; x")).toBe(4);
});

test('"apple"[0]" => 97', () => {
  expect(evaluate('"apple"[0]')).toBe(97);
});

test('"apple".length" => 5', () => {
  expect(evaluate('"apple".length')).toBe(5);
});

test('"test" == "test" => 1', () => {
  expect(evaluate('"test" == "test"')).toBe(1);
});

test('"apple" < "banana" => 1', () => {
  expect(evaluate('"apple" < "banana"')).toBe(1);
});

test('fn get() => { if (true) yield 1; 2 } + 3; get() => 4', () => {
  expect(evaluate('fn get() => { if (true) yield 1; 2 } + 3; get()')).toBe(4);
});

test('fn get() => { if (true) return 1; 2 } + 3; get() => 1', () => {
  expect(evaluate('fn get() => { if (true) return 1; 2 } + 3; get()')).toBe(1);
});

test('let pt = { x : 3, y : 4 }; pt.x + pt.y => 7', () => {
  expect(evaluate('let pt = { x : 3, y : 4 }; pt.x + pt.y')).toBe(7);
});

test('let mut array = [0]; array[0] = 100; array[0] => 100', () => {
  expect(evaluate('let mut array = [0]; array[0] = 100; array[0]')).toBe(100);
});

test('evaluate("let x = { if (true) yield 4; 0 }; x") => 4', () => {
  expect(evaluate("let x = { if (true) yield 4; 0 }; x")).toBe(4);
});

test('evaluate("fn add(x, y) => x + y; add(3, 4)") => 7', () => {
  expect(evaluate("fn add(x, y) => x + y; add(3, 4)")).toBe(7);
});

test('evaluate("fn add(x, y) => { x + y } add(3, 4)") => 7', () => {
  expect(evaluate("fn add(x, y) => { x + y } add(3, 4)")).toBe(7);
});

test('evaluate("let mut x = 0; fn addOnce() => { x += 1; } addOnce(); x") => 1', () => {
  expect(evaluate("let mut x = 0; fn addOnce() => { x += 1; } addOnce(); x")).toBe(1);
});

test('evaluate("let x = 100; let y = &x; *y") => 100', () => {
  expect(evaluate("let x = 100; let y = &x; *y")).toBe(100);
});

test('evaluate("let mut x = 0; let y = &mut x; *y = 100;  x") => 100', () => {
  expect(evaluate("let mut x = 0; let y = &mut x; *y = 100;  x")).toBe(100);
});

test('evaluate("let tuple = (3, 4); tuple.0 + tuple.1") => 7', () => {
  expect(evaluate("let tuple = (3, 4); tuple.0 + tuple.1")).toBe(7);
});

test('evaluate("fn get() => 100; let func = get; func()") => 100', () => {
  expect(evaluate("fn get() => 100; let func = get; func()")).toBe(100);
});

test('evaluate("let mut sum = 0; for (i in 0..4) sum += i; sum") => 6', () => {
  expect(evaluate("let mut sum = 0; for (i in 0..4) sum += i; sum")).toBe(6);
});

test('evaluate("let x = match (1) { case 1 => 2; case _ => 3; }; x") => 2', () => {
  expect(evaluate("let x = match (1) { case 1 => 2; case _ => 3; }; x")).toBe(2);
});

test('evaluate("let x = match (4) { case 1 => 2; case _ => 3; }; x") => 3', () => {
  expect(evaluate("let x = match (4) { case 1 => 2; case _ => 3; }; x")).toBe(3);
});

test('evaluate("let x = null; x") => 0', () => {
  expect(evaluate("let x = null; x")).toBe(0);
});

test('evaluate("let array = [1, 2, 3]; array[0] + array[1] + array[2]") => 6', () => {
  expect(evaluate("let array = [1, 2, 3]; array[0] + array[1] + array[2]")).toBe(6);
});

test("'a' => 97", () => {
  expect(evaluate("'a'")).toBe(97);
});

test("'\\n' => 10", () => {
  expect(evaluate("'\\n'")).toBe(10);
});