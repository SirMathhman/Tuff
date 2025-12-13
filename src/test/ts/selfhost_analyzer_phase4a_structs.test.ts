import { describe, expect, test } from "vitest";

import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { stagePrebuiltSelfhostCompiler } from "./selfhost_helpers";

async function setupStage2Compiler(caseLabel: string) {
  const outDir = resolve(
    ".dist",
    "selfhost-analyzer-phase4a",
    `case-${caseLabel}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  await mkdir(outDir, { recursive: true });

  // Avoid ESM cache collisions between stage1 and stage2 outputs.
  const stage1Dir = resolve(outDir, "stage1");
  const stage2Dir = resolve(outDir, "stage2");
  await mkdir(stage1Dir, { recursive: true });
  await mkdir(stage2Dir, { recursive: true });

  const { entryFile: stage1File } = await stagePrebuiltSelfhostCompiler(
    stage1Dir
  );

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
  return { stage2Dir, tuffc2 };
}

describe("selfhost analyzer (phase 4a)", () => {
  test("rejects let annotation mismatch", async () => {
    const { stage2Dir, tuffc2 } = await setupStage2Compiler(
      "let-annotation-mismatch"
    );

    const badIn = resolve(stage2Dir, "bad_let_ann.tuff");
    const badOut = resolve(stage2Dir, "bad_let_ann.mjs");
    await writeFile(badIn, 'fn main() => { let x: I32 = "bad"; x }\n', "utf8");

    expect(() => tuffc2.main([badIn, badOut])).toThrow(
      /let\s+x.*expected\s+I32/i
    );
  });

  test("accepts let annotation match for struct", async () => {
    const { stage2Dir, tuffc2 } = await setupStage2Compiler(
      "let-annotation-struct-ok"
    );

    const okIn = resolve(stage2Dir, "ok_let_struct_ann.tuff");
    const okOut = resolve(stage2Dir, "ok_let_struct_ann.mjs");
    await writeFile(
      okIn,
      [
        "struct Point { x: I32, y: I32 }",
        "fn main() : I32 => {",
        "  let p: Point = Point { 1, 2 };",
        "  p.x",
        "}",
        "",
      ].join("\n"),
      "utf8"
    );

    const rc = tuffc2.main([okIn, okOut]);
    expect(rc).toBe(0);

    const mod = await import(pathToFileURL(okOut).toString());
    expect(mod.main()).toBe(1);
  });

  test("rejects unknown struct in struct literal", async () => {
    const { stage2Dir, tuffc2 } = await setupStage2Compiler(
      "unknown-struct-literal"
    );

    const badIn = resolve(stage2Dir, "bad_unknown_struct_lit.tuff");
    const badOut = resolve(stage2Dir, "bad_unknown_struct_lit.mjs");
    await writeFile(
      badIn,
      ["fn main() => {", "  let p = Nope { 1 };", "  0", "}", ""].join("\n"),
      "utf8"
    );

    expect(() => tuffc2.main([badIn, badOut])).toThrow(/unknown\s+struct/i);
  });

  test("rejects wrong arity in positional struct literal", async () => {
    const { stage2Dir, tuffc2 } = await setupStage2Compiler(
      "struct-literal-wrong-arity"
    );

    const badIn = resolve(stage2Dir, "bad_struct_lit_arity.tuff");
    const badOut = resolve(stage2Dir, "bad_struct_lit_arity.mjs");
    await writeFile(
      badIn,
      [
        "struct Point { x: I32, y: I32 }",
        "fn main() => {",
        "  let p = Point { 1 };",
        "  0",
        "}",
        "",
      ].join("\n"),
      "utf8"
    );

    expect(() => tuffc2.main([badIn, badOut])).toThrow(
      /wrong number of values in struct literal/i
    );
  });

  test("rejects struct literal field type mismatch", async () => {
    const { stage2Dir, tuffc2 } = await setupStage2Compiler(
      "struct-literal-field-type-mismatch"
    );

    const badIn = resolve(stage2Dir, "bad_struct_field_type.tuff");
    const badOut = resolve(stage2Dir, "bad_struct_field_type.mjs");
    await writeFile(
      badIn,
      [
        "struct Point { x: I32, y: String }",
        "fn main() => {",
        "  let p = Point { 1, 2 };",
        "  0",
        "}",
        "",
      ].join("\n"),
      "utf8"
    );

    expect(() => tuffc2.main([badIn, badOut])).toThrow(/expected\s+String/i);
  });

  test("rejects unknown field access on known struct", async () => {
    const { stage2Dir, tuffc2 } = await setupStage2Compiler(
      "unknown-field-access"
    );

    const badIn = resolve(stage2Dir, "bad_unknown_field_access.tuff");
    const badOut = resolve(stage2Dir, "bad_unknown_field_access.mjs");
    await writeFile(
      badIn,
      [
        "struct Point { x: I32 }",
        "fn main() => {",
        "  let p = Point { 1 };",
        "  p.y",
        "}",
        "",
      ].join("\n"),
      "utf8"
    );

    expect(() => tuffc2.main([badIn, badOut])).toThrow(
      /unknown\s+field\s+y\s+on\s+struct\s+Point/i
    );
  });
});
