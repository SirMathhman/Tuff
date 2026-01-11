import { interpret } from "../src/interpret";

describe("interpret", () => {
  it("parses integer string to number", () => {
    expect(interpret("100")).toBe(100);
  });

  it("parses integer with trailing text (e.g., '100U8') to number", () => {
    expect(interpret("100U8")).toBe(100);
  });

  it("throws when unsigned type value is out of range (e.g., '256U8')", () => {
    expect(() => interpret("256U8")).toThrow(Error);
  });

  it("throws when negative number has trailing text (e.g., '-1U8')", () => {
    expect(() => interpret("-1U8")).toThrow(Error);
  });
});
