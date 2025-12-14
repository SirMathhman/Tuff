import { describe, expect, test } from "vitest";

import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { stagePrebuiltSelfhostCompiler } from "./selfhost_helpers";

async function buildStage2Compiler(outDir: string) {
  await mkdir(outDir, { recursive: true });

  const stage1Dir = resolve(outDir, "stage1");
  const stage2Dir = resolve(outDir, "stage2");
  await mkdir(stage1Dir, { recursive: true });
  await mkdir(stage2Dir, { recursive: true });

  const { entryFile: stage1File } = await stagePrebuiltSelfhostCompiler(
    stage1Dir
  );

  // runtime for stage2 output
  const stage2RtDir = resolve(stage2Dir, "rt");
  await mkdir(stage2RtDir, { recursive: true });
  await copyFile(resolve("rt/stdlib.mjs"), resolve(stage2RtDir, "stdlib.mjs"));
  await copyFile(resolve("rt/vec.mjs"), resolve(stage2RtDir, "vec.mjs"));

  const stage2In = resolve("src", "main", "tuff", "compiler", "tuffc.tuff");
  const stage2Out = resolve(stage2Dir, "tuffc.stage2.mjs");

  const tuffc1 = await import(pathToFileURL(stage1File).toString());
  const rc2 = tuffc1.main([stage2In, stage2Out]);
  expect(rc2).toBe(0);

  const tuffc2 = await import(pathToFileURL(stage2Out).toString());
  expect(typeof tuffc2.main).toBe("function");

  return { stage2Dir, tuffc2 };
}

describe("selfhost analyzer linting", () => {
  test("rejects missing parameter type annotations (functions + lambdas)", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-param-types",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, tuffc2 } = await buildStage2Compiler(outDir);

    const badIn = resolve(stage2Dir, "bad_missing_param_types.tuff");
    const badOut = resolve(stage2Dir, "bad_missing_param_types.mjs");

    await writeFile(
      badIn,
      [
        // Missing types in a named function
        "fn f(a, b: I32, c) : I32 => b",
        "",
        // Missing types in a lambda
        "fn main() : I32 => {",
        "  let g = (x, y: I32, z) : I32 => y;",
        "  g(1, 2, 3)",
        "}",
        "",
      ].join("\n"),
      "utf8"
    );

    let msg = "";
    try {
      tuffc2.main([badIn, badOut]);
      throw new Error("expected compilation failure");
    } catch (e) {
      msg = String(e);
    }

    // Must mention missing type annotations, and list all missing params.
    expect(msg).toMatch(/missing type annotation/i);
    expect(msg).toMatch(/\bf\b/i);
    expect(msg).toMatch(/\ba\b/i);
    expect(msg).toMatch(/\bc\b/i);
    expect(msg).toMatch(/lambda/i);
    expect(msg).toMatch(/\bx\b/i);
    expect(msg).toMatch(/\bz\b/i);
  });
});
