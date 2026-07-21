import { test, expect } from "bun:test";
import { interpret } from ".";

test('interpret("") => 0', () => {
  expect(interpret("")).toBe(0);
});

test('interpret(" ") => 0', () => {
  expect(interpret(" ")).toBe(0);
});

test('interpret("1") => 1', () => {
  expect(interpret("1")).toBe(1);
});

test('interpret("1 + 2") => 3', () => {
  expect(interpret("1 + 2")).toBe(3);
});

test('interpret("1 + 2 + 3") => 6', () => {
  expect(interpret("1 + 2 + 3")).toBe(6);
});

test('interpret("2 + 3 - 4") => 1', () => {
  expect(interpret("2 + 3 - 4")).toBe(1);
});

test('interpret("2 * 3 - 4") => 2', () => {
  expect(interpret("2 * 3 - 4")).toBe(2);
});

test('interpret("2 + 3 * 4") => 14', () => {
  expect(interpret("2 + 3 * 4")).toBe(14);
});

test('interpret("(2 + 3) * 4") => 20', () => {
  expect(interpret("(2 + 3) * 4")).toBe(20);
});

test('interpret("let x = (2 + 3) * 4; x") => 20', () => {
  expect(interpret("let x = (2 + 3) * 4; x")).toBe(20);
});

test('interpret("let x = (2 + 3) * 4;") => 0', () => {
  expect(interpret("let x = (2 + 3) * 4;")).toBe(0);
});

test('interpret("let x = 0; let x = 1; x") => 1', () => {
  expect(interpret("let x = 0; let x = 1; x")).toBe(1);
});

test('interpret("undefinedIdentifier") => Error', () => {
  expect(() => interpret("undefinedIdentifier")).toThrow();
});

test('interpret("let mut x = 0; x = 1; x") => 1', () => {
  expect(interpret("let mut x = 0; x = 1; x")).toBe(1);
});

test('interpret("let mut x = 1; x = 2;") => 0', () => {
  expect(interpret("let mut x = 1; x = 2;")).toBe(0);
});

test('interpret("let x = 1; x = 2;") => Error', () => {
  expect(() => interpret("let x = 1; x = 2;")).toThrow();
});

test('interpret("x = 2;") => Error', () => {
  expect(() => interpret("x = 2;")).toThrow();
});

test('interpret("let x = 0; { let x = 1; } x") => 0', () => {
  expect(interpret("let x = 0; { let x = 1; } x")).toBe(0);
});

test('interpret("let x = true; x") => 1', () => {
  expect(interpret("let x = true; x")).toBe(1);
});

test('interpret("let x = false; x") => 0', () => {
  expect(interpret("let x = false; x")).toBe(0);
});

test('interpret("true || false") => 1', () => {
  expect(interpret("true || false")).toBe(1);
});

test('interpret("true && false") => 0', () => {
  expect(interpret("true && false")).toBe(0);
});

test('interpret("let mut x = 0; if (true) x = 3; else x = 5; x") => 3', () => {
  expect(interpret("let mut x = 0; if (true) x = 3; else x = 5; x")).toBe(3);
});

test('interpret("let mut x = 0; if (false) x = 3; else x = 5; x") => 5', () => {
  expect(interpret("let mut x = 0; if (false) x = 3; else x = 5; x")).toBe(5);
});

test('interpret("let mut x = 0; if (false) { x = 3; } else { x = 5; } x") => 5', () => {
  expect(interpret("let mut x = 0; if (false) { x = 3; } else { x = 5; } x")).toBe(5);
});

test('interpret("let mut x = 0; if (false) { x = 3; } x") => 0', () => {
  expect(interpret("let mut x = 0; if (false) { x = 3; } x")).toBe(0);
});

test('interpret("let mut x = 0; if (false) x = 1; else if (true) x = 2; else x = 3; x") => 2', () => {
  expect(interpret("let mut x = 0; if (false) x = 1; else if (true) x = 2; else x = 3; x")).toBe(2);
});

test('interpret("let mut x = 1; x += 2; x") => 3', () => {
  expect(interpret("let mut x = 1; x += 2; x")).toBe(3);
});

test('interpret("let mut x = 0; while (x < 4) x += 1; x") => 4', () => {
  expect(interpret("let mut x = 0; while (x < 4) x += 1; x")).toBe(4);
});

test('interpret("100U8") => 100', () => {
  expect(interpret("100U8")).toBe(100);
});

test('interpret("256U8") => Error', () => {
  expect(() => interpret("256U8")).toThrow();
});

test('interpret("let x: U8 = 100; x") => 100', () => {
  expect(interpret("let x: U8 = 100; x")).toBe(100);
});

test('interpret("let x: U8 = 256; x") => Error', () => {
  expect(() => interpret("let x: U8 = 256; x")).toThrow();
});

test('interpret("let x = 100U16; let y: U8 = x;") => Error', () => {
  expect(() => interpret("let x = 100U16; let y: U8 = x;")).toThrow();
});

test('interpret("let x = 100U8; let y: U16 = x; y") => 100', () => {
  expect(interpret("let x = 100U8; let y: U16 = x; y")).toBe(100);
});

test('interpret("let x: Bool = true; x") => 1', () => {
  expect(interpret("let x: Bool = true; x")).toBe(1);
});

test('interpret("let mut x: U8 = 1; x = true;") => Error', () => {
  expect(() => interpret("let mut x: U8 = 1; x = true;")).toThrow();
});

test('interpret("let mut x = 0; if (1) x = 1; x") => Error', () => {
  expect(() => interpret("let mut x = 0; if (1) x = 1; x")).toThrow();
});

test('interpret("let mut x: U8 = 0; if (true) x = false; x") => Error', () => {
  expect(() => interpret("let mut x: U8 = 0; if (true) x = false; x")).toThrow();
});

test('interpret("let mut x = 0; while (1) x += 1; x") => Error', () => {
  expect(() => interpret("let mut x = 0; while (1) x += 1; x")).toThrow();
});

test('interpret("fn get() => 100; get()") => 100', () => {
  expect(interpret("fn get() => 100; get()")).toBe(100);
});

test('interpret("fn get() : I32 => 100; get()") => 100', () => {
  expect(interpret("fn get() : I32 => 100; get()")).toBe(100);
});

test('interpret("fn get() : U16 => 100; let x : U8 = get();") => Error', () => {
  expect(() => interpret("fn get() : U16 => 100; let x : U8 = get();")).toThrow();
});

test('interpret("fn add(first : I32, second : I32) => first + second; add(3, 4)") => 7', () => {
  expect(interpret("fn add(first : I32, second : I32) => first + second; add(3, 4)")).toBe(7);
});

test('interpret("fn add(x : I32, x : I32) => x + x; add(3, 4)") => Error', () => {
  expect(() => interpret("fn add(x : I32, x : I32) => x + x; add(3, 4)")).toThrow();
});

test('interpret("fn get(x : U8) => x; let y = 100U16; get(y);") => Error', () => {
  expect(() => interpret("fn get(x : U8) => x; let y = 100U16; get(y);")).toThrow();
});

test('interpret("struct Point { x : I32, y : I32 } let point : Point = Point { x : 3, y : 4 }; point.x + point.y") => 7', () => {
  expect(interpret("struct Point { x : I32, y : I32 } let point : Point = Point { x : 3, y : 4 }; point.x + point.y")).toBe(7);
});

test('interpret("struct Point { x : I32 } struct Point { y : I32 }") => Error', () => {
  expect(() => interpret("struct Point { x : I32 } struct Point { y : I32 }")).toThrow();
});

test('interpret("struct Point { x : I32, x : I32 }") => Error', () => {
  expect(() => interpret("struct Point { x : I32, x : I32 }")).toThrow();
});

test('interpret("struct Point { x : I32, y : I32 } let p : Point = Point { x : 3 }; p.x") => Error', () => {
  expect(() => interpret("struct Point { x : I32, y : I32 } let p : Point = Point { x : 3 }; p.x")).toThrow();
});

test('interpret("struct Point { x : I32 } let p : Point = Point { x : 3, y : 4 }; p.x") => Error', () => {
  expect(() => interpret("struct Point { x : I32 } let p : Point = Point { x : 3, y : 4 }; p.x")).toThrow();
});

test('interpret("struct Point { x : U8 } let v = 300U16; let p : Point = Point { x : v }; p.x") => Error', () => {
  expect(() => interpret("struct Point { x : U8 } let v = 300U16; let p : Point = Point { x : v }; p.x")).toThrow();
});

test('interpret("struct Point { x : I32, y : I32 } struct Line { start : Point, end : Point } let line : Line = Line { start : Point { x : 0, y : 0 }, end : Point { x : 10, y : 20 } }; line.start.x + line.end.y") => 20', () => {
  expect(interpret("struct Point { x : I32, y : I32 } struct Line { start : Point, end : Point } let line : Line = Line { start : Point { x : 0, y : 0 }, end : Point { x : 10, y : 20 } }; line.start.x + line.end.y")).toBe(20);
});

test('interpret("let x = 100; let y : &I32 = &x; *y") => 100', () => {
  expect(interpret("let x = 100; let y : &I32 = &x; *y")).toBe(100);
});

test('interpret("let x = 100U8; let y : &U16 = &x;") => Error', () => {
  expect(() => interpret("let x = 100U8; let y : &U16 = &x;")).toThrow();
});

