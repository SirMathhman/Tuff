import { test, expect, describe } from "bun:test";
import { interpret } from "../src";

describe("yield", () => {
  test('interpret("{ if (true) yield 3; 4 } + 2") => 5', () => {
    expect(interpret("{ if (true) yield 3; 4 } + 2")).toBe(5);
  });

  test('interpret("{ if (false) yield 3; 4 }") => 4', () => {
    expect(interpret("{ if (false) yield 3; 4 }")).toBe(4);
  });

  test('interpret("{ yield 10 }") => 10', () => {
    expect(interpret("{ yield 10 }")).toBe(10);
  });

  test('interpret("{ let x = 1; yield x; 99 }") => 1', () => {
    expect(interpret("{ let x = 1; yield x; 99 }")).toBe(1);
  });

  test('interpret("{ yield yield 5 }") => Error (nested yield)', () => {
    expect(() => interpret("{ yield yield 5 }")).toThrow();
  });
});
