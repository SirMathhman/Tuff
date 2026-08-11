import { describe, it, expect } from "bun:test";
import { evaluate } from "./index.ts";

describe("evaluate", () => {
  it('evaluate("") => 0', () => {
    expect(evaluate("")).toBe(0);
  });

  it('evaluate("1") => 1', () => {
    expect(evaluate("1")).toBe(1);
  });

  it('evaluate(" 1 ") => 1', () => {
    expect(evaluate(" 1 ")).toBe(1);
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

  it('evaluate("(2 + 3) * (3 + 1)") => 20', () => {
    expect(evaluate("(2 + 3) * (3 + 1)")).toBe(20);
  });

  it('evaluate("(2 + (1 + 1)) * 4") => 16', () => {
    expect(evaluate("(2 + (1 + 1)) * 4")).toBe(16);
  });

  it('evaluate("{ 2 + 3 } * 4") => 20', () => {
    expect(evaluate("{ 2 + 3 } * 4")).toBe(20);
  });

  it('evaluate("{ let x = 2 + 3; x } * 4") => 20', () => {
    expect(evaluate("{ let x = 2 + 3; x } * 4")).toBe(20);
  });

  it('evaluate("something invalid") => Error', () => {
    expect(() => evaluate("something invalid")).toThrow();
  });

  it('evaluate("let y = { let x = 2 + 3; x } * 4; y") => 20', () => {
    expect(evaluate("let y = { let x = 2 + 3; x } * 4; y")).toBe(20);
  });

  it('evaluate("let x = 100;") => 0', () => {
    expect(evaluate("let x = 100;")).toBe(0);
  });

  it('evaluate("let x = 100; x") => 100', () => {
    expect(evaluate("let x = 100; x")).toBe(100);
  });

  it('evaluate("let x = 100; x + 1") => 101', () => {
    expect(evaluate("let x = 100; x + 1")).toBe(101);
  });

  it('evaluate("let x = { let y = 100; y }; y") => Error', () => {
    expect(() => evaluate("let x = { let y = 100; y }; y")).toThrow();
  });

  it('evaluate("let x = 0; let x = 1; x") => 1', () => {
    expect(evaluate("let x = 0; let x = 1; x")).toBe(1);
  });

  it('evaluate("let x = 0; let x = 1; x") => 1', () => {
    expect(evaluate("let x = 0; let x = 1; x")).toBe(1);
  });
});
