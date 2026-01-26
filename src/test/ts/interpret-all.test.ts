import { describe } from "bun:test";
import { itAllBoth } from "./test-helpers";

describe("interpretAll - use statements", () => {
  itAllBoth("executes main module with lib dependency via import", (assertValid) => {
    const config = new Map<string[], string>([
      [["main"], "use { get } from lib; get()"],
      [["lib"], "out fn get() => 100;"],
    ]);

    assertValid(["main"], config, 100);
  });

  itAllBoth("handles function from lib module", (assertValid) => {
    const config = new Map<string[], string>([
      [["main"], "use { add } from lib; add(3, 4)"],
      [["lib"], "out fn add(a: I32, b: I32) => a + b;"],
    ]);

    assertValid(["main"], config, 7);
  });
});

describe("interpretAll - module references", () => {
  itAllBoth("executes module function via variable reference", (assertValid) => {
    const config = new Map<string[], string>([
      [["main"], "let temp from lib; temp.get()"],
      [["lib"], "out fn get() => 100;"],
    ]);

    assertValid(["main"], config, 100);
  });

  itAllBoth("executes module function with args via variable reference", (assertValid) => {
    const config = new Map<string[], string>([
      [["main"], "let math from lib; math.add(5, 7)"],
      [["lib"], "out fn add(a: I32, b: I32) => a + b;"],
    ]);

    assertValid(["main"], config, 12);
  });
});

describe("interpretAll - struct and native imports", () => {
  itAllBoth("uses struct type from module with destructuring", (assertValid) => {
    const config = new Map<string[], string>([
      [
        ["main"],
        "use { Wrapper } from lib; let value = Wrapper { x : 100 }; value.x",
      ],
      [["lib"], "out struct Wrapper { x : I32 }"],
    ]);

    assertValid(["main"], config, 100);
  });

  itAllBoth("calls native function via extern declaration", (assertValid) => {
    const config = new Map<string[], string>([
      [["main"], "extern use { get } from lib; extern fn get() : I32; get()"],
    ]);
    const nativeConfig = new Map<string[], string>([
      [["lib"], "export function get() { return 100; }"],
    ]);

    assertValid(["main"], config, 100, nativeConfig);
  });

  itAllBoth("calls native function with parameters", (assertValid) => {
    const config = new Map<string[], string>([
      [
        ["main"],
        "extern use { add } from lib; extern fn add(a: I32, b: I32) : I32; add(5, 7)",
      ],
    ]);
    const nativeConfig = new Map<string[], string>([
      [["lib"], "export function add(a, b) { return a + b; }"],
    ]);

    assertValid(["main"], config, 12, nativeConfig);
  });
});
