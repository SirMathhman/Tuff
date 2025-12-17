import { describe, expect, test } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { stagePrebuiltSelfhostCompiler } from "./selfhost_helpers";

describe("duplicate modifier errors", () => {
  test("errors on 'out out fn'", async () => {
    const outDir = resolve(".dist", "tuff-tests", `dup-mod-${Date.now()}`);
    await mkdir(outDir, { recursive: true });

    const { entryFile: tuffcFile } = await stagePrebuiltSelfhostCompiler(
      outDir,
      { includeStd: true }
    );

    const tuffc = await import(pathToFileURL(tuffcFile).toString());

    const src = `out out fn foo() : I32 => 42
out fn run() : I32 => foo()
`;
    const inputFile = resolve(outDir, "dup_out.tuff");
    const outputFile = resolve(outDir, "dup_out.mjs");
    await writeFile(inputFile, src);

    // Should throw an error with "duplicate modifier"
    await expect(async () => {
      tuffc.run([inputFile, outputFile]);
    }).rejects.toThrow(/duplicate modifier/);
  });

  test("errors on 'class class fn'", async () => {
    const outDir = resolve(".dist", "tuff-tests", `dup-mod-${Date.now()}`);
    await mkdir(outDir, { recursive: true });

    const { entryFile: tuffcFile } = await stagePrebuiltSelfhostCompiler(
      outDir,
      { includeStd: true }
    );

    const tuffc = await import(pathToFileURL(tuffcFile).toString());

    const src = `class class fn Foo(x: I32) => {}
out fn run() : I32 => 0
`;
    const inputFile = resolve(outDir, "dup_class.tuff");
    const outputFile = resolve(outDir, "dup_class.mjs");
    await writeFile(inputFile, src);

    // Should throw an error with "duplicate modifier"
    await expect(async () => {
      tuffc.run([inputFile, outputFile]);
    }).rejects.toThrow(/duplicate modifier/);
  });

  test("errors on 'extern extern fn'", async () => {
    const outDir = resolve(".dist", "tuff-tests", `dup-mod-${Date.now()}`);
    await mkdir(outDir, { recursive: true });

    const { entryFile: tuffcFile } = await stagePrebuiltSelfhostCompiler(
      outDir,
      { includeStd: true }
    );

    const tuffc = await import(pathToFileURL(tuffcFile).toString());

    const src = `extern extern fn bar() : I32;
out fn run() : I32 => 0
`;
    const inputFile = resolve(outDir, "dup_extern.tuff");
    const outputFile = resolve(outDir, "dup_extern.mjs");
    await writeFile(inputFile, src);

    // Should throw an error with "duplicate modifier"
    await expect(async () => {
      tuffc.run([inputFile, outputFile]);
    }).rejects.toThrow(/duplicate modifier/);
  });

  test("accepts 'extern fn' without body", async () => {
    const outDir = resolve(".dist", "tuff-tests", `extern-fn-${Date.now()}`);
    await mkdir(outDir, { recursive: true });

    const { entryFile: tuffcFile } = await stagePrebuiltSelfhostCompiler(
      outDir,
      { includeStd: true }
    );

    const tuffc = await import(pathToFileURL(tuffcFile).toString());

    const src = `extern fn bar() : I32;
out fn run() : I32 => 0
`;
    const inputFile = resolve(outDir, "extern_fn.tuff");
    const outputFile = resolve(outDir, "extern_fn.mjs");
    await writeFile(inputFile, src);

    // Should succeed (exit code 0)
    const result = tuffc.run([inputFile, outputFile]);
    expect(result).toBe(0);
  });

  test("accepts 'out extern fn' without body", async () => {
    const outDir = resolve(".dist", "tuff-tests", `extern-fn-${Date.now()}`);
    await mkdir(outDir, { recursive: true });

    const { entryFile: tuffcFile } = await stagePrebuiltSelfhostCompiler(
      outDir,
      { includeStd: true }
    );

    const tuffc = await import(pathToFileURL(tuffcFile).toString());

    const src = `out extern fn bar() : I32;
extern out fn baz() : String;
out fn run() : I32 => 0
`;
    const inputFile = resolve(outDir, "out_extern_fn.tuff");
    const outputFile = resolve(outDir, "out_extern_fn.mjs");
    await writeFile(inputFile, src);

    // Should succeed (exit code 0)
    const result = tuffc.run([inputFile, outputFile]);
    expect(result).toBe(0);
  });
});
