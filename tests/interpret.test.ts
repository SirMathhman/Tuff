import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";

describe("interpret", () => {
  it("is a function", () => {
    expect(typeof interpret).toBe("function");
  });

  it('parses integer numeric string', () => {
    expect(interpret('100')).toBe(100);
  });
});
