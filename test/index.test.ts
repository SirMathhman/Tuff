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

describe("number literals", () => {
  test('interpret("1") => 1', () => {
    expect(interpret("1")).toBe(1);
  });
});

describe("binary expressions", () => {
  test('interpret("1 + 2") => 3', () => {
    expect(interpret("1 + 2")).toBe(3);
  });

  test('interpret("1 + 2 + 3") => 6', () => {
    expect(interpret("1 + 2 + 3")).toBe(6);
  });

  test('interpret("2 + 3 - 4") => 1', () => {
    expect(interpret("2 + 3 - 4")).toBe(1);
  });

  test('interpret("2 * 3 - 4") => 2', () => {
    expect(interpret("2 * 3 - 4")).toBe(2);
  });

  test('interpret("2 + 3 * 4") => 14', () => {
    expect(interpret("2 + 3 * 4")).toBe(14);
  });

  test('interpret("(2 + 3) * 4") => 20', () => {
    expect(interpret("(2 + 3) * 4")).toBe(20);
  });

  test('interpret("(2 + 3) * (1 + 2)") => 15', () => {
    expect(interpret("(2 + 3) * (1 + 2)")).toBe(15);
  });

  test('interpret("{ 2 + 3 } * 4") => 20', () => {
    expect(interpret("{ 2 + 3 } * 4")).toBe(20);
  });

  test('interpret("{ let x = 2 + 3; x } * 4") => 20', () => {
    expect(interpret("{ let x = 2 + 3; x } * 4")).toBe(20);
  });

  test('interpret("let y = { let x = 2 + 3; x } * 4; y") => 20', () => {
    expect(interpret("let y = { let x = 2 + 3; x } * 4; y")).toBe(20);
  });

  test('interpret("let x = 0; let x = 1; x") => 1', () => {
    expect(interpret("let x = 0; let x = 1; x")).toBe(1);
  });

  test('interpret("undefinedIdentifier") => Error', () => {
    expect(() => interpret("undefinedIdentifier")).toThrow();
  });

  test('interpret("let x = 100;") => 0', () => {
    expect(interpret("let x = 100;")).toBe(0);
  });

  test('interpret("let x = { let y = 100; };") => Error', () => {
    expect(() => interpret("let x = { let y = 100; };")).toThrow();
  });

  test('interpret("{ let y = 100; }") => 0 (statement context)', () => {
    expect(interpret("{ let y = 100; }")).toBe(0);
  });

  test('interpret("{ { let x = 1; } }") => 0 (nested statement)', () => {
    expect(interpret("{ { let x = 1; } }")).toBe(0);
  });

  test('interpret("{ let a = 1; a } * 2") => 2', () => {
    expect(interpret("{ let a = 1; a } * 2")).toBe(2);
  });
});
