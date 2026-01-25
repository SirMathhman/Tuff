import { describe, it, expect } from "bun:test";
import { interpretAll } from "../src/utils/interpret";

describe("interpretAll", () => {
  it("executes main module with lib dependency via import", () => {
    const config = new Map<string[], string>([
      [["main"], "let { get } from lib; get()"],
      [["lib"], "out fn get() => 100;"]
    ]);

    const result = interpretAll(["main"], config);
    expect(result).toBe(100);
  });

  it("handles function from lib module", () => {
    const config = new Map<string[], string>([
      [["main"], "let { add } from lib; add(3, 4)"],
      [["lib"], "out fn add(a: I32, b: I32) => a + b;"]
    ]);

    const result = interpretAll(["main"], config);
    expect(result).toBe(7);
  });
});

