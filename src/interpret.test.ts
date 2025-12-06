import { expect, describe, it } from "bun:test";
import interpret from "./interpret";

describe("interpret", () => {
  it('should return "100" when given "100"', () => {
    const result = interpret("100");
    expect(result).toBe("100");
  });

  it('should return "3" when given "1 + 2"', () => {
    const result = interpret("1 + 2");
    expect(result).toBe("3");
  });
});
