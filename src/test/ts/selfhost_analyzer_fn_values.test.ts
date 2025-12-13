import { describe, expect, test } from "vitest";

import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { stagePrebuiltSelfhostCompiler } from "./selfhost_helpers";

describe("selfhost analyzer", () => {
  test("rejects let annotation mismatch for function-value call", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-analyzer-fn-values",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
    await mkdir(outDir, { recursive: true });

    const stage1Dir = resolve(outDir, "stage1");
    const stage2Dir = resolve(outDir, "stage2");
    await mkdir(stage1Dir, { recursive: true });
    await mkdir(stage2Dir, { recursive: true });

    const { entryFile: stage1File } = await stagePrebuiltSelfhostCompiler(
      stage1Dir
    );

    const stage2RtDir = resolve(stage2Dir, "rt");
    await mkdir(stage2RtDir, { recursive: true });
    await copyFile(
      resolve("rt/stdlib.mjs"),
      resolve(stage2RtDir, "stdlib.mjs")
    );
    await copyFile(resolve("rt/vec.mjs"), resolve(stage2RtDir, "vec.mjs"));

    const stage2In = resolve("src", "main", "tuff", "compiler", "tuffc.tuff");
    const stage2Out = resolve(stage2Dir, "tuffc.stage2.mjs");

    const tuffc1 = await import(pathToFileURL(stage1File).toString());
    const rc2 = tuffc1.main([stage2In, stage2Out]);
    expect(rc2).toBe(0);

    const badIn = resolve(stage2Dir, "bad_fn_value_call.tuff");
    const badOut = resolve(stage2Dir, "bad_fn_value_call.mjs");
    await writeFile(
      badIn,
      [
        "fn main() : Bool => {",
        "  let f = (x: I32) : I32 => x + 1;",
        "  let y: Bool = f(1);", // should be I32
        "  y",
        "}",
        "",
      ].join("\n"),
      "utf8"
    );

    const tuffc2 = await import(pathToFileURL(stage2Out).toString());
    expect(() => tuffc2.main([badIn, badOut])).toThrow(/annotation|mismatch|Bool|I32/i);
  });
});
