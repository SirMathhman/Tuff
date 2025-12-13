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

describe("selfhost analyzer (primitives + operator typing)", () => {
  test("enforces U32 and Char annotations", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-analyzer-prims-ops",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, tuffc2 } = await buildStage2Compiler(outDir);

    // U32 should be enforced (string is not assignable)
    {
      const badIn = resolve(stage2Dir, "bad_u32_annot.tuff");
      const badOut = resolve(stage2Dir, "bad_u32_annot.mjs");
      await writeFile(
        badIn,
        ["fn main() : I32 => {", '  let x: U32 = "nope";', "  0", "}", ""].join(
          "\n"
        ),
        "utf8"
      );
      expect(() => tuffc2.main([badIn, badOut])).toThrow(/U32|String|type/i);
    }

    // Char should be enforced (string is not assignable)
    {
      const badIn = resolve(stage2Dir, "bad_char_annot.tuff");
      const badOut = resolve(stage2Dir, "bad_char_annot.mjs");
      await writeFile(
        badIn,
        ["fn main() : I32 => {", '  let c: Char = "A";', "  0", "}", ""].join(
          "\n"
        ),
        "utf8"
      );
      expect(() => tuffc2.main([badIn, badOut])).toThrow(/Char|String|type/i);
    }
  });

  test("rejects obviously invalid arithmetic operand types", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-analyzer-prims-ops",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, tuffc2 } = await buildStage2Compiler(outDir);

    const badIn = resolve(stage2Dir, "bad_mul_operands.tuff");
    const badOut = resolve(stage2Dir, "bad_mul_operands.mjs");
    await writeFile(
      badIn,
      [
        "fn main() : I32 => {",
        '  let x: I32 = "nope" * 2;',
        "  x",
        "}",
        "",
      ].join("\n"),
      "utf8"
    );

    expect(() => tuffc2.main([badIn, badOut])).toThrow(
      /\*|mul|operand|I32|String|type/i
    );
  });
});
