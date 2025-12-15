import { describe, expect, test } from "vitest";

import { lintCode, setFluffOptions } from "./compiler_api_wrapper";

/**
 * Drives the new in-memory lint API:
 * `lint_code(entryCode, moduleLookup)` should analyze modules without file I/O.
 */
describe("compiler API (in-memory lint)", () => {
  test("returns structured errors and warnings", async () => {
    // Enable warnings we can assert on.
    await setFluffOptions(1, 1);

    const modules: Record<string, string> = {
      "dep::math": ["out fn add(a: I32, b: I32) : I32 => a + b;", ""].join(
        "\n"
      ),
    };

    const moduleLookup = (p: string) => modules[p] ?? "";

    // Case 1: warning-only
    {
      const entryCode = [
        "from dep::math use { add };",
        "fn main() : I32 => {",
        "  let x: I32 = 1;", // warning: unused local
        "  add(1, 2)",
        "}",
        "",
      ].join("\n");

      const result = await lintCode(entryCode, modules);
      expect(result.diagnostics ?? "").toBe("");
      expect(result.success).toBe(true);
      const errors = result.errors ?? [];
      const warnings = result.warnings ?? [];

      expect(errors.length).toBe(0);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toHaveProperty("msg");
    }

    // Case 2: error
    {
      const entryCode = [
        "from dep::math use { add };",
        "fn main() : I32 => add(true, 2)",
        "",
      ].join("\n");

      const result = await lintCode(entryCode, modules);
      expect(result.success).toBe(false);
      const errors = result.errors ?? [];
      const warnings = result.warnings ?? [];

      expect(errors.length).toBeGreaterThan(0);
      expect(warnings.length).toBeGreaterThanOrEqual(0);

      // Sanity check the shape: DiagInfo has line/col/msg
      expect(errors[0]).toHaveProperty("line");
      expect(errors[0]).toHaveProperty("col");
      expect(errors[0]).toHaveProperty("msg");
    }
  });
});
