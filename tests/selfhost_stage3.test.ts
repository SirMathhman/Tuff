import { describe, expect, test } from "bun:test";

import { copyFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { stagePrebuiltSelfhostCompiler } from "./selfhost_helpers";

async function writeRuntime(outDir: string) {
  const rtDir = resolve(outDir, "rt");
  await mkdir(rtDir, { recursive: true });
  await copyFile(resolve("rt/stdlib.mjs"), resolve(rtDir, "stdlib.mjs"));
  await copyFile(resolve("rt/vec.mjs"), resolve(rtDir, "vec.mjs"));
}

describe("selfhost stage3", () => {
  test("selfhost reaches a fixed point (stage3 == stage4)", async () => {
    const rootDir = resolve(
      ".dist",
      "selfhost-stage3",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const stage1Dir = resolve(rootDir, "stage1");
    const stage2Dir = resolve(rootDir, "stage2");
    const stage3Dir = resolve(rootDir, "stage3");
    const stage4Dir = resolve(rootDir, "stage4");

    await mkdir(stage1Dir, { recursive: true });
    await mkdir(stage2Dir, { recursive: true });
    await mkdir(stage3Dir, { recursive: true });
    await mkdir(stage4Dir, { recursive: true });

    // Stage 1: start from the committed prebuilt selfhost compiler
    const { entryFile: stage1File } = await stagePrebuiltSelfhostCompiler(
      stage1Dir
    );

    // Stage 2: stage1 compiles the selfhost compiler source again
    await writeRuntime(stage2Dir);
    const stage2In = resolve("selfhost", "tuffc.tuff");
    const stage2Out = resolve(stage2Dir, "tuffc.mjs");

    const tuffc1 = await import(pathToFileURL(stage1File).toString());
    expect(typeof tuffc1.main).toBe("function");
    const rc2 = tuffc1.main([stage2In, stage2Out]);
    expect(rc2).toBe(0);

    // Stage 3: stage2 compiles the same selfhost source again
    await writeRuntime(stage3Dir);
    const stage3Out = resolve(stage3Dir, "tuffc.mjs");

    const tuffc2 = await import(pathToFileURL(stage2Out).toString());
    expect(typeof tuffc2.main).toBe("function");
    const rc3 = tuffc2.main([stage2In, stage3Out]);
    expect(rc3).toBe(0);

    // Stage 4: stage3 compiles the same selfhost source again
    await writeRuntime(stage4Dir);
    const stage4Out = resolve(stage4Dir, "tuffc.mjs");

    const tuffc3 = await import(pathToFileURL(stage3Out).toString());
    expect(typeof tuffc3.main).toBe("function");
    const rc4 = tuffc3.main([stage2In, stage4Out]);
    expect(rc4).toBe(0);

    // Compare stage3 and stage4 outputs (both entry + lib).
    const stage3Entry = await readFile(stage3Out, "utf8");
    const stage4Entry = await readFile(stage4Out, "utf8");
    expect(stage4Entry).toBe(stage3Entry);

    const stage3Lib = await readFile(
      resolve(stage3Dir, "tuffc_lib.mjs"),
      "utf8"
    );
    const stage4Lib = await readFile(
      resolve(stage4Dir, "tuffc_lib.mjs"),
      "utf8"
    );
    expect(stage4Lib).toBe(stage3Lib);
  });
});
