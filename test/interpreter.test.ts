import { it, expect } from "vitest";
import { interpret } from "../src/interpreter";

it("interprets a numeric literal", () => {
  expect(interpret("100")).toBe(100);
});
