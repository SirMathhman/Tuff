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
});
