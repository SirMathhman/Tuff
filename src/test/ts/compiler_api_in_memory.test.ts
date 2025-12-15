import { describe, expect, test } from "vitest";

import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { stagePrebuiltSelfhostCompiler } from "./selfhost_helpers";

/**
 * This test drives the "Option 4" refactor:
 * compilation should be callable with code strings + a moduleLookup callback,
 * with zero file I/O performed by the compiler logic itself.
 */
describe("compiler API (in-memory)", () => {
  test("compiles entry + dependency from strings", async () => {
    const outDir = resolve(
      ".dist",
      "compiler-api-in-memory",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
    await mkdir(outDir, { recursive: true });

    // Use stage2 output so it includes current workspace changes to tuffc_lib.
    // Stage1 prebuilt is used only as the compiler that builds stage2.
    const stage2Dir = resolve(outDir, "stage2");
    await mkdir(stage2Dir, { recursive: true });

    const { entryFile: stage1Tuffc } = await stagePrebuiltSelfhostCompiler(
      resolve(outDir, "stage1")
    );
    const tuffc1 = await import(pathToFileURL(stage1Tuffc).toString());

    const stage2In = resolve("src", "main", "tuff", "compiler", "tuffc.tuff");
    const stage2Out = resolve(stage2Dir, "tuffc.stage2.mjs");

    const rc = (tuffc1 as any).main([stage2In, stage2Out]);
    expect(rc).toBe(0);

    // Stage2-emitted modules import runtime as ../rt/*.mjs (relative to their folder).
    // Ensure runtime exists so we can import the stage2 compiler modules.
    const stage2RtDir = resolve(stage2Dir, "rt");
    await mkdir(stage2RtDir, { recursive: true });
    await copyFile(
      resolve("rt/stdlib.mjs"),
      resolve(stage2RtDir, "stdlib.mjs")
    );
    await copyFile(resolve("rt/vec.mjs"), resolve(stage2RtDir, "vec.mjs"));

    // Stage2 compilation should have emitted tuffc_lib.mjs into stage2Dir.
    const tuffcLib2Path = resolve(stage2Dir, "tuffc_lib.mjs");
    const tuffcLib2 = await import(pathToFileURL(tuffcLib2Path).toString());

    expect(typeof (tuffcLib2 as any).compile_code).toBe("function");

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

    const moduleLookup = (p: string) => modules[p] ?? "";

    const result = (tuffcLib2 as any).compile_code(entryCode, moduleLookup);

    // Expect a tuple: (outRelPaths, jsOutputs)
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);

    const outRelPaths = result[0] as string[];
    const jsOutputs = result[1] as string[];

    expect(outRelPaths.length).toBe(jsOutputs.length);
    expect(outRelPaths.length).toBeGreaterThanOrEqual(2);

    const entryIdx = outRelPaths.indexOf("entry.mjs");
    expect(entryIdx).toBeGreaterThanOrEqual(0);
    expect(jsOutputs[entryIdx]).toContain("export");
    expect(jsOutputs[entryIdx]).toContain("main");

    const depIdx = outRelPaths.findIndex((p) => p.endsWith("dep/math.mjs"));
    expect(depIdx).toBeGreaterThanOrEqual(0);
    expect(jsOutputs[depIdx]).toContain("add");
  });
});
