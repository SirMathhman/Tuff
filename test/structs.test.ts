import { test, expect, describe } from "bun:test";
import { interpret } from "../src";

describe("structs", () => {
  test('interpret("struct Empty {}") => 0', () => {
    expect(interpret("struct Empty {}")).toBe(0);
  });

  test('interpret("struct Empty { x : I32 }") => 0', () => {
    expect(interpret("struct Empty { x : I32 }")).toBe(0);
  });

  test('interpret("struct Empty { x : I32, y : I32 }") => 0', () => {
    expect(interpret("struct Empty { x : I32, y : I32 }")).toBe(0);
  });

  test('interpret("struct Empty { x : I32, x : I32 }") => Error', () => {
    expect(() => interpret("struct Empty { x : I32, x : I32 }")).toThrow();
  });

  test('interpret("struct Point { x : I32, y : I32 } let pt = Point { x : 3, y : 4 }; pt.x + pt.y") => 7', () => {
    expect(
      interpret(
        "struct Point { x : I32, y : I32 } let pt = Point { x : 3, y : 4 }; pt.x + pt.y",
      ),
    ).toBe(7);
  });

  test('interpret("struct Point { x : I32, y : I32 } let pt : Point = Point { x : 3, y : 4 }; pt.x + pt.y") => 7', () => {
    expect(
      interpret(
        "struct Point { x : I32, y : I32 } let pt : Point = Point { x : 3, y : 4 }; pt.x + pt.y",
      ),
    ).toBe(7);
  });

  test('interpret("struct Point { x : I32 } let p = Point { x : 1 }; p.z") => Error (unknown field)', () => {
    expect(() =>
      interpret("struct Point { x : I32 } let p = Point { x : 1 }; p.z"),
    ).toThrow();
  });

  test('interpret("let x = 1; x.y") => Error (field on non-struct)', () => {
    expect(() => interpret("let x = 1; x.y")).toThrow();
  });

  test('interpret("struct Foo { x : I32 } let f = Foo { y : 1 };") => Error (unknown struct field)', () => {
    expect(() =>
      interpret("struct Foo { x : I32 } let f = Foo { y : 1 };"),
    ).toThrow();
  });

  test('interpret("let x = Bar { x : 1 };") => Error (undefined struct)', () => {
    expect(() => interpret("let x = Bar { x : 1 };")).toThrow();
  });

  test('interpret("struct Empty {} let empty = Empty {}; empty") => Error (struct not coercible)', () => {
    expect(() =>
      interpret("struct Empty {} let empty = Empty {}; empty"),
    ).toThrow();
  });

  test('interpret("struct Point { x : I32 } let a = Point { x : 1 }; let b = Point { x : 2 }; a == b") => Error (no == for structs)', () => {
    expect(() =>
      interpret(
        "struct Point { x : I32 } let a = Point { x : 1 }; let b = Point { x : 2 }; a == b",
      ),
    ).toThrow();
  });

  test('interpret("struct Wrapper<T> { field : T } let wrapper : Wrapper<I32> = Wrapper<I32> { field : 100 }; wrapper.field") => 100', () => {
    expect(
      interpret(
        "struct Wrapper<T> { field : T } let wrapper : Wrapper<I32> = Wrapper<I32> { field : 100 }; wrapper.field",
      ),
    ).toBe(100);
  });

  test('interpret("struct Wrapper<T> { field : T } let wrapper = Wrapper<U64> { field : 100 }; wrapper.field is U64") => 1', () => {
    expect(
      interpret(
        "struct Wrapper<T> { field : T } let wrapper = Wrapper<U64> { field : 100 }; wrapper.field is U64",
      ),
    ).toBe(1);
  });

  test('interpret("struct Wrapper<T> { field : T } let a : Wrapper<I32> = Wrapper<I32> { field : 1 }; let b : Wrapper<I32> = Wrapper<I32> { field : 2 }; a is Wrapper<I32>") => 1 (type identity)', () => {
    expect(
      interpret(
        "struct Wrapper<T> { field : T } let a : Wrapper<I32> = Wrapper<I32> { field : 1 }; let b : Wrapper<I32> = Wrapper<I32> { field : 2 }; a is Wrapper<I32>",
      ),
    ).toBe(1);
  });

  test('interpret("struct Box<T> { val : T } struct Wrapper<T> { field : T } let b : Box<Wrapper<I32>> = Box<Wrapper<I32>> { val : Wrapper<I32> { field : 5 } }; b.val.field") => 5 (nested generics)', () => {
    expect(
      interpret(
        "struct Box<T> { val : T } struct Wrapper<T> { field : T } let b : Box<Wrapper<I32>> = Box<Wrapper<I32>> { val : Wrapper<I32> { field : 5 } }; b.val.field",
      ),
    ).toBe(5);
  });

  test('interpret("struct Ptr<T> { p : &T } let x = 42; let ptr : Ptr<I32> = Ptr<I32> { p : &x }; *ptr.p") => 42 (generic with pointer field)', () => {
    expect(
      interpret(
        "struct Ptr<T> { p : &T } let x = 42; let ptr : Ptr<I32> = Ptr<I32> { p : &x }; *ptr.p",
      ),
    ).toBe(42);
  });

  test('interpret("struct Wrapper<T> { field : T } let w = Wrapper<I32> { field : 1 };") => Error (wrong type arg count)', () => {
    expect(() =>
      interpret(
        "struct Wrapper<T> { field : T } let w = Wrapper<I32, Bool> { field : 1 };",
      ),
    ).toThrow();
  });

  test('interpret("struct Point { mut x : I32, y : I32 } let mut pt = Point { x : 3, y : 4 }; pt.x = 10; pt.x") => 10 (mut field + mut var)', () => {
    expect(
      interpret(
        "struct Point { mut x : I32, y : I32 } let mut pt = Point { x : 3, y : 4 }; pt.x = 10; pt.x",
      ),
    ).toBe(10);
  });

  test('interpret("struct Point { mut x : I32 } let pt = Point { x : 3 }; pt.x = 10") => Error (immutable var)', () => {
    expect(() =>
      interpret(
        "struct Point { mut x : I32 } let pt = Point { x : 3 }; pt.x = 10",
      ),
    ).toThrow();
  });

  test('interpret("struct Point { x : I32 } let mut pt = Point { x : 3 }; pt.x = 10") => Error (immutable field)', () => {
    expect(() =>
      interpret(
        "struct Point { x : I32 } let mut pt = Point { x : 3 }; pt.x = 10",
      ),
    ).toThrow();
  });

  test('interpret("struct Point { mut x : I32 } let mut pt = Point { x : 3 }; pt.y = 10") => Error (unknown field)', () => {
    expect(() =>
      interpret(
        "struct Point { mut x : I32 } let mut pt = Point { x : 3 }; pt.y = 10",
      ),
    ).toThrow();
  });
});
