import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";

describe("Arrays", () => {
  it("should declare an array and access first element", () => {
    expect(interpret("let array : [I32; 3; 3] = [1, 2, 3]; array[0]")).toBe(1);
  });

  it("should access second element of array", () => {
    expect(interpret("let array : [I32; 3; 3] = [1, 2, 3]; array[1]")).toBe(2);
  });

  it("should access last element of array", () => {
    expect(interpret("let array : [I32; 3; 3] = [1, 2, 3]; array[2]")).toBe(3);
  });

  it("should support multiple arrays", () => {
    expect(
      interpret(
        "let a : [I32; 2; 2] = [10, 20]; let b : [I32; 2; 2] = [30, 40]; a[1] + b[0]"
      )
    ).toBe(50);
  });

  it("should allow mutable array element assignment", () => {
    expect(interpret("let mut x = [1, 2, 3]; x[1] = 4; x[1]")).toBe(4);
  });
});
