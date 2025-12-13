import { describe, expect, test } from "vitest";

import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { stagePrebuiltSelfhostCompiler } from "./selfhost_helpers";

describe("selfhost analyzer", () => {
  test("rejects arg type mismatch for function-typed value call", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-analyzer-fn-value-calls",
      `bad-args-${Date.now()}-${Math.random().toString(16).slice(2)}`
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

    const badIn = resolve(stage2Dir, "bad_fn_typed_value_args.tuff");
    const badOut = resolve(stage2Dir, "bad_fn_typed_value_args.mjs");
    await writeFile(
      badIn,
      [
        "class fn Adder(x: I32) => {",
        "  fn add(y: I32) : I32 => x + y;",
        "}",
        "",
        "fn main() : I32 => {",
        "  let a = Adder(1);",
        "  let f = a.add;",
        "  let z: I32 = f(true);", // y must be I32
        "  z",
        "}",
        "",
      ].join("\n"),
      "utf8"
    );

    const tuffc2 = await import(pathToFileURL(stage2Out).toString());
    expect(() => tuffc2.main([badIn, badOut])).toThrow(
      /arg|expected|I32|Bool|mismatch|annotation/i
    );
  });

  test("infers generic type args for method-field call without explicit <...>", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-analyzer-fn-value-calls",
      `infer-generic-${Date.now()}-${Math.random().toString(16).slice(2)}`
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

    const okIn = resolve(stage2Dir, "ok_generic_method_infer.tuff");
    const okOut = resolve(stage2Dir, "ok_generic_method_infer.mjs");
    await writeFile(
      okIn,
      [
        "class fn Box() => {",
        "  fn id<T>(x: T) : T => x;",
        "}",
        "",
        "fn main() : I32 => {",
        "  let b = Box();",
        "  let y: I32 = b.id(123);",
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
