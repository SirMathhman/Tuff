import { test, expect } from "bun:test";
import { interpret } from "../src";

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
  expect(
    interpret("let mut x = 0; if (false) { x = 3; } else { x = 5; } x"),
  ).toBe(5);
});

test('interpret("let mut x = 0; if (false) { x = 3; } x") => 0', () => {
  expect(interpret("let mut x = 0; if (false) { x = 3; } x")).toBe(0);
});

test('interpret("let mut x = 0; if (false) x = 1; else if (true) x = 2; else x = 3; x") => 2', () => {
  expect(
    interpret(
      "let mut x = 0; if (false) x = 1; else if (true) x = 2; else x = 3; x",
    ),
  ).toBe(2);
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
  expect(() =>
    interpret("let mut x: U8 = 0; if (true) x = false; x"),
  ).toThrow();
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
  expect(() =>
    interpret("fn get() : U16 => 100; let x : U8 = get();"),
  ).toThrow();
});

test('interpret("fn add(first : I32, second : I32) => first + second; add(3, 4)") => 7', () => {
  expect(
    interpret("fn add(first : I32, second : I32) => first + second; add(3, 4)"),
  ).toBe(7);
});

test('interpret("fn add(x : I32, x : I32) => x + x; add(3, 4)") => Error', () => {
  expect(() =>
    interpret("fn add(x : I32, x : I32) => x + x; add(3, 4)"),
  ).toThrow();
});

test('interpret("fn get(x : U8) => x; let y = 100U16; get(y);") => Error', () => {
  expect(() =>
    interpret("fn get(x : U8) => x; let y = 100U16; get(y);"),
  ).toThrow();
});

test('interpret("struct Point { x : I32, y : I32 } let point : Point = Point { x : 3, y : 4 }; point.x + point.y") => 7', () => {
  expect(
    interpret(
      "struct Point { x : I32, y : I32 } let point : Point = Point { x : 3, y : 4 }; point.x + point.y",
    ),
  ).toBe(7);
});

test('interpret("struct Point { x : I32 } struct Point { y : I32 }") => Error', () => {
  expect(() =>
    interpret("struct Point { x : I32 } struct Point { y : I32 }"),
  ).toThrow();
});

test('interpret("struct Point { x : I32, x : I32 }") => Error', () => {
  expect(() => interpret("struct Point { x : I32, x : I32 }")).toThrow();
});

test('interpret("struct Point { x : I32, y : I32 } let p : Point = Point { x : 3 }; p.x") => Error', () => {
  expect(() =>
    interpret(
      "struct Point { x : I32, y : I32 } let p : Point = Point { x : 3 }; p.x",
    ),
  ).toThrow();
});

test('interpret("struct Point { x : I32 } let p : Point = Point { x : 3, y : 4 }; p.x") => Error', () => {
  expect(() =>
    interpret(
      "struct Point { x : I32 } let p : Point = Point { x : 3, y : 4 }; p.x",
    ),
  ).toThrow();
});

test('interpret("struct Point { x : U8 } let v = 300U16; let p : Point = Point { x : v }; p.x") => Error', () => {
  expect(() =>
    interpret(
      "struct Point { x : U8 } let v = 300U16; let p : Point = Point { x : v }; p.x",
    ),
  ).toThrow();
});

test('interpret("struct Point { x : I32, y : I32 } struct Line { start : Point, end : Point } let line : Line = Line { start : Point { x : 0, y : 0 }, end : Point { x : 10, y : 20 } }; line.start.x + line.end.y") => 20', () => {
  expect(
    interpret(
      "struct Point { x : I32, y : I32 } struct Line { start : Point, end : Point } let line : Line = Line { start : Point { x : 0, y : 0 }, end : Point { x : 10, y : 20 } }; line.start.x + line.end.y",
    ),
  ).toBe(20);
});

test('interpret("let x = 100; let y : &I32 = &x; *y") => 100', () => {
  expect(interpret("let x = 100; let y : &I32 = &x; *y")).toBe(100);
});

test('interpret("let x = 100U8; let y : &U16 = &x;") => Error', () => {
  expect(() => interpret("let x = 100U8; let y : &U16 = &x;")).toThrow();
});

test('interpret("let mut x = 0; let y : &mut I32 = &mut x; *y = 100; x") => 100', () => {
  expect(
    interpret("let mut x = 0; let y : &mut I32 = &mut x; *y = 100; x"),
  ).toBe(100);
});

// ── Signed Integer Types ──────────────────────────────────────────────────

test('interpret("let x: I8 = -100; x") => -100', () => {
  expect(interpret("let x: I8 = -100; x")).toBe(-100);
});

test('interpret("let x: I8 = 127; x") => 127', () => {
  expect(interpret("let x: I8 = 127; x")).toBe(127);
});

test('interpret("let x: I8 = 128; x") => Error', () => {
  expect(() => interpret("let x: I8 = 128; x")).toThrow();
});

test('interpret("let x: I8 = -129; x") => Error', () => {
  expect(() => interpret("let x: I8 = -129; x")).toThrow();
});

test('interpret("let x: I16 = -300; x") => -300', () => {
  expect(interpret("let x: I16 = -300; x")).toBe(-300);
});

test('interpret("let x: I32 = -1000; x") => -1000', () => {
  expect(interpret("let x: I32 = -1000; x")).toBe(-1000);
});

test('interpret("let x: I64 = -1000000; x") => -1000000', () => {
  expect(interpret("let x: I64 = -1000000; x")).toBe(-1000000);
});

// ── U64 Type ──────────────────────────────────────────────────────────────

test('interpret("let x: U64 = 1000000; x") => 1000000', () => {
  expect(interpret("let x: U64 = 1000000; x")).toBe(1000000);
});

test('interpret("let x: U64 = 9007199254740992; x") => 9007199254740992', () => {
  expect(interpret("let x: U64 = 9007199254740992; x")).toBe(9007199254740992);
});

test('interpret("let x: U64 = 90071992547409920; x") => Error', () => {
  expect(() => interpret("let x: U64 = 90071992547409920; x")).toThrow();
});

// ── Signed Type Widening ──────────────────────────────────────────────────

test('interpret("let x: I8 = 100; let y: I16 = x; y") => 100', () => {
  expect(interpret("let x: I8 = 100; let y: I16 = x; y")).toBe(100);
});

test('interpret("let x: I16 = 100; let y: I8 = x;") => Error', () => {
  expect(() => interpret("let x: I16 = 100; let y: I8 = x;")).toThrow();
});

test('interpret("let x: U8 = 100; let y: I16 = x; y") => 100', () => {
  expect(interpret("let x: U8 = 100; let y: I16 = x; y")).toBe(100);
});

test('interpret("let x: I8 = 100; let y: U16 = x; y") => 100', () => {
  expect(interpret("let x: I8 = 100; let y: U16 = x; y")).toBe(100);
});

test('interpret("let x: U8 = 100; let y: U64 = x; y") => 100', () => {
  expect(interpret("let x: U8 = 100; let y: U64 = x; y")).toBe(100);
});

test('interpret("let x: I8 = 100; let y: I64 = x; y") => 100', () => {
  expect(interpret("let x: I8 = 100; let y: I64 = x; y")).toBe(100);
});

// ── Unary Minus ───────────────────────────────────────────────────────────

test('interpret("-5") => -5', () => {
  expect(interpret("-5")).toBe(-5);
});

test('interpret("let x = 10; -x") => -10', () => {
  expect(interpret("let x = 10; -x")).toBe(-10);
});

test('interpret("let x = 10; -x + 5") => -5', () => {
  expect(interpret("let x = 10; -x + 5")).toBe(-5);
});

test('interpret("let x: I8 = 5; -x") => -5', () => {
  expect(interpret("let x: I8 = 5; -x")).toBe(-5);
});

test('interpret("let x: I8 = 5; --x") => 5', () => {
  expect(interpret("let x: I8 = 5; --x")).toBe(5);
});

test('interpret("let x: I8 = 5; let y: I16 = -x; y") => -5', () => {
  expect(interpret("let x: I8 = 5; let y: I16 = -x; y")).toBe(-5);
});

// ── Arrays ────────────────────────────────────────────────────────────────

test('interpret("[1, 2, 3]") => Error', () => {
  // Bare array literal is not a valid final expression (returns array, not number)
  expect(() => interpret("[1, 2, 3]")).toThrow();
});

test('interpret("let arr = [1, 2, 3]; arr[0]") => 1', () => {
  expect(interpret("let arr = [1, 2, 3]; arr[0]")).toBe(1);
});

test('interpret("let arr = [1, 2, 3]; arr[1]") => 2', () => {
  expect(interpret("let arr = [1, 2, 3]; arr[1]")).toBe(2);
});

test('interpret("let arr = [1, 2, 3]; arr[2]") => 3', () => {
  expect(interpret("let arr = [1, 2, 3]; arr[2]")).toBe(3);
});

test('interpret("let arr = [1, 2, 3]; arr[3]") => Error', () => {
  expect(() => interpret("let arr = [1, 2, 3]; arr[3]")).toThrow();
});

test('interpret("let arr = [1, 2, 3]; arr[-1]") => Error', () => {
  expect(() => interpret("let arr = [1, 2, 3]; arr[-1]")).toThrow();
});

test('interpret("let arr = [1, 2, 3]; arr.length") => 3', () => {
  expect(interpret("let arr = [1, 2, 3]; arr.length")).toBe(3);
});

test('interpret("let mut arr = [1, 2, 3]; arr[0] = 10; arr[0]") => 10', () => {
  expect(interpret("let mut arr = [1, 2, 3]; arr[0] = 10; arr[0]")).toBe(10);
});

test('interpret("let arr = [1, 2, 3]; arr[0] = 10;") => Error', () => {
  expect(() => interpret("let arr = [1, 2, 3]; arr[0] = 10;")).toThrow();
});

test('interpret("let arr: [I32; 3] = [1, 2, 3]; arr[0]") => 1', () => {
  expect(interpret("let arr: [I32; 3] = [1, 2, 3]; arr[0]")).toBe(1);
});

test('interpret("let arr: [I32; 3] = [1, 2];") => Error', () => {
  // Size mismatch: declared 3, provided 2
  expect(() => interpret("let arr: [I32; 3] = [1, 2];")).toThrow();
});

test('interpret("let arr: [I32; 2] = [1, 2, 3];") => Error', () => {
  // Size mismatch: declared 2, provided 3
  expect(() => interpret("let arr: [I32; 2] = [1, 2, 3];")).toThrow();
});

test('interpret("let arr: [U8; 3] = [1, 2, 300];") => Error', () => {
  // Element type mismatch: 300 doesn't fit in U8
  expect(() => interpret("let arr: [U8; 3] = [1, 2, 300];")).toThrow();
});

test('interpret("let arr = [1, 2, 3]; let brr = [4, 5]; arr[0] + brr[1]") => 6', () => {
  expect(
    interpret("let arr = [1, 2, 3]; let brr = [4, 5]; arr[0] + brr[1]"),
  ).toBe(6);
});

test('interpret("let arr = [[1, 2], [3, 4]]; arr[0][0]") => 1', () => {
  expect(interpret("let arr = [[1, 2], [3, 4]]; arr[0][0]")).toBe(1);
});

test('interpret("let arr = [[1, 2], [3, 4]]; arr[1][1]") => 4', () => {
  expect(interpret("let arr = [[1, 2], [3, 4]]; arr[1][1]")).toBe(4);
});

test('interpret("struct Point { x : I32, y : I32 } let pts = [Point { x : 1, y : 2 }, Point { x : 3, y : 4 }]; pts[0].x + pts[1].y") => 5', () => {
  expect(
    interpret(
      "struct Point { x : I32, y : I32 } let pts = [Point { x : 1, y : 2 }, Point { x : 3, y : 4 }]; pts[0].x + pts[1].y",
    ),
  ).toBe(5);
});

test('interpret("let arr = [1, 2, 3]; let x = arr[0]; x") => 1', () => {
  expect(interpret("let arr = [1, 2, 3]; let x = arr[0]; x")).toBe(1);
});

test('interpret("let mut arr = [1, 2, 3]; let mut i = 0; while (i < arr.length) { arr[i] = arr[i] * 2; i = i + 1; } arr[0] + arr[1] + arr[2]") => 12', () => {
  expect(
    interpret(
      "let mut arr = [1, 2, 3]; let mut i = 0; while (i < arr.length) { arr[i] = arr[i] * 2; i = i + 1; } arr[0] + arr[1] + arr[2]",
    ),
  ).toBe(12);
});

// ── Closures ──────────────────────────────────────────────────────────────────

test('interpret("let f = (x: I32) => x + 1; f(5)") => 6', () => {
  expect(interpret("let f = (x: I32) => x + 1; f(5)")).toBe(6);
});

test('interpret("let f = (x: I32, y: I32) => x + y; f(3, 4)") => 7', () => {
  expect(interpret("let f = (x: I32, y: I32) => x + y; f(3, 4)")).toBe(7);
});

test('interpret("let f = (x: I32) => x > 0; f(5)") => 1', () => {
  expect(interpret("let f = (x: I32) => x > 0; f(5)")).toBe(1);
});

test('interpret("let f = (x: I32) => x > 0; f(-5)") => 0', () => {
  expect(interpret("let f = (x: I32) => x > 0; f(-5)")).toBe(0);
});

test('interpret("let x = 10; let f = (y: I32) => x + y; f(3)") => 13', () => {
  // Implicit &this capture (reference)
  expect(interpret("let x = 10; let f = (y: I32) => x + y; f(3)")).toBe(13);
});

test('interpret("let mut x = 10; let f = (y: I32) => x + y; x = 20; f(3)") => 23', () => {
  // Reference capture sees mutations
  expect(
    interpret("let mut x = 10; let f = (y: I32) => x + y; x = 20; f(3)"),
  ).toBe(23);
});

test('interpret("let x = 10; let f = (&move this, y: I32) => x + y; let x = 20; f(3)") => 13', () => {
  // Move capture snapshots value
  expect(
    interpret(
      "let x = 10; let f = (&move this, y: I32) => x + y; let x = 20; f(3)",
    ),
  ).toBe(13);
});

test('interpret("let mut x = 10; let f = (&mut this, y: I32) => { x = x + y; x }; f(5); x") => 15', () => {
  // Mutable capture can modify outer scope
  expect(
    interpret(
      "let mut x = 10; let f = (&mut this, y: I32) => { x = x + y; x }; f(5); x",
    ),
  ).toBe(15);
});

test('interpret("let f = (x: I32) => x + 1; let g = f; g(10)") => 11', () => {
  // Closure can be reassigned
  expect(interpret("let f = (x: I32) => x + 1; let g = f; g(10)")).toBe(11);
});

test('interpret("fn make_adder(a: I32) => (b: I32) => a + b; let f = make_adder(10); f(5)") => 15', () => {
  // Closure returned from function
  expect(
    interpret(
      "fn make_adder(a: I32) => (b: I32) => a + b; let f = make_adder(10); f(5)",
    ),
  ).toBe(15);
});

test('interpret("let f = (x: I32) => x + 1; f(5); f(10)") => 11', () => {
  // Closure can be called multiple times
  expect(interpret("let f = (x: I32) => x + 1; f(5); f(10)")).toBe(11);
});

test('interpret("let f = (x: I32) => x + 1; let g = (y: I32) => f(y) * 2; g(4)") => 10', () => {
  // Nested closures
  expect(
    interpret("let f = (x: I32) => x + 1; let g = (y: I32) => f(y) * 2; g(4)"),
  ).toBe(10);
});

test('interpret("let f = (x: I32) => x + 1; f(5, 10)") => Error', () => {
  // Wrong argument count
  expect(() => interpret("let f = (x: I32) => x + 1; f(5, 10)")).toThrow();
});

test('interpret("let f = (x: I32) => x + 1; f") => Error', () => {
  // Closure value cannot be final expression
  expect(() => interpret("let f = (x: I32) => x + 1; f")).toThrow();
});

test('interpret("let f = (x: I32) => x + 1; let g = f; g") => Error', () => {
  // Closure value cannot be final expression
  expect(() => interpret("let f = (x: I32) => x + 1; let g = f; g")).toThrow();
});
