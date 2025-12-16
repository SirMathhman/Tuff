import { describe, expect, test } from "vitest";

import { compileCode, importEsmFromOutputs } from "../compiler_api_wrapper";

/**
 * Validates the in-memory compiler can emit *multiple* JS modules and that our
 * test harness can execute the resulting module graph without writing files.
 */
describe("compiler API (in-memory, multi-module execution)", () => {
  test("executes entry that imports a dependency", async () => {
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

    const mod = await importEsmFromOutputs(outRelPaths, jsOutputs, "entry.mjs");
    expect(typeof mod.main).toBe("function");
    expect(mod.main()).toBe(3);
  });
});
