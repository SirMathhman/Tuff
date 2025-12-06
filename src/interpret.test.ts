import { expect, describe, it } from "bun:test";
import interpret from "./interpret";

describe("interpret", () => {
  it('should return "100" when given "100"', () => {
    expect(interpret("100")).toBe("100");
  });
});
