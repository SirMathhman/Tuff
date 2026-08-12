import { describe, expect, it } from "bun:test";
import { evaluate } from "../src/index";

describe("evaluate", () => {
  it('evaluate("") => 0', () => {
    expect(evaluate("")).toBe(0);
  });

  it('evaluate("1") => 1', () => {
    expect(evaluate("1")).toBe(1);
  });

  it('evaluate("1 + 2") => 3', () => {
    expect(evaluate("1 + 2")).toBe(3);
  });

  it('evaluate("1 + 2 + 3") => 6', () => {
    expect(evaluate("1 + 2 + 3")).toBe(6);
  });

  it('evaluate("2 + 3 - 4") => 1', () => {
    expect(evaluate("2 + 3 - 4")).toBe(1);
  });

  it('evaluate("2 * 3 + 4") => 10', () => {
    expect(evaluate("2 * 3 + 4")).toBe(10);
  });

  it('evaluate("2 + 3 * 4") => 14', () => {
    expect(evaluate("2 + 3 * 4")).toBe(14);
  });

  it('evaluate("(2 + 3) * 4") => 20', () => {
    expect(evaluate("(2 + 3) * 4")).toBe(20);
  });

  it('evaluate("{ 2 + 3 } * 4") => 20', () => {
    expect(evaluate("{ 2 + 3 } * 4")).toBe(20);
  });

  it('evaluate("{ let x = 2 + 3; x } * 4") => 20', () => {
    expect(evaluate("{ let x = 2 + 3; x } * 4")).toBe(20);
  });

  it('evaluate("{} * 4") => Error', () => {
    expect(() => evaluate("{} * 4")).toThrow();
  });

  it('evaluate("let y = { let x = 2 + 3; x } * 4; y") => 20', () => {
    expect(evaluate("let y = { let x = 2 + 3; x } * 4; y")).toBe(20);
  });

  it('evaluate("let y = 100;") => 0', () => {
    expect(evaluate("let y = 100;")).toBe(0);
  });

  it('evaluate("let x = { let y = 0; y }; y") => Error', () => {
    expect(() => evaluate("let x = { let y = 0; y }; y")).toThrow();
  });

  it('evaluate("let x = 0; let x = 1; x") => 1', () => {
    expect(evaluate("let x = 0; let x = 1; x")).toBe(1);
  });

  it('evaluate("let x = 0; let y = { let x = 1; x }; x") => 0', () => {
    expect(evaluate("let x = 0; let y = { let x = 1; x }; x")).toBe(0);
  });

  it('evaluate("let x = { let y = 100; }; x") => Error', () => {
    expect(() => evaluate("let x = { let y = 100; }; x")).toThrow();
  });

  it('evaluate("let x = 100; let y = &x; *y") => 100', () => {
    expect(evaluate("let x = 100; let y = &x; *y")).toBe(100);
  });

  it('evaluate("let mut x = 0; x = 1; x") => 1', () => {
    expect(evaluate("let mut x = 0; x = 1; x")).toBe(1);
  });

  it('evaluate("let x = 0; x = 1; x") => Error', () => {
    expect(() => evaluate("let x = 0; x = 1; x")).toThrow();
  });

  it('evaluate("let mut x = 0; let y = &mut x; *y = 100; x") => 100', () => {
    expect(evaluate("let mut x = 0; let y = &mut x; *y = 100; x")).toBe(100);
  });

  it('evaluate("\"true\"") => 1', () => {
    expect(evaluate('"true"')).toBe(1);
  });

  it('evaluate("\"true || false\"") => 1', () => {
    expect(evaluate('"true || false"')).toBe(1);
  });

  it('evaluate("\"true && false\"") => 0', () => {
    expect(evaluate('"true && false"')).toBe(0);
  });

  it('evaluate("\"let x = 0; let y = 1; x == y\"") => 0', () => {
    expect(evaluate('"let x = 0; let y = 1; x == y"')).toBe(0);
  });

  it('evaluate("let x = if (false) 2 else 3; x") => 3', () => {
    expect(evaluate("let x = if (false) 2 else 3; x")).toBe(3);
  });

  it('evaluate("let x = if (false) 2 else if (false) 3 else 4; x") => 4', () => {
    expect(evaluate("let x = if (false) 2 else if (false) 3 else 4; x")).toBe(
      4,
    );
  });

  it('evaluate("let mut x = 0; if (false) { x = 2; } else { x = 3; } x") => 3', () => {
    expect(
      evaluate("let mut x = 0; if (false) { x = 2; } else { x = 3; } x"),
    ).toBe(3);
  });

  it('evaluate("let mut x = 0; if (false) x = 2; else x = 3; x") => 3', () => {
    expect(evaluate("let mut x = 0; if (false) x = 2; else x = 3; x")).toBe(3);
  });

  it('evaluate("let mut x = 0; if (false) x = 2; x") => 0', () => {
    expect(evaluate("let mut x = 0; if (false) x = 2; x")).toBe(0);
  });

  it('evaluate("let mut x = 1; x += 2; x") => 3', () => {
    expect(evaluate("let mut x = 1; x += 2; x")).toBe(3);
  });

  it('evaluate("let mut x = 1; x -= 2; x") => -1', () => {
    expect(evaluate("let mut x = 1; x -= 2; x")).toBe(-1);
  });

  it('evaluate("1 < 2") => 1', () => {
    expect(evaluate("1 < 2")).toBe(1);
  });

  it('evaluate("2 < 1") => 0', () => {
    expect(evaluate("2 < 1")).toBe(0);
  });

  it('evaluate("1 <= 1") => 1', () => {
    expect(evaluate("1 <= 1")).toBe(1);
  });

  it('evaluate("2 <= 1") => 0', () => {
    expect(evaluate("2 <= 1")).toBe(0);
  });

  it('evaluate("2 > 1") => 1', () => {
    expect(evaluate("2 > 1")).toBe(1);
  });

  it('evaluate("1 > 2") => 0', () => {
    expect(evaluate("1 > 2")).toBe(0);
  });

  it('evaluate("1 >= 1") => 1', () => {
    expect(evaluate("1 >= 1")).toBe(1);
  });

  it('evaluate("0 >= 1") => 0', () => {
    expect(evaluate("0 >= 1")).toBe(0);
  });

  it('evaluate("1 != 2") => 1', () => {
    expect(evaluate("1 != 2")).toBe(1);
  });

  it('evaluate("1 != 1") => 0', () => {
    expect(evaluate("1 != 1")).toBe(0);
  });

  it('evaluate("let mut x = 0; while (x < 4) { x += 1; } x") => 4', () => {
    expect(evaluate("let mut x = 0; while (x < 4) { x += 1; } x")).toBe(4);
  });

  it('evaluate("let mut x = 0; while (x < 4) x += 1; x") => 4', () => {
    expect(evaluate("let mut x = 0; while (x < 4) x += 1; x")).toBe(4);
  });

  it('evaluate("let mut x = 0; while (x < 4) { x += 1; break; } x") => 1', () => {
    expect(evaluate("let mut x = 0; while (x < 4) { x += 1; break; } x")).toBe(
      1,
    );
  });

  it('evaluate("let mut x = 0; while (x < 4) { x += 1; continue; } x") => 4', () => {
    expect(
      evaluate("let mut x = 0; while (x < 4) { x += 1; continue; } x"),
    ).toBe(4);
  });

  it('evaluate("let mut x = 0; for (i in 0..4) { x += i; } x") => 6', () => {
    expect(evaluate("let mut x = 0; for (i in 0..4) { x += i; } x")).toBe(6);
  });

  it('evaluate("let mut x = 0; for (i in 0..4) { x += i; break; } x") => 0', () => {
    expect(
      evaluate("let mut x = 0; for (i in 0..4) { x += i; break; } x"),
    ).toBe(0);
  });

  it('evaluate("let mut x = 0; let range = 0..4; for (i in range) { x += i; break; } x") => 0', () => {
    expect(
      evaluate(
        "let mut x = 0; let range = 0..4; for (i in range) { x += i; break; } x",
      ),
    ).toBe(0);
  });

  it('evaluate("let mut x = 0; for (i in 0..4) { x += i; continue; } x") => 6', () => {
    expect(
      evaluate("let mut x = 0; for (i in 0..4) { x += i; continue; } x"),
    ).toBe(6);
  });

  it('evaluate("let x = { if (true) 3; else 2 } + 1; x") => 4', () => {
    expect(evaluate("let x = { if (true) 3; else 2 } + 1; x")).toBe(4);
  });

  it('evaluate("let array = [1, 2, 3]; array[0] + array[1] + array[2]") => 6', () => {
    expect(
      evaluate("let array = [1, 2, 3]; array[0] + array[1] + array[2]"),
    ).toBe(6);
  });

  it('evaluate("let pt = { x : 3, y : 4 }; pt.x + pt.y") => 7', () => {
    expect(evaluate("let pt = { x : 3, y : 4 }; pt.x + pt.y")).toBe(7);
  });

  it('evaluate("100U8") => 100', () => {
    expect(evaluate("100U8")).toBe(100);
  });

  it('evaluate("let x = 100; -x") => -100', () => {
    expect(evaluate("let x = 100; -x")).toBe(-100);
  });

  it('evaluate("-100") => -100', () => {
    expect(evaluate("-100")).toBe(-100);
  });

  it('evaluate("-100U8") => Error', () => {
    expect(() => evaluate("-100U8")).toThrow();
  });

  it('evaluate("256U8") => Error', () => {
    expect(() => evaluate("256U8")).toThrow();
  });

  it('evaluate("let x = 100U8; -x") => Error', () => {
    expect(() => evaluate("let x = 100U8; -x")).toThrow();
  });

  it('evaluate("let x = 100U16; x") => 100', () => {
    expect(evaluate("let x = 100U16; x")).toBe(100);
  });

  it('evaluate("let x : U8 = 0U16;") => Error', () => {
    expect(() => evaluate("let x : U8 = 0U16;")).toThrow();
  });

  it('evaluate("let x : U16 = 0U8;") => 0', () => {
    expect(evaluate("let x : U16 = 0U8;")).toBe(0);
  });

  it('evaluate("100U8 is U8") => 1', () => {
    expect(evaluate("100U8 is U8")).toBe(1);
  });

  it('evaluate("let mut x = 0; let y = if (false) { x = 2; } else { x = 3; } x") => Error', () => {
    expect(() =>
      evaluate(
        "let mut x = 0; let y = if (false) { x = 2; } else { x = 3; } x",
      ),
    ).toThrow();
  });
});
