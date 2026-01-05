import { interpret } from "../src/interpret";

describe("interpret", () => {
  test("parses integer string to number", () => {
    expect(interpret("100")).toBe(100);
  });
});
