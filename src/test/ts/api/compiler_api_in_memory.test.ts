import { describe, expect, test } from "vitest";

import { compileCode } from "../compiler_api_wrapper";

/**
 * This test drives the "Option 4" refactor:
 * compilation should be callable with code strings + a moduleLookup callback,
 * with zero file I/O performed by the compiler logic itself.
 */
describe("compiler API (in-memory)", () => {
  test("compiles entry + dependency from strings", async () => {
    const modules: Record<string, string> = {
      "dep::math": ["out fn add(a: I32, b: I32) : I32 => a + b;", ""].join(
        "\n"
      ),
    };

    const entryCode = [
      "from dep::math use { add };",
      "fn main() : I32 => add(1, 2)",
      "",
    ].join("\n");

    const result = await compileCode(entryCode, modules);
    expect(result.diagnostics ?? "").toBe("");
    expect(result.success).toBe(true);
    const outRelPaths = result.outRelPaths ?? [];
    const jsOutputs = result.jsOutputs ?? [];

    expect(outRelPaths.length).toBe(jsOutputs.length);
    expect(outRelPaths.length).toBeGreaterThanOrEqual(2);

    const entryIdx = outRelPaths.indexOf("entry.mjs");
    expect(entryIdx).toBeGreaterThanOrEqual(0);
    expect(jsOutputs[entryIdx]).toContain("export");
    expect(jsOutputs[entryIdx]).toContain("main");

    const depIdx = outRelPaths.findIndex((p: string) =>
      p.endsWith("dep/math.mjs")
    );
    expect(depIdx).toBeGreaterThanOrEqual(0);
    expect(jsOutputs[depIdx]).toContain("add");
  });
});
