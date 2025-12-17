import { describe, expect, test } from "vitest";
import { prebuiltSelfhostUrl } from "./test_utils";

// Tests that 'main' is reserved for C entry point conventions.
// Tuff uses top-level code execution, not main().

describe("main function error", () => {
  test("top-level function named 'main' causes error", async () => {
    const stage1lib = (await import(
      prebuiltSelfhostUrl("tuffc_lib.mjs")
    )) as any;

    // Top-level function named main should error (even when called)
    const badSrc = `fn main() : I32 => 42; main()`;

    let msg = "";
    try {
      stage1lib.compile_tiny(badSrc);
      throw new Error("expected compile_tiny to throw");
    } catch (e: any) {
      msg = String(e?.message ?? e);
    }

    expect(msg).toContain("'main' is reserved");
    expect(msg).toContain("C entry point");
  });

  test("local function named 'main' is allowed", async () => {
    const stage1lib = (await import(
      prebuiltSelfhostUrl("tuffc_lib.mjs")
    )) as any;

    // Local function named main should be allowed (only top-level forbidden)
    const goodSrc = `
      fn outer() : I32 => {
        fn main() : I32 => 42;
        main()
      }
      outer()
    `;

    const result = stage1lib.compile_tiny(goodSrc);
    expect(result).toContain("function outer");
  });

  test("top-level class fn named 'main' causes error", async () => {
    const stage1lib = (await import(
      prebuiltSelfhostUrl("tuffc_lib.mjs")
    )) as any;

    const badSrc = `class fn main() => {}; main()`;

    let msg = "";
    try {
      stage1lib.compile_tiny(badSrc);
      throw new Error("expected compile_tiny to throw");
    } catch (e: any) {
      msg = String(e?.message ?? e);
    }

    expect(msg).toContain("'main' is reserved");
  });

  test("top-level function with different name is allowed", async () => {
    const stage1lib = (await import(
      prebuiltSelfhostUrl("tuffc_lib.mjs")
    )) as any;

    const goodSrc = `fn start() : I32 => 42; start()`;

    const result = stage1lib.compile_tiny(goodSrc);
    expect(result).toContain("function start");
  });

  test("valid top-level code without functions is allowed", async () => {
    const stage1lib = (await import(
      prebuiltSelfhostUrl("tuffc_lib.mjs")
    )) as any;

    // Top-level statements without main function is valid
    const goodSrc = `let x = 100;`;

    const result = stage1lib.compile_tiny(goodSrc);
    expect(result).toContain("const x = 100");
  });
});
