import { test, expect, describe } from "bun:test";
import { interpret } from "../src";

describe("arrays", () => {
  test('interpret("let array : [I32; 3] = [1, 2, 3]; array[0]") => 1', () => {
    expect(interpret("let array : [I32; 3] = [1, 2, 3]; array[0]")).toBe(1);
  });

  test('interpret("let mut array = [0]; array[0] = 1; array[0]") => 1', () => {
    expect(interpret("let mut array = [0]; array[0] = 1; array[0]")).toBe(1);
  });

  test('interpret("let mut array = [1]; array[0] += 2; array[0]") => 3', () => {
    expect(interpret("let mut array = [1]; array[0] += 2; array[0]")).toBe(3);
  });

  test('interpret("let array = [1, 2]; let ptr : &[I32; 2] = &array; ptr[0]") => 1', () => {
    expect(
      interpret("let array = [1, 2]; let ptr : &[I32; 2] = &array; ptr[0]"),
    ).toBe(1);
  });

  test('interpret("let array = [1, 2]; let ptr0 = &array; let ptr1 = &ptr0; ptr1[0]") => 1', () => {
    expect(
      interpret(
        "let array = [1, 2]; let ptr0 = &array; let ptr1 = &ptr0; ptr1[0]",
      ),
    ).toBe(1);
  });

  test('interpret("let x = [1, 2]; x[99]") => Error (out of bounds)', () => {
    expect(() => interpret("let x = [1, 2]; x[99]")).toThrow();
  });

  test('interpret("5[0]") => Error (index non-array)', () => {
    expect(() => interpret("5[0]")).toThrow();
  });

  test('interpret("let x = [1, 2, 3]; x") => Error (array not coercible)', () => {
    expect(() => interpret("let x = [1, 2, 3]; x")).toThrow();
  });
});
