import { test, expect, describe } from "bun:test";
import { interpret } from "../src";

describe("empty/whitespace input", () => {
  test('interpret("") => 0', () => {
    expect(interpret("")).toBe(0);
  });

  test('interpret(" ") => 0', () => {
    expect(interpret(" ")).toBe(0);
  });
});

describe("null literals", () => {
  test('interpret("let temp : Null = null; temp") => 0', () => {
    expect(interpret("let temp : Null = null; temp")).toBe(0);
  });
});

describe("number literals", () => {
  test('interpret("1") => 1', () => {
    expect(interpret("1")).toBe(1);
  });

  test('interpret("100U8") => 100', () => {
    expect(interpret("100U8")).toBe(100);
  });

  test('interpret("256U8") => Error', () => {
    expect(() => interpret("256U8")).toThrow();
  });

  test('interpret("-100U8") => Error', () => {
    expect(() => interpret("-100U8")).toThrow();
  });

  test('interpret("let x = 1; -x") => -1', () => {
    expect(interpret("let x = 1; -x")).toBe(-1);
  });

  test('interpret("-(2 + 3)") => -5', () => {
    expect(interpret("-(2 + 3)")).toBe(-5);
  });

  test('interpret("let x : U16 = 100U16; x") => 100', () => {
    expect(interpret("let x : U16 = 100U16; x")).toBe(100);
  });

  test('interpret("let x : U16 = 100U8; x") => 100', () => {
    expect(interpret("let x : U16 = 100U8; x")).toBe(100);
  });

  test('interpret("let x : U8 = 100U16; x") => Error', () => {
    expect(() => interpret("let x : U8 = 100U16; x")).toThrow();
  });

  test('interpret("let x = 100U16; let y : U8 = x;") => Error', () => {
    expect(() => interpret("let x = 100U16; let y : U8 = x;")).toThrow();
  });

  test('interpret("let x : U32 = 100U8; x") => 100', () => {
    expect(interpret("let x : U32 = 100U8; x")).toBe(100);
  });

  test('interpret("let x : Bool = true; x") => 1', () => {
    expect(interpret("let x : Bool = true; x")).toBe(1);
  });

  test('interpret("let x : Bool = 5U8;") => Error', () => {
    expect(() => interpret("let x : Bool = 5U8;")).toThrow();
  });

  test('interpret("true + false") => Error', () => {
    expect(() => interpret("true + false")).toThrow();
  });
});
