import { describe, it, expect } from "bun:test";
import { intepret } from "../src/intepret";

describe("intepret", () => {
  it("returns 0 for empty string", () => {
    expect(intepret("")).toBe(0);
  });

  it("parses integer strings like '100'", () => {
    expect(intepret("100")).toBe(100);
  });
});
