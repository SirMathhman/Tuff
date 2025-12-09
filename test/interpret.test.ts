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
  expect(interpret("1U8 + 2U8 + 3U8")).toBe("6");
  expect(interpret("10I8 + -3I8 + 2I8")).toBe("9");
});

it("interpret handles mixed + and - operators", () => {
  expect(interpret("10U8 - 5U8 + 3U8")).toBe("8");
});

it("interpret handles multiplication with precedence", () => {
  expect(interpret("2U8 * 3U8 + 4U8")).toBe("10");
  expect(interpret("2U8 + 3U8 * 4U8")).toBe("14");
  expect(interpret("2U8 * 3U8 * 4U8")).toBe("24");
  expect(() => interpret("200U8 * 2U8")).toThrow();
  expect(interpret("4U8 + 2U8 * 3U8")).toBe("10");
  // parentheses
  expect(interpret("(4U8 + 2U8) * 3U8")).toBe("18");
  // braces as grouping
  expect(interpret("{ 4U8 + 2U8 } * 3U8")).toBe("18");
});

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

it("interpret supports let declarations and variables", () => {
  expect(interpret("let x : U8 = { 4U8 + 2U8 } * 3U8; x")).toBe("18");
});

it("interpret supports let-to-let assignment (copy variable)", () => {
  expect(
    interpret("let x : U8 = {  4U8 + 2U8 } * 3U8; let y : U8 = x; y")
  ).toBe("18");
});

it("interpret supports nested let inside a block (scoped)", () => {
  expect(
    interpret(
      "let x : U8 = {  let z : U8 = 4U8 + 2U8; z } * 3U8; let y : U8 = x; y"
    )
  ).toBe("18");
});

it("interpret returns empty string for standalone let statements", () => {
  expect(interpret("let x : U8 = 100U8;")).toBe("");
});

it("interpret throws on redeclaration in same scope", () => {
  expect(() => interpret("let x : U8 = 100U8; let x : U8 = 200U8;")).toThrow();
});
