import { test, expect, describe } from "bun:test";
import { interpret } from "../src";

describe("typecheck expressions", () => {
  test('interpret("5U8 is U8") => 1', () => {
    expect(interpret("5U8 is U8")).toBe(1);
  });

  test('interpret("100U8 is U8 is Bool") => 1', () => {
    expect(interpret("100U8 is U8 is Bool")).toBe(1);
  });

  test('interpret("(100U8 is U8 && 100U8 is U8) is Bool") => 1', () => {
    expect(interpret("(100U8 is U8 && 100U8 is U8) is Bool")).toBe(1);
  });

  test('interpret("true is Bool") => 1', () => {
    expect(interpret("true is Bool")).toBe(1);
  });

  test('interpret("5U8 is U16") => 0', () => {
    expect(interpret("5U8 is U16")).toBe(0);
  });

  test('interpret("5 is I32") => 1', () => {
    expect(interpret("5 is I32")).toBe(1);
  });

  test('interpret("5 is U8") => 0', () => {
    expect(interpret("5 is U8")).toBe(0);
  });

  test('interpret("(100) is I32") => 1', () => {
    expect(interpret("(100) is I32")).toBe(1);
  });

  test('interpret("(100 + 1U8) is U8") => 1', () => {
    expect(interpret("(100 + 1U8) is U8")).toBe(1);
  });

  test('interpret("let x = 100; x is I32") => 1', () => {
    expect(interpret("let x = 100; x is I32")).toBe(1);
  });

  test('interpret("loop { break 100U8; } is U8") => 1', () => {
    expect(interpret("loop { break 100U8; } is U8")).toBe(1);
  });

  test('interpret("{ let x = 0; } is Void") => 1', () => {
    expect(interpret("{ let x = 0; } is Void")).toBe(1);
  });

  test('interpret("type Temp = I32; let temp : Temp = 100; temp is Temp && temp is I32") => 1', () => {
    expect(
      interpret(
        "type Temp = I32; let temp : Temp = 100; temp is Temp && temp is I32",
      ),
    ).toBe(1);
  });

  test('interpret("enum Simple { First } Simple::First == Simple::First") => 1', () => {
    expect(
      interpret("enum Simple { First } Simple::First == Simple::First"),
    ).toBe(1);
  });

  test('interpret("type Maybe = I32 | Bool; let temp : Maybe = 100; temp") => 100', () => {
    expect(
      interpret("type Maybe = I32 | Bool; let temp : Maybe = 100; temp"),
    ).toBe(100);
  });

  test('interpret("let temp : I32 | Bool = 100; temp") => 100', () => {
    expect(interpret("let temp : I32 | Bool = 100; temp")).toBe(100);
  });
});
