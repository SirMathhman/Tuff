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

describe("selfhost analyzer (phase4a+4b)", () => {
  test("enforces let annotations, struct fields, function calls, and returns", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-analyzer-phase4ab",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, tuffc2 } = await buildStage2Compiler(outDir);

    // --- let annotation mismatch ---
    {
      const badIn = resolve(stage2Dir, "bad_let_annot.tuff");
      const badOut = resolve(stage2Dir, "bad_let_annot.mjs");
      await writeFile(
        badIn,
        ["fn main() : I32 => {", "  let x: Bool = 1;", "  0", "}", ""].join(
          "\n"
        ),
        "utf8"
      );
      expect(() => tuffc2.main([badIn, badOut])).toThrow(/type|Bool|I32|Int/i);
    }

    // --- struct literal + field typing ---
    {
      const badIn = resolve(stage2Dir, "bad_struct_field_type.tuff");
      const badOut = resolve(stage2Dir, "bad_struct_field_type.mjs");
      await writeFile(
        badIn,
        [
          "struct Point { x: I32, y: I32 }",
          "fn main() : I32 => {",
          "  let p: Point = Point { true, 2 };",
          "  p.x",
          "}",
          "",
        ].join("\n"),
        "utf8"
      );
      expect(() => tuffc2.main([badIn, badOut])).toThrow(
        /Point|field|I32|Bool|type/i
      );
    }

    // --- function call arity/type + return type ---
    {
      const badIn = resolve(stage2Dir, "bad_call_and_return.tuff");
      const badOut = resolve(stage2Dir, "bad_call_and_return.mjs");
      await writeFile(
        badIn,
        [
          "fn add(a: I32, b: I32) : I32 => a + b",
          "fn bad_ret() : Bool => 1",
          "fn main() : I32 => {",
          "  let x: I32 = add(true, 2);",
          "  if (bad_ret()) { x } else { 0 }",
          "}",
          "",
        ].join("\n"),
        "utf8"
      );
      expect(() => tuffc2.main([badIn, badOut])).toThrow(
        /add\(|arity|argument|return|Bool|I32|type/i
      );
    }
  });
});
