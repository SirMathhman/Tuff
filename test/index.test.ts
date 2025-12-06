import { describe, it, expect } from "bun:test";
import { greet } from "../src/index";

describe("greet", () => {
  it("returns a greeting for provided name", () => {
    expect(greet("Alice")).toBe("Hello, Alice!");
  });

  it("defaults to world", () => {
    expect(greet()).toBe("Hello, world!");
  });
});
