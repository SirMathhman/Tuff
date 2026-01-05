import { interpret } from "../src/interpret";

describe("interpret", () => {
  test("throws not implemented error", () => {
    expect(() => interpret("any input")).toThrowError(
      "interpret not implemented"
    );
  });
});
