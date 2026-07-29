import { test, expect, describe } from "bun:test";
import { interpret } from "../src";

describe("control flow", () => {
  test('interpret("let x = if (true) 2 else 3; x") => 2', () => {
    expect(interpret("let x = if (true) 2 else 3; x")).toBe(2);
  });

  test('interpret("let x = if (false) 2 else if (false) 3 else 4; x") => 4', () => {
    expect(interpret("let x = if (false) 2 else if (false) 3 else 4; x")).toBe(
      4,
    );
  });

  test('interpret("let mut x = 0; if (false) { x = 2; } else if (false) { x = 3; } else { x = 4; } x") => 4', () => {
    expect(
      interpret(
        "let mut x = 0; if (false) { x = 2; } else if (false) { x = 3; } else { x = 4; } x",
      ),
    ).toBe(4);
  });

  test('interpret("let x = loop { break 3; }; x") => 3', () => {
    expect(interpret("let x = loop { break 3; }; x")).toBe(3);
  });

  test('interpret("loop { break loop { break 5; } }") => 5', () => {
    expect(interpret("loop { break loop { break 5; } }")).toBe(5);
  });

  test('interpret("if (true) { let x = 1; }") => 0 (if statement without else)', () => {
    expect(interpret("if (true) { let x = 1; }")).toBe(0);
  });

  test('interpret("let mut x = 0; while (x < 4) { x += 1; } x") => 4', () => {
    expect(interpret("let mut x = 0; while (x < 4) { x += 1; } x")).toBe(4);
  });

  test('interpret("let mut x = 0; loop { x += 1; if (x >= 3) break x; continue; }") => 3', () => {
    expect(
      interpret(
        "let mut x = 0; loop { x += 1; if (x >= 3) break x; continue; }",
      ),
    ).toBe(3);
  });

  test('interpret("let mut x = 0; let mut y = 0; while (x < 5) { x += 1; if (x == 3) continue; y += 1; } y") => 4', () => {
    expect(
      interpret(
        "let mut x = 0; let mut y = 0; while (x < 5) { x += 1; if (x == 3) continue; y += 1; } y",
      ),
    ).toBe(4);
  });
});
