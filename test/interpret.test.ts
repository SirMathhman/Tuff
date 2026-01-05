import { interpret } from "../src/interpret";

describe("interpret", () => {
  it("should return Err for now", () => {
    const result = interpret("1 + 1");
    expect(result).toEqual({ ok: false, error: "Err" });
  });
});
