import { test, expect, describe } from "bun:test";
import { interpret } from "../src";

describe("logical operators", () => {
  test('interpret("let x = true; x") => 1', () => {
    expect(interpret("let x = true; x")).toBe(1);
  });

  test('interpret("let x = true; let y = false; x || y") => 1', () => {
    expect(interpret("let x = true; let y = false; x || y")).toBe(1);
  });

  test('interpret("let x = true; let y = false; x && y") => 0', () => {
    expect(interpret("let x = true; let y = false; x && y")).toBe(0);
  });
});
