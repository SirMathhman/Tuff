import { describe, expect, test } from "vitest";

import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { stagePrebuiltSelfhostCompiler } from "./selfhost_helpers";

describe("selfhost analyzer: Never type", () => {
  const setupTestEnv = async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-never-type",
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

    return { stage2Dir, stage2Out };
  };

  test("accepts I32 function with panic branch (Never absorption in if)", async () => {
    const { stage2Dir, stage2Out } = await setupTestEnv();

    // This should type-check: panic returns Never, which is absorbed by I32
    const goodIn = resolve(stage2Dir, "panic_in_i32_fn.tuff");
    const goodOut = resolve(stage2Dir, "panic_in_i32_fn.mjs");
    await writeFile(
      goodIn,
      `extern from rt::stdlib use { panic };

fn helper(ok: Bool) : I32 => {
  if (!ok) { panic("error"); }
  42
}

fn main() : I32 => helper(true)
`,
      "utf8"
    );

    const tuffc2 = await import(pathToFileURL(stage2Out).toString());
    // Should compile successfully (return 0), not throw type error
    const rc = tuffc2.main([goodIn, goodOut]);
    expect(rc).toBe(0);
  });

  test("accepts Never type annotation on user-defined function", async () => {
    const { stage2Dir, stage2Out } = await setupTestEnv();

    const goodIn = resolve(stage2Dir, "user_never_fn.tuff");
    const goodOut = resolve(stage2Dir, "user_never_fn.mjs");
    await writeFile(
      goodIn,
      `extern from rt::stdlib use { panic };

fn my_panic(msg: String) : Never => panic(msg)

fn helper(ok: Bool) : I32 => {
  if (!ok) { my_panic("failed"); }
  100
}

fn main() : I32 => helper(true)
`,
      "utf8"
    );

    const tuffc2 = await import(pathToFileURL(stage2Out).toString());
    const rc = tuffc2.main([goodIn, goodOut]);
    expect(rc).toBe(0);
  });

  test("Never absorption in if expression branches", async () => {
    const { stage2Dir, stage2Out } = await setupTestEnv();

    const goodIn = resolve(stage2Dir, "never_if_expr.tuff");
    const goodOut = resolve(stage2Dir, "never_if_expr.mjs");
    await writeFile(
      goodIn,
      `extern from rt::stdlib use { panic };

fn get_value(opt: Bool) : I32 => {
  // then branch is Never, else branch is I32 => result is I32
  let x = if (!opt) { panic("no value"); } else { 123 };
  x
}

fn main() : I32 => get_value(true)
`,
      "utf8"
    );

    const tuffc2 = await import(pathToFileURL(stage2Out).toString());
    const rc = tuffc2.main([goodIn, goodOut]);
    expect(rc).toBe(0);
  });

  test("Never absorption in match expression arms", async () => {
    const { stage2Dir, stage2Out } = await setupTestEnv();

    const goodIn = resolve(stage2Dir, "never_match_expr.tuff");
    const goodOut = resolve(stage2Dir, "never_match_expr.mjs");
    await writeFile(
      goodIn,
      `extern from rt::stdlib use { panic };

type MyOption<T> = Some<T> | None;

fn unwrap(opt: MyOption<I32>) : I32 => {
  if (opt.tag == "Some") {
    opt.value
  } else {
    panic("unwrap on None")
  }
}

fn main() : I32 => unwrap(Some(42))
`,
      "utf8"
    );

    const tuffc2 = await import(pathToFileURL(stage2Out).toString());
    const rc = tuffc2.main([goodIn, goodOut]);
    expect(rc).toBe(0);
  });

  test("block ending in panic satisfies any return type", async () => {
    const { stage2Dir, stage2Out } = await setupTestEnv();

    const goodIn = resolve(stage2Dir, "block_panic_tail.tuff");
    const goodOut = resolve(stage2Dir, "block_panic_tail.mjs");
    await writeFile(
      goodIn,
      `extern from rt::stdlib use { panic };

fn fail_with_string() : String => {
  panic("always fails")
}

fn fail_with_i32() : I32 => {
  panic("always fails")
}

fn main() : I32 => 0
`,
      "utf8"
    );

    const tuffc2 = await import(pathToFileURL(stage2Out).toString());
    const rc = tuffc2.main([goodIn, goodOut]);
    expect(rc).toBe(0);
  });
});
