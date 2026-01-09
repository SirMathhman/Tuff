import { interpret } from "./interpreter";

describe("interpret", () => {
  test('interpret("100") should return 100', () => {
    expect(interpret("100")).toBe(100);
  });

  test('interpret("let x = 100; x") should return 100', () => {
    expect(interpret("let x = 100; x")).toBe(100);
  });

  test('interpret("let x = 100; let y = x; y") should return 100', () => {
    expect(interpret("let x = 100; let y = x; y")).toBe(100);
  });

  test('interpret("let x = 100; let x = 100;") should throw CompileError', () => {
    expect(() => interpret("let x = 100; let x = 100;")).toThrow(Error);
  });

  test('interpret("let x : I32 = 100; x") should return 100', () => {
    expect(interpret("let x : I32 = 100; x")).toBe(100);
  });

  test('interpret("let x : I32 = 100;") should return 0', () => {
    expect(interpret("let x : I32 = 100;")).toBe(0);
  });

  test('interpret("let x : I32 = true;") should throw Error', () => {
    expect(() => interpret("let x : I32 = true;")).toThrow(Error);
  });

  test('interpret("let x = 100; let y = 200; let z = x; y") should return 200', () => {
    expect(interpret("let x = 100; let y = 200; let z = x; y")).toBe(200);
  });

  test('interpret("let x = 100; let y : Bool = x;") should throw Error', () => {
    expect(() => interpret("let x = 100; let y : Bool = x;")).toThrow(Error);
  });
});
