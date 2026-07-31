import { test, expect } from "bun:test";
import { evaluate } from ".";

function checkOk(source: string) {
  const result = evaluate(source);
  expect(result.ok).toBe(true);
  return result.ok ? result.value : 0;
}

function checkErr(source: string) {
  const result = evaluate(source);
  expect(result.ok).toBe(false);
}

test('evaluate("") => 0', () => {
  expect(checkOk("")).toBe(0);
});

test('evaluate(" ") => 0', () => {
  expect(checkOk(" ")).toBe(0);
});
test('evaluate("1") => 1', () => {
  expect(checkOk("1")).toBe(1);
});
test('evaluate("1 + 2") => 3', () => {
  expect(checkOk("1 + 2")).toBe(3);
});
test('evaluate("1 + 2 + 3") => 6', () => {
  expect(checkOk("1 + 2 + 3")).toBe(6);
});
test('evaluate("2 + 3 - 4") => 1', () => {
  expect(checkOk("2 + 3 - 4")).toBe(1);
});
test('evaluate("2 * 3 - 4") => 2', () => {
  expect(checkOk("2 * 3 - 4")).toBe(2);
});
test('evaluate("2 + 3 * 4") => 14', () => {
  expect(checkOk("2 + 3 * 4")).toBe(14);
});
test('evaluate("(2 + 3) * 4") => 20', () => {
  expect(checkOk("(2 + 3) * 4")).toBe(20);
});
test('evaluate("(2 + 3) / 4") => 1', () => {
  expect(checkOk("(2 + 3) / 4")).toBe(1);
});
test('evaluate("{ 2 + 3 } * 4") => 20', () => {
  expect(checkOk("{ 2 + 3 } * 4")).toBe(20);
});
test('evaluate("{ let x = 2 + 3; x } * 4") => 20', () => {
  expect(checkOk("{ let x = 2 + 3; x } * 4")).toBe(20);
});
test('evaluate("let y = { let x = 2 + 3; x } * 4; y") => 20', () => {
  expect(checkOk("let y = { let x = 2 + 3; x } * 4; y")).toBe(20);
});
test('evaluate("let x = 0; let x = 1; x") => 1', () => {
  expect(checkOk("let x = 0; let x = 1; x")).toBe(1);
});
test('evaluate("let x = { let x = 1; 0 }; x") => 0', () => {
  expect(checkOk("let x = { let x = 1; 0 }; x")).toBe(0);
});
test('evaluate("undefinedIdentifier") => Error', () => {
  checkErr("undefinedIdentifier");
});
test('evaluate("let x = y; x") => Error', () => {
  checkErr("let x = y; x");
});

test('evaluate("let x = 100;") => 0', () => {
  expect(checkOk("let x = 100;")).toBe(0);
});

test('evaluate("let mut x = 0; x = 1; x") => 1', () => {
  expect(checkOk("let mut x = 0; x = 1; x")).toBe(1);
});

test('evaluate("let mut x = 0; { x = 1; } x") => 1', () => {
  expect(checkOk("let mut x = 0; { x = 1; } x")).toBe(1);
});

test('evaluate("{ let x = 1; } x") => Error', () => {
  checkErr("{ let x = 1; } x");
});

test('evaluate("let x = true; x") => 1', () => {
  expect(checkOk("let x = true; x")).toBe(1);
});

test('evaluate("let x = true; let y = false; x || y") => 1', () => {
  expect(checkOk("let x = true; let y = false; x || y")).toBe(1);
});

test('evaluate("let x = true; let y = false; x && y") => 0', () => {
  expect(checkOk("let x = true; let y = false; x && y")).toBe(0);
});

test('evaluate("let x = 0; let y = 1; x < y") => 1', () => {
  expect(checkOk("let x = 0; let y = 1; x < y")).toBe(1);
});

test('evaluate("let x = 0; let y = 1; x > y") => 0', () => {
  expect(checkOk("let x = 0; let y = 1; x > y")).toBe(0);
});

test('evaluate("let x = 0; let y = 1; x <= y") => 1', () => {
  expect(checkOk("let x = 0; let y = 1; x <= y")).toBe(1);
});

test('evaluate("let x = 0; let y = 1; x >= y") => 0', () => {
  expect(checkOk("let x = 0; let y = 1; x >= y")).toBe(0);
});

test('evaluate("let x = if (true) 2 else 3; x") => 2', () => {
  expect(checkOk("let x = if (true) 2 else 3; x")).toBe(2);
});

test('evaluate("let x = if (false) 2 else if (false) 3 else 4; x") => 4', () => {
  expect(checkOk("let x = if (false) 2 else if (false) 3 else 4; x")).toBe(4);
});

test('evaluate("let x = { let y = 100; }; x") => Error', () => {
  checkErr("let x = { let y = 100; }; x");
});

test('evaluate("let x = { let mut y = 100; y = 0; }; x") => Error', () => {
  checkErr("let x = { let mut y = 100; y = 0; }; x");
});

test('evaluate("let mut y = 0; let x = { y = 100; y = 0; }; x") => Error', () => {
  checkErr("let mut y = 0; let x = { y = 100; y = 0; }; x");
});

test('evaluate("let mut x = 0; if (true) { x = 1; 0 } else { x = 2; 0 } x") => 1', () => {
  expect(
    checkOk("let mut x = 0; if (true) { x = 1; 0 } else { x = 2; 0 } x"),
  ).toBe(1);
});

test('evaluate("let y = if (false) { let x = 100; x } else { let x = 100; }; y") => Error', () => {
  checkErr("let y = if (false) { let x = 100; x } else { let x = 100; }; y");
});

test('evaluate("let mut x = 0; if (false) { x = 1; } x") => 0', () => {
  expect(checkOk("let mut x = 0; if (false) { x = 1; } x")).toBe(0);
});

test('evaluate("let mut x = 0; if (true) { x = 1; } else { x = 2; } x") => 1', () => {
  expect(checkOk("let mut x = 0; if (true) { x = 1; } else { x = 2; } x")).toBe(
    1,
  );
});

test('evaluate("let mut x = 0; x += 1; x") => 1', () => {
  expect(checkOk("let mut x = 0; x += 1; x")).toBe(1);
});

test('evaluate("let mut x = 0; x -= 1; x") => -1', () => {
  expect(checkOk("let mut x = 0; x -= 1; x")).toBe(-1);
});

test('evaluate("let mut x = 0; while (x < 4) { x += 1; } x") => 4', () => {
  expect(checkOk("let mut x = 0; while (x < 4) { x += 1; } x")).toBe(4);
});

test('evaluate("let mut x = 0; while (x < 4) x += 1; x") => 4', () => {
  expect(checkOk("let mut x = 0; while (x < 4) x += 1; x")).toBe(4);
});

test('evaluate("let mut x = 0; while (x < 4) { x += 1; continue; } x") => 4', () => {
  expect(checkOk("let mut x = 0; while (x < 4) { x += 1; continue; } x")).toBe(
    4,
  );
});

test('evaluate("let mut x = 0; while (x < 4) { x += 1; break; } x") => 1', () => {
  expect(checkOk("let mut x = 0; while (x < 4) { x += 1; break; } x")).toBe(1);
});

test('evaluate("let x = match (100) { case 100 => 1; case _ => 2; }; x") => 1', () => {
  expect(
    checkOk("let x = match (100) { case 100 => 1; case _ => 2; }; x"),
  ).toBe(1);
});
