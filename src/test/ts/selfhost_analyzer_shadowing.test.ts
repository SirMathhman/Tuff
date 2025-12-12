import { describe, expect, test } from "bun:test";

import { mkdir, writeFile } from "node:fs/promises";
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

    // Stage 1: start from the committed prebuilt compiler.
    const { entryFile: stage1File } = await stagePrebuiltSelfhostCompiler(
      outDir
    );

    // Stage 2: recompile the selfhost compiler from current sources.
    const stage2In = resolve("src", "main", "tuff", "compiler", "tuffc.tuff");
    const stage2Out = resolve(outDir, "tuffc.stage2.mjs");

    const tuffc1 = await import(pathToFileURL(stage1File).toString());
    expect(typeof tuffc1.main).toBe("function");
    const rc2 = tuffc1.main([stage2In, stage2Out]);
    expect(rc2).toBe(0);

    // This program is invalid per the language rule: no shadowing allowed.
    const shadowIn = resolve(outDir, "shadow.tuff");
    const shadowOut = resolve(outDir, "shadow.mjs");
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
