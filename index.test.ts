import { describe, it, expect } from "bun:test";
import { interpret } from "./index.ts";

describe("interpret", () => {
  it('interpret("") => 0', () => {
    expect(interpret("")).toBe(0);
  });

  it('interpret("1") => 1', () => {
    expect(interpret("1")).toBe(1);
  });
  it('interpret("1 + 2") => 3', () => {
    expect(interpret("1 + 2")).toBe(3);
  });
  it('interpret("1 + 2 + 3") => 6', () => {
    expect(interpret("1 + 2 + 3")).toBe(6);
  });
  it('interpret("2 + 3 - 4") => 1', () => {
    expect(interpret("2 + 3 - 4")).toBe(1);
  });
});
