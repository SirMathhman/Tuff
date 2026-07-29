import { test, expect, describe } from "bun:test";
import { interpret } from "../src";

describe("arithmetic operators", () => {
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

  test('interpret("{ let a = 1; a } * 2") => 2', () => {
    expect(interpret("{ let a = 1; a } * 2")).toBe(2);
  });

  test('interpret("1 / 2") => 0.5 (division)', () => {
    expect(interpret("1 / 2")).toBe(0.5);
  });
});
