/* eslint-env vitest */
import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";

describe("interpret", () => {
  it("parses numeric strings", () => {
    expect(interpret("100")).toBe(100);
  });
});
