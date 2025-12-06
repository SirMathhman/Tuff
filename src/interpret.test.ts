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

  it('should return "6" when given "1 + 2 + 3"', () => {
    const result = interpret("1 + 2 + 3");
    expect(result).toBe("6");
  });

  it('should return "0" when given "1 + 2 - 3"', () => {
    const result = interpret("1 + 2 - 3");
    expect(result).toBe("0");
  });

  it('should return "0" when given "{1 + 2 - 3}"', () => {
    const result = interpret("{1 + 2 - 3}");
    expect(result).toBe("0");
  });

  it('should evaluate let bindings and return variable value', () => {
    const result = interpret("let x : I32 = {1 + 2 - 3}; x");
    expect(result).toBe("0");
  });
});
