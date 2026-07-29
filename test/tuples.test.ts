import { test, expect, describe } from "bun:test";
import { interpret } from "../src";

describe("tuples", () => {
  test('interpret("let tuple : (I32, I32) = (1, 2); tuple.0 + tuple.1") => 3', () => {
    expect(
      interpret(
        "let tuple : (I32, I32) = (1, 2); tuple.0 + tuple.1",
      ),
    ).toBe(3);
  });

  test('interpret("let t = (1, 2); t") => Error (tuple not coercible)', () => {
    expect(() => interpret("let t = (1, 2); t")).toThrow();
  });

  test('interpret("let t = (1, 2); t.5") => Error (tuple index out of range)', () => {
    expect(() => interpret("let t = (1, 2); t.5")).toThrow();
  });

  test('interpret("let x = 1; x.0") => Error (tuple access on non-tuple)', () => {
    expect(() => interpret("let x = 1; x.0")).toThrow();
  });
});
