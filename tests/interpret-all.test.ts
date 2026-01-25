import { describe, it, expect } from "bun:test";
import { interpretAll } from "../src/utils/interpret";

describe("interpretAll - use statements", () => {
  it("executes main module with lib dependency via import", () => {
    const config = new Map<string[], string>([
      [["main"], "use { get } from lib; get()"],
      [["lib"], "out fn get() => 100;"],
    ]);

    const result = interpretAll(["main"], config);
    expect(result).toBe(100);
  });

  it("handles function from lib module", () => {
    const config = new Map<string[], string>([
      [["main"], "use { add } from lib; add(3, 4)"],
      [["lib"], "out fn add(a: I32, b: I32) => a + b;"],
    ]);

    const result = interpretAll(["main"], config);
    expect(result).toBe(7);
  });
});

describe("interpretAll - module references", () => {
  it("executes module function via variable reference", () => {
    const config = new Map<string[], string>([
      [["main"], "let temp from lib; temp.get()"],
      [["lib"], "out fn get() => 100;"],
    ]);

    const result = interpretAll(["main"], config);
    expect(result).toBe(100);
  });

  it("executes module function with args via variable reference", () => {
    const config = new Map<string[], string>([
      [["main"], "let math from lib; math.add(5, 7)"],
      [["lib"], "out fn add(a: I32, b: I32) => a + b;"],
    ]);

    const result = interpretAll(["main"], config);
    expect(result).toBe(12);
  });
});

describe("interpretAll - struct and native imports", () => {
  it("uses struct type from module with destructuring", () => {
    const config = new Map<string[], string>([
      [
        ["main"],
        "use { Wrapper } from lib; let value = Wrapper { x : 100 }; value.x",
      ],
      [["lib"], "out struct Wrapper { x : I32 }"],
    ]);

    const result = interpretAll(["main"], config);
    expect(result).toBe(100);
  });

  it("calls native function via extern declaration", () => {
    const config = new Map<string[], string>([
      [["main"], "extern use { get } from lib; extern fn get() : I32; get()"],
    ]);
    const nativeConfig = new Map<string[], string>([
      [["lib"], "export function get() { return 100; }"],
    ]);

    const result = interpretAll(["main"], config, nativeConfig);
    expect(result).toBe(100);
  });

  it("calls native function with parameters", () => {
    const config = new Map<string[], string>([
      [
        ["main"],
        "extern use { add } from lib; extern fn add(a: I32, b: I32) : I32; add(5, 7)",
      ],
    ]);
    const nativeConfig = new Map<string[], string>([
      [["lib"], "export function add(a, b) { return a + b; }"],
    ]);

    const result = interpretAll(["main"], config, nativeConfig);
    expect(result).toBe(12);
  });
});
