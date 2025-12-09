import { it, expect } from "bun:test";
import { interpret } from "../src/interpret";

it("interpret handles integer with unsigned suffix", () => {
  expect(interpret("100U8")).toBe("100");
  expect(interpret("  +255u16 ")).toBe("+255");
});

it("interpret rejects out-of-range unsigned values (enforces range)", () => {
  expect(() => interpret("256U8")).toThrow()
})

it("interpret throws for negative unsigned integers", () => {
  expect(() => interpret("-100U8")).toThrow();
  expect(() => interpret(" -1u16 ")).toThrow();
});

it("interpret throws for non-integer strings", () => {
  expect(() => interpret("hello")).toThrow();
});
