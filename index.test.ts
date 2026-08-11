import { describe, it, expect } from "bun:test";
import { interpret } from "./index.ts";

describe("interpret", () => {
  it('interpret("") => 0', () => {
    expect(interpret("")).toBe(0);
  });
});
