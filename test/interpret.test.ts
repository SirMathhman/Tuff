import { it, expect } from "bun:test";
import { interpret } from "../src/interpret";

it("interpret returns integer strings unchanged", () => {
  expect(interpret("100")).toBe("100");
});

it("interpret trims and returns integer strings", () => {
  expect(interpret("  -42  ")).toBe("-42");
});

it("interpret handles integer with unsigned suffix", () => {
  expect(interpret("100U8")).toBe("100");
  expect(interpret("  +255u16 ")).toBe("+255");
});

it("interpret throws for non-integer strings", () => {
  expect(() => interpret("hello")).toThrow();
});
