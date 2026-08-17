import { interpret } from "./index";

describe("interpret", () => {
  test('interpret("") => 0', () => {
    expect(interpret("")).toBe(0);
  });

  test('interpret("1") => 1', () => {
    expect(interpret("1")).toBe(1);
  });

  test('interpret("1 + 2") => 3', () => {
    expect(interpret("1 + 2")).toBe(3);
  });

  test('interpret("1 + 2 + 3") => 6', () => {
    expect(interpret("1 + 2 + 3")).toBe(6);
  });

  test('interpret("2 + 3 - 4") => 1', () => {
    expect(interpret("2 + 3 - 4")).toBe(1);
  });

  test('interpret("2 * 3") => 6', () => {
    expect(interpret("2 * 3")).toBe(6);
  });

  test('interpret("6 / 2") => 3', () => {
    expect(interpret("6 / 2")).toBe(3);
  });

  test('interpret("+5") => 5', () => {
    expect(interpret("+5")).toBe(5);
  });

  test('interpret("-5") => -5', () => {
    expect(interpret("-5")).toBe(-5);
  });

  test('interpret("(1 + 2) * 3") => 9', () => {
    expect(interpret("(1 + 2) * 3")).toBe(9);
  });

  test('interpret("1.5") => 1.5', () => {
    expect(interpret("1.5")).toBe(1.5);
  });

  test('interpret("abc") => 0', () => {
    expect(interpret("abc")).toBe(0);
  });

  test('interpret("1 2") => 0', () => {
    expect(interpret("1 2")).toBe(0);
  });

  test('interpret("()") => 0', () => {
    expect(interpret("()")).toBe(0);
  });

  test('interpret("(1 + 2") => 0', () => {
    expect(interpret("(1 + 2")).toBe(0);
  });

  test('interpret("{ 2 + 3 } * 4") => 20', () => {
    expect(interpret("{ 2 + 3 } * 4")).toBe(20);
  });
});
