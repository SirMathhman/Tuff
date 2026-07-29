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
});
