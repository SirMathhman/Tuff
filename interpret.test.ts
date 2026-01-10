import { describe, it, expect } from "vitest";
import { interpret } from "./interpret";

describe("interpret", () => {
  it('should interpret "100" as 100', () => {
    expect(interpret("100")).toBe(100);
  });
});
