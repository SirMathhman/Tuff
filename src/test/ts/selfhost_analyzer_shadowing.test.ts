import { describe, expect, test } from "bun:test";

import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { stagePrebuiltSelfhostCompiler } from "./selfhost_helpers";

describe("selfhost analyzer", () => {
  test("rejects variable shadowing (nested scope redeclare)", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-analyzer",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
    await mkdir(outDir, { recursive: true });

    // IMPORTANT: Bun caches ESM modules by URL.
    // If we stage the prebuilt compiler and also write the freshly-compiled
    // stage2 compiler into the same directory, importing stage2 may reuse the
    // cached stage1 `tuffc_lib.mjs`. That would bypass new pipeline changes.
    const stage1Dir = resolve(outDir, "stage1");
    const stage2Dir = resolve(outDir, "stage2");
    await mkdir(stage1Dir, { recursive: true });
    await mkdir(stage2Dir, { recursive: true });

    // Stage 1: start from the committed prebuilt compiler.
    const { entryFile: stage1File } = await stagePrebuiltSelfhostCompiler(
      stage1Dir
    );

    // Stage2 output needs a runtime too.
    const stage2RtDir = resolve(stage2Dir, "rt");
    await mkdir(stage2RtDir, { recursive: true });
    await copyFile(
      resolve("rt/stdlib.mjs"),
      resolve(stage2RtDir, "stdlib.mjs")
    );
    await copyFile(resolve("rt/vec.mjs"), resolve(stage2RtDir, "vec.mjs"));

    // Stage 2: recompile the selfhost compiler from current sources.
    const stage2In = resolve("src", "main", "tuff", "compiler", "tuffc.tuff");
    const stage2Out = resolve(stage2Dir, "tuffc.stage2.mjs");

    const tuffc1 = await import(pathToFileURL(stage1File).toString());
    expect(typeof tuffc1.main).toBe("function");
    const rc2 = tuffc1.main([stage2In, stage2Out]);
    expect(rc2).toBe(0);

    // This program is invalid per the language rule: no shadowing allowed.
    const shadowIn = resolve(stage2Dir, "shadow.tuff");
    const shadowOut = resolve(stage2Dir, "shadow.mjs");
    await writeFile(
      shadowIn,
      "fn main() => { let x = 1; let y = { let x = 2; x }; x + y }\n",
      "utf8"
    );

    const tuffc2 = await import(pathToFileURL(stage2Out).toString());
    expect(typeof tuffc2.main).toBe("function");

    expect(() => tuffc2.main([shadowIn, shadowOut])).toThrow(/shadow/i);
  });
});
