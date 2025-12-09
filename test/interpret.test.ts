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

it("interpret sums multiple suffixed integers", () => {
  expect(interpret("1U8 + 2U8 + 3U8")).toBe("6")
  expect(interpret("10I8 + -3I8 + 2I8")).toBe("9")
})

it("interpret enforces signed I8 boundaries", () => {
  expect(interpret("127I8")).toBe("127");
  expect(interpret("-128I8")).toBe("-128");
  expect(() => interpret("128I8")).toThrow();
  expect(() => interpret("-129I8")).toThrow();
});

it("interpret enforces 32-bit boundaries", () => {
  expect(interpret("2147483647I32")).toBe("2147483647");
  expect(() => interpret("2147483648I32")).toThrow();
  expect(interpret("4294967295U32")).toBe("4294967295");
  expect(() => interpret("4294967296U32")).toThrow();
});

it("interpret enforces addition overflow rules", () => {
  expect(() => interpret("200U8 + 100U8")).toThrow();
  expect(() => interpret("100I8 + 50I8")).toThrow();
});

it("interpret throws for non-integer strings", () => {
  expect(() => interpret("hello")).toThrow();
});
