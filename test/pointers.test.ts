import { test, expect, describe } from "bun:test";
import { interpret } from "../src";

describe("pointers", () => {
  test('interpret("let x = 1; let ptr : &I32 = &x; *ptr") => 1', () => {
    expect(interpret("let x = 1; let ptr : &I32 = &x; *ptr")).toBe(1);
  });

  test('interpret("let mut x = 0; let y : &mut I32 = &mut x; *y = 1; x") => 1', () => {
    expect(
      interpret("let mut x = 0; let y : &mut I32 = &mut x; *y = 1; x"),
    ).toBe(1);
  });

  test('interpret("let mut x = 1; let y : &mut I32 = &mut x; *y += 2; x") => 3', () => {
    expect(
      interpret("let mut x = 1; let y : &mut I32 = &mut x; *y += 2; x"),
    ).toBe(3);
  });

  test('interpret("let mut x = 0; let y = &x; *y = 3;") => Error', () => {
    expect(() => interpret("let mut x = 0; let y = &x; *y = 3;")).toThrow();
  });

  test('interpret("let x = 0; let y = &x; y") => Error (pointer not coercible)', () => {
    expect(() => interpret("let x = 0; let y = &x; y")).toThrow();
  });

  test('interpret("&1") => Error (ref non-identifier)', () => {
    expect(() => interpret("&1")).toThrow();
  });

  test('interpret("*5") => Error (deref non-pointer)', () => {
    expect(() => interpret("*5")).toThrow();
  });

  test('interpret("let x = 1; &x[0]") => Error (ref index)', () => {
    expect(() => interpret("let x = 1; &x[0]")).toThrow();
  });

  // Union with Null must be narrowed before dereferencing
  test('interpret("type P = &I32 | Null; let x = 42; let p : P = &x; *p") => Error (deref union with null)', () => {
    expect(() =>
      interpret("type P = &I32 | Null; let x = 42; let p : P = &x; *p"),
    ).toThrow();
  });

  test('interpret("type P = &I32 | Null; let p : P = null; *p") => Error (deref union with null)', () => {
    expect(() =>
      interpret("type P = &I32 | Null; let p : P = null; *p"),
    ).toThrow();
  });

  test('interpret("type P = &I32 | Null; let x = 42; let p : P = &x; if (p is &I32) { *p } else { 0 }") => 42', () => {
    expect(
      interpret(
        "type P = &I32 | Null; let x = 42; let p : P = &x; if (p is &I32) { *p } else { 0 }",
      ),
    ).toBe(42);
  });

  test('interpret("type P = &I32 | Null; let p : P = null; if (p is &I32) { 1 } else { 2 }") => 2', () => {
    expect(
      interpret(
        "type P = &I32 | Null; let p : P = null; if (p is &I32) { 1 } else { 2 }",
      ),
    ).toBe(2);
  });
});
