import { describe, expect, it } from "bun:test";
import { hello } from "../src/index";

describe("hello", () => {
  it("should return a greeting", () => {
    expect(hello()).toBe("Hello, Tuff!");
  });
});
