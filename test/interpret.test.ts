import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";

describe("interpret (stub)", () => {
  it("is a function that returns a number for various inputs", () => {
    expect(typeof interpret("")).toBe("number");
    expect(typeof interpret("hello")).toBe("number");
    expect(typeof interpret("1+1")).toBe("number");
  });

  it("parses numeric literals correctly", () => {
    expect(interpret("100")).toBe(100);
    expect(interpret("+42")).toBe(42);
    expect(interpret("-3.14")).toBe(-3.14);
  });

  it("parses leading numeric prefix (e.g., '100U8' => 100)", () => {
    expect(interpret("100U8")).toBe(100);
    expect(interpret("+42x")).toBe(42);
    expect(() => interpret("-3.14y")).toThrow();
    expect(() => interpret("-100U8")).toThrow();
  });
});
