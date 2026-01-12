import { it, expect } from "vitest";
import { interpret } from "../src/interpreter";

it("interprets a numeric literal", () => {
  expect(interpret("100")).toBe(100);
});

it("interprets a numeric literal with U8 suffix", () => {
  expect(interpret("100U8")).toBe(100);
});
