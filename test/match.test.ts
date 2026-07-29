import { test, expect, describe } from "bun:test";
import { interpret } from "../src";

describe("match expressions", () => {
  test('interpret("let x = match (3) { case 3 => 7; case _ => 4; }; x") => 7', () => {
    expect(
      interpret("let x = match (3) { case 3 => 7; case _ => 4; }; x"),
    ).toBe(7);
  });

  test('interpret("match (5) { case 3 => 7; case _ => 4; }") => 4 (wildcard not first)', () => {
    expect(interpret("match (5) { case 3 => 7; case _ => 4; }")).toBe(4);
  });

  test('interpret("match (2) { case 1 => 10; case 2 => 20; case 3 => 30; }") => 20', () => {
    expect(
      interpret("match (2) { case 1 => 10; case 2 => 20; case 3 => 30; }"),
    ).toBe(20);
  });

  test('interpret("match (5) { case 3 => 7; case 2 => 8; }") => Error (no match)', () => {
    expect(() =>
      interpret("match (5) { case 3 => 7; case 2 => 8; }"),
    ).toThrow();
  });
});
