import { describe, expect, test } from "vitest";

import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { stagePrebuiltSelfhostCompiler } from "./selfhost_helpers";

describe("selfhost analyzer", () => {
  test("rejects let annotation mismatch for method-field call", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-analyzer-method-fields",
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

    const badIn = resolve(stage2Dir, "bad_method_field_call.tuff");
    const badOut = resolve(stage2Dir, "bad_method_field_call.mjs");
    await writeFile(
      badIn,
      [
        "class fn Counter(start: I32) => {",
        "  let mut count = start;",
        "  fn get() : I32 => count;",
        "}",
        "",
        "fn main() : Bool => {",
        "  let c = Counter(0);",
        "  let y: Bool = c.get();", // should be I32
        "  y",
        "}",
        "",
      ].join("\n"),
      "utf8"
    );

    const tuffc2 = await import(pathToFileURL(stage2Out).toString());
    expect(() => tuffc2.main([badIn, badOut])).toThrow(
      /annotation|mismatch|Bool|I32/i
    );
  });

  test("accepts method-field call when types match", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-analyzer-method-fields",
      `ok-${Date.now()}-${Math.random().toString(16).slice(2)}`
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

    const okIn = resolve(stage2Dir, "ok_method_field_call.tuff");
    const okOut = resolve(stage2Dir, "ok_method_field_call.mjs");
    await writeFile(
      okIn,
      [
        "class fn Counter(start: I32) => {",
        "  let mut count = start;",
        "  fn get() : I32 => count;",
        "}",
        "",
        "fn main() : I32 => {",
        "  let c = Counter(0);",
        "  let y: I32 = c.get();",
        "  y",
        "}",
        "",
      ].join("\n"),
      "utf8"
    );

    const tuffc2 = await import(pathToFileURL(stage2Out).toString());
    const rc = tuffc2.main([okIn, okOut]);
    expect(rc).toBe(0);
  });
});
