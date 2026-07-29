import { test, expect, describe } from "bun:test";
import { interpret } from "../src";

describe("this", () => {
  test('interpret("let x = 100; this.x") => 100', () => {
    expect(interpret("let x = 100; this.x")).toBe(100);
  });

  test('interpret("this") => Error (cannot coerce this to number)', () => {
    expect(() => interpret("this")).toThrow();
  });

  test('interpret("let x = 100; let temp = this; temp.x") => 100', () => {
    expect(interpret("let x = 100; let temp = this; temp.x")).toBe(100);
  });

  test('interpret("let mut x = 0; this.x = 100; x") => 100', () => {
    expect(interpret("let mut x = 0; this.x = 100; x")).toBe(100);
  });

  test('interpret("let mut x = 0; let temp = this; temp.x = 100; x") => 0', () => {
    expect(interpret("let mut x = 0; let temp = this; temp.x = 100; x")).toBe(
      0,
    );
  });

  test('interpret("let mut x = 0; let temp = &mut this;") => Error', () => {
    expect(() => interpret("let mut x = 0; let temp = &mut this;")).toThrow();
  });
});
