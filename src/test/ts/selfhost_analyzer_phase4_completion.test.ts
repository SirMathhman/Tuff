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

describe("selfhost analyzer (phase 4 completion)", () => {
  test("generic type resolution enforces type args and returns", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-analyzer-phase4",
      `case-generics-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, tuffc2 } = await buildStage2Compiler(outDir);

    // --- OK: inference from args ---
    {
      const okIn = resolve(stage2Dir, "ok_generic_infer.tuff");
      const okOut = resolve(stage2Dir, "ok_generic_infer.mjs");
      await writeFile(
        okIn,
        [
          "fn id<T>(x: T) : T => x",
          "fn main() : I32 => {",
          "  let a: I32 = id(1);",
          "  a",
          "}",
          "",
        ].join("\n"),
        "utf8"
      );

      const rc = tuffc2.main([okIn, okOut]);
      expect(rc).toBe(0);
      const mod = await import(pathToFileURL(okOut).toString());
      expect(mod.main()).toBe(1);
    }

    // --- Error: explicit type args contradict actual argument ---
    {
      const badIn = resolve(stage2Dir, "bad_generic_arg_mismatch.tuff");
      const badOut = resolve(stage2Dir, "bad_generic_arg_mismatch.mjs");
      await writeFile(
        badIn,
        [
          "fn id<T>(x: T) : T => x",
          "fn main() : I32 => {",
          "  let a: I32 = id<Bool>(1);",
          "  a",
          "}",
          "",
        ].join("\n"),
        "utf8"
      );

      expect(() => tuffc2.main([badIn, badOut])).toThrow(
        /id|generic|Bool|I32|type/i
      );
    }

    // --- Error: return type derived from specialization must match context ---
    {
      const badIn = resolve(stage2Dir, "bad_generic_return_mismatch.tuff");
      const badOut = resolve(stage2Dir, "bad_generic_return_mismatch.mjs");
      await writeFile(
        badIn,
        [
          "fn id<T>(x: T) : T => x",
          "fn main() : I32 => {",
          "  let b: Bool = id<I32>(1);",
          "  if (b) { 1 } else { 0 }",
          "}",
          "",
        ].join("\n"),
        "utf8"
      );

      expect(() => tuffc2.main([badIn, badOut])).toThrow(
        /return|let\s+b|Bool|I32|type/i
      );
    }
  });

  test("union type narrowing gates payload field access", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-analyzer-phase4",
      `case-union-narrowing-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}`
    );

    const { stage2Dir, tuffc2 } = await buildStage2Compiler(outDir);

    // --- Error: accessing .value without narrowing ---
    {
      const badIn = resolve(stage2Dir, "bad_union_value_unguarded.tuff");
      const badOut = resolve(stage2Dir, "bad_union_value_unguarded.mjs");
      await writeFile(
        badIn,
        [
          "type Option<T> = Some<T> | None;",
          "fn main() : I32 => {",
          "  let o: Option<I32> = None;",
          "  o.value",
          "}",
          "",
        ].join("\n"),
        "utf8"
      );

      expect(() => tuffc2.main([badIn, badOut])).toThrow(
        /Option|Some|None|value|narrow|type/i
      );
    }

    // --- OK: tag check narrows to payload variant ---
    {
      const okIn = resolve(stage2Dir, "ok_union_value_guarded.tuff");
      const okOut = resolve(stage2Dir, "ok_union_value_guarded.mjs");
      await writeFile(
        okIn,
        [
          "type Option<T> = Some<T> | None;",
          "fn main() : I32 => {",
          "  let o: Option<I32> = Some(3);",
          '  if (o.tag == "Some") { o.value } else { 0 }',
          "}",
          "",
        ].join("\n"),
        "utf8"
      );

      const rc = tuffc2.main([okIn, okOut]);
      expect(rc).toBe(0);
      const mod = await import(pathToFileURL(okOut).toString());
      expect(mod.main()).toBe(3);
    }

    // --- Error: else branch is narrowed away from payload variant ---
    {
      const badIn = resolve(stage2Dir, "bad_union_value_in_else.tuff");
      const badOut = resolve(stage2Dir, "bad_union_value_in_else.mjs");
      await writeFile(
        badIn,
        [
          "type Option<T> = Some<T> | None;",
          "fn main() : I32 => {",
          "  let o: Option<I32> = Some(3);",
          '  if (o.tag == "Some") { 0 } else { o.value }',
          "}",
          "",
        ].join("\n"),
        "utf8"
      );

      expect(() => tuffc2.main([badIn, badOut])).toThrow(
        /value|Some|None|narrow|type/i
      );
    }

    // --- OK: `is` check narrows to payload variant ---
    {
      const okIn = resolve(stage2Dir, "ok_union_value_guarded_is.tuff");
      const okOut = resolve(stage2Dir, "ok_union_value_guarded_is.mjs");
      await writeFile(
        okIn,
        [
          "type Option<T> = Some<T> | None;",
          "fn main() : I32 => {",
          "  let o: Option<I32> = Some(3);",
          "  if (o is Some) { o.value } else { 0 }",
          "}",
          "",
        ].join("\n"),
        "utf8"
      );

      const rc = tuffc2.main([okIn, okOut]);
      expect(rc).toBe(0);
      const mod = await import(pathToFileURL(okOut).toString());
      expect(mod.main()).toBe(3);
    }

    // --- Error: else branch is NOT narrowed to payload variant (using `is`) ---
    {
      const badIn = resolve(stage2Dir, "bad_union_value_in_else_is.tuff");
      const badOut = resolve(stage2Dir, "bad_union_value_in_else_is.mjs");
      await writeFile(
        badIn,
        [
          "type Option<T> = Some<T> | None;",
          "fn main() : I32 => {",
          "  let o: Option<I32> = Some(3);",
          "  if (o is Some) { 0 } else { o.value }",
          "}",
          "",
        ].join("\n"),
        "utf8"
      );

      expect(() => tuffc2.main([badIn, badOut])).toThrow(
        /value|Some|None|narrow|type/i
      );
    }
  });

  test("array initialization tracking enforces read/write safety", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-analyzer-phase4",
      `case-arrays-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, tuffc2 } = await buildStage2Compiler(outDir);

    // --- Error: read beyond initialized prefix ---
    {
      const badIn = resolve(stage2Dir, "bad_array_read_uninit.tuff");
      const badOut = resolve(stage2Dir, "bad_array_read_uninit.mjs");
      await writeFile(
        badIn,
        [
          "fn main() : I32 => {",
          "  let buf: [U8; 2; 5] = [10, 20];",
          "  buf[2]",
          "}",
          "",
        ].join("\n"),
        "utf8"
      );

      expect(() => tuffc2.main([badIn, badOut])).toThrow(
        /uninit|initialized|array|index/i
      );
    }

    // --- Error: cannot skip initialization (write past next slot) ---
    {
      const badIn = resolve(stage2Dir, "bad_array_write_skip.tuff");
      const badOut = resolve(stage2Dir, "bad_array_write_skip.mjs");
      await writeFile(
        badIn,
        [
          "fn main() : I32 => {",
          "  let mut buf: [U8; 2; 5] = [10, 20];",
          "  buf[4] = 77;",
          "  0",
          "}",
          "",
        ].join("\n"),
        "utf8"
      );

      expect(() => tuffc2.main([badIn, badOut])).toThrow(
        /skip|initialized|array|index/i
      );
    }

    // --- OK: writing the next index increases initialized and allows read ---
    {
      const okIn = resolve(stage2Dir, "ok_array_write_next_then_read.tuff");
      const okOut = resolve(stage2Dir, "ok_array_write_next_then_read.mjs");
      await writeFile(
        okIn,
        [
          "fn main() : I32 => {",
          "  let mut buf: [U8; 2; 5] = [10, 20];",
          "  buf[2] = 30;",
          "  buf[2]",
          "}",
          "",
        ].join("\n"),
        "utf8"
      );

      const rc = tuffc2.main([okIn, okOut]);
      expect(rc).toBe(0);
      const mod = await import(pathToFileURL(okOut).toString());
      expect(mod.main()).toBe(30);
    }

    // --- Error: bounds check on literal index ---
    {
      const badIn = resolve(stage2Dir, "bad_array_oob.tuff");
      const badOut = resolve(stage2Dir, "bad_array_oob.mjs");
      await writeFile(
        badIn,
        [
          "fn main() : I32 => {",
          "  let mut buf: [U8; 2; 5] = [10, 20];",
          "  buf[5] = 1;",
          "  0",
          "}",
          "",
        ].join("\n"),
        "utf8"
      );

      expect(() => tuffc2.main([badIn, badOut])).toThrow(
        /bounds|out of bounds|index|array/i
      );
    }
  });
});
