import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";

describe("interpret (stub)", () => {
  it("is a function that returns a number for various inputs", () => {
    expect(typeof interpret("")).toBe("number");
    expect(typeof interpret("hello")).toBe("number");
    expect(typeof interpret("1+1")).toBe("number");
  });
});
