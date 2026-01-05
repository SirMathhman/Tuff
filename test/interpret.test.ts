/* eslint-env vitest */
import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";

describe("interpret", () => {
  it("throws not implemented error", () => {
    expect(() => interpret("something")).toThrow("interpret: not implemented");
  });
});
