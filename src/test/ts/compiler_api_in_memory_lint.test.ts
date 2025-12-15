import { describe, expect, test } from "vitest";

import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { stagePrebuiltSelfhostCompiler } from "./selfhost_helpers";

/**
 * Drives the new in-memory lint API:
 * `lint_code(entryCode, moduleLookup)` should analyze modules without file I/O.
 */
describe("compiler API (in-memory lint)", () => {
  test("returns structured errors and warnings", async () => {
    const outDir = resolve(
      ".dist",
      "compiler-api-in-memory-lint",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
    await mkdir(outDir, { recursive: true });

    const stage1Dir = resolve(outDir, "stage1");
    const stage2Dir = resolve(outDir, "stage2");
    await mkdir(stage1Dir, { recursive: true });
    await mkdir(stage2Dir, { recursive: true });

    const { entryFile: stage1Tuffc } = await stagePrebuiltSelfhostCompiler(
      stage1Dir
    );
    const tuffc1 = await import(pathToFileURL(stage1Tuffc).toString());

    const stage2In = resolve("src", "main", "tuff", "compiler", "tuffc.tuff");
    const stage2Out = resolve(stage2Dir, "tuffc.stage2.mjs");

    const rc = (tuffc1 as any).main([stage2In, stage2Out]);
    expect(rc).toBe(0);

    // Runtime for importing stage2 compiler modules.
    const stage2RtDir = resolve(stage2Dir, "rt");
    await mkdir(stage2RtDir, { recursive: true });
    await copyFile(
      resolve("rt/stdlib.mjs"),
      resolve(stage2RtDir, "stdlib.mjs")
    );
    await copyFile(resolve("rt/vec.mjs"), resolve(stage2RtDir, "vec.mjs"));

    const tuffcLib2Path = resolve(stage2Dir, "tuffc_lib.mjs");
    const tuffcLib2 = await import(pathToFileURL(tuffcLib2Path).toString());

    // Enable warnings we can assert on.
    const analyzer2Path = resolve(stage2Dir, "analyzer.mjs");
    const analyzer2 = await import(pathToFileURL(analyzer2Path).toString());
    (analyzer2 as any).set_fluff_options(1, 1);

    expect(typeof (tuffcLib2 as any).lint_code).toBe("function");

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

      const result = (tuffcLib2 as any).lint_code(entryCode, moduleLookup);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);

      const errors = result[0] as any[];
      const warnings = result[1] as any[];

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

      const result = (tuffcLib2 as any).lint_code(entryCode, moduleLookup);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);

      const errors = result[0] as any[];
      const warnings = result[1] as any[];

      expect(errors.length).toBeGreaterThan(0);
      expect(warnings.length).toBeGreaterThanOrEqual(0);

      // Sanity check the shape: DiagInfo has line/col/msg
      expect(errors[0]).toHaveProperty("line");
      expect(errors[0]).toHaveProperty("col");
      expect(errors[0]).toHaveProperty("msg");
    }
  });
});
