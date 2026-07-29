import { test, expect, describe } from "bun:test";
import { interpret } from "../src";

describe("functions", () => {
  test('interpret("fn get() => 100; get()") => 100', () => {
    expect(interpret("fn get() => 100; get()")).toBe(100);
  });

  test('interpret("fn add(first : I32, second : I32) => first + second; add(3, 4)") => 7', () => {
    expect(
      interpret(
        "fn add(first : I32, second : I32) => first + second; add(3, 4)",
      ),
    ).toBe(7);
  });

  test('interpret("fn get() => 0U16; let x : U8 = get();") => Error', () => {
    expect(() => interpret("fn get() => 0U16; let x : U8 = get();")).toThrow();
  });

  test('interpret("let get = 0; fn get() => 100;") => Error', () => {
    expect(() => interpret("let get = 0; fn get() => 100;")).toThrow();
  });

  test('interpret("fn get() => 100; fn get() => 200;") => Error', () => {
    expect(() => interpret("fn get() => 100; fn get() => 200;")).toThrow();
  });

  test('interpret("fn get() => { if (true) return 3; 4 } + 2; get()") => 3', () => {
    expect(interpret("fn get() => { if (true) return 3; 4 } + 2; get()")).toBe(
      3,
    );
  });

  test('interpret("fn accept(param : U8) => {} accept(0U16)") => Error', () => {
    expect(() =>
      interpret("fn accept(param : U8) => {} accept(0U16)"),
    ).toThrow();
  });

  test('interpret("fn addOnce(this : I32) => this + 1; 100.addOnce()") => 101', () => {
    expect(interpret("fn addOnce(this : I32) => this + 1; 100.addOnce()")).toBe(
      101,
    );
  });

  test('interpret("fn foo(x : U8, x : U16) => x") => Error (duplicate param)', () => {
    expect(() => interpret("fn foo(x : U8, x : U16) => x")).toThrow();
  });

  test('interpret("fn get() : U8 => 0U16;") => Error (return type mismatch)', () => {
    expect(() => interpret("fn get() : U8 => 0U16;")).toThrow();
  });

  test('interpret("fn add(a : I32, b : I32) => a + b; add(1)") => Error (missing param)', () => {
    expect(() =>
      interpret("fn add(a : I32, b : I32) => a + b; add(1)"),
    ).toThrow();
  });

  test('interpret("fn get() => 1; get(1)") => Error (extra param)', () => {
    expect(() => interpret("fn get() => 1; get(1)")).toThrow();
  });

  test('interpret("undefinedFn()") => Error (undefined function)', () => {
    expect(() => interpret("undefinedFn()")).toThrow();
  });

  test('interpret("fn pass<T>(value : T) => value; pass(100)") => 100', () => {
    expect(interpret("fn pass<T>(value : T) => value; pass(100)")).toBe(100);
  });

  test('interpret("struct Counter { value : I32 } fn increment(this : Counter) => this.value + 1; let c = Counter { value : 10 }; c.increment()") => 11', () => {
    expect(
      interpret(
        "struct Counter { value : I32 } fn increment(this : Counter) => this.value + 1; let c = Counter { value : 10 }; c.increment()",
      ),
    ).toBe(11);
  });
});
