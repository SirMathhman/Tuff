import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";

describe("interpret", () => {
  it("is a function", () => {
    expect(typeof interpret).toBe("function");
  });

  it("parses integer numeric string", () => {
    expect(interpret("100")).toBe(100);
  });
  it('parses a simple addition expression', () => {
    expect(interpret('1 + 2')).toBe(3);
  });

  it('parses chained addition expressions', () => {
    expect(interpret('1+2+3')).toBe(6);
  });});
