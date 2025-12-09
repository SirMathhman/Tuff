import { it, expect } from "bun:test";
import { interpret } from "../src/interpret";

it("interpret handles integer with unsigned suffix", () => {
  expect(interpret("100U8")).toBe("100");
  expect(interpret("  +255u16 ")).toBe("+255");
});

it("interpret rejects out-of-range unsigned values (enforces range)", () => {
  expect(() => interpret("256U8")).toThrow();
});

it("interpret accepts negative unsigned integers (returns numeric part)", () => {
  expect(interpret("-100U8")).toBe("-100");
  expect(interpret(" -1u16 ")).toBe("-1");
});

it("interpret adds two suffixed integers", () => {
  expect(interpret("100U8 + 50U8")).toBe("150");
  expect(interpret("  -10u16 + 5u16")).toBe("-5");
});

it("interpret throws for non-integer strings", () => {
  expect(() => interpret("hello")).toThrow();
});
