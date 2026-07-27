import { describe, it, expect } from "bun:test";
import { evaluate } from "./index";

describe("evaluate", () => {
  it('evaluate("") => 0', () => {
    expect(evaluate("")).toBe(0);
  });

  it('evaluate(" ") => 0', () => {
    expect(evaluate(" ")).toBe(0);
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

  it('evaluate("2 + 3 - 1") => 4', () => {
    expect(evaluate("2 + 3 - 1")).toBe(4);
  });

  it('evaluate("2 * 3 - 1") => 5', () => {
    expect(evaluate("2 * 3 - 1")).toBe(5);
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

  it('evaluate("let y = { let x = 2 + 3; x } * 4; y") => 20', () => {
    expect(evaluate("let y = { let x = 2 + 3; x } * 4; y")).toBe(20);
  });

  it('evaluate("let y = 0; let y = 1; y") => 1', () => {
    expect(evaluate("let y = 0; let y = 1; y")).toBe(1);
  });

  it('evaluate("let x = 100;") => 0', () => {
    expect(evaluate("let x = 100;")).toBe(0);
  });

  it('evaluate("let mut x = 0; x = 1; x") => 1', () => {
    expect(evaluate("let mut x = 0; x = 1; x")).toBe(1);
  });

  it('evaluate("let x = true; x") => 1', () => {
    expect(evaluate("let x = true; x")).toBe(1);
  });

  it('evaluate("let x = true; let y = false; x || y") => 1', () => {
    expect(evaluate("let x = true; let y = false; x || y")).toBe(1);
  });

  it('evaluate("let x = 0; let y = 1; x < y") => 1', () => {
    expect(evaluate("let x = 0; let y = 1; x < y")).toBe(1);
  });

  it('evaluate("let x = if (true) 2 else 3; x") => 2', () => {
    expect(evaluate("let x = if (true) 2 else 3; x")).toBe(2);
  });

  it('evaluate("let x = if (false) 2 else 3; x") => 3', () => {
    expect(evaluate("let x = if (false) 2 else 3; x")).toBe(3);
  });

  it('evaluate("let x = if (false) 2 else if (false) 3 else 4; x") => 4', () => {
    expect(evaluate("let x = if (false) 2 else if (false) 3 else 4; x")).toBe(
      4,
    );
  });

  it('evaluate("let mut x = 0; x += 1; x") => 1', () => {
    expect(evaluate("let mut x = 0; x += 1; x")).toBe(1);
  });

  it('evaluate("let x = loop { break 1; }; x") => 1', () => {
    expect(evaluate("let x = loop { break 1; }; x")).toBe(1);
  });

  it('evaluate("let mut x = 0; { x = 1; } x") => 1', () => {
    expect(evaluate("let mut x = 0; { x = 1; } x")).toBe(1);
  });

  it('evaluate("let mut x = 0; if (false) { x = 1; } else { x = 2; } x") => 2', () => {
    expect(
      evaluate("let mut x = 0; if (false) { x = 1; } else { x = 2; } x"),
    ).toBe(2);
  });

  it('evaluate("let mut x = 0; while (x < 4) { x += 1; } x") => 4', () => {
    expect(evaluate("let mut x = 0; while (x < 4) { x += 1; } x")).toBe(4);
  });
});
