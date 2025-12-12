import { describe, expect, test } from "bun:test";

import { readFile } from "node:fs/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { compileToESM } from "../src/index";

async function writeRuntime(outDir: string) {
  // NOTE: `extern from rt::...` becomes `import ... from "./rt/..."` which is
  // relative to *the importing module*. If we emit modules into subfolders
  // (like `./std/test.mjs`), those modules will look for `./rt/*` under that
  // subfolder. For now we copy runtime modules into both locations.
  const rtRoots = [resolve(outDir, "rt"), resolve(outDir, "std", "rt")];
  for (const rtDir of rtRoots) {
    await mkdir(rtDir, { recursive: true });
    await copyFile(resolve("rt/stdlib.mjs"), resolve(rtDir, "stdlib.mjs"));
    await copyFile(resolve("rt/vec.mjs"), resolve(rtDir, "vec.mjs"));
  }
}

async function compileModuleToOut(
  outDir: string,
  relOutPath: string,
  filePathForDiagnostics: string,
  src: string
) {
  const { js, diagnostics } = compileToESM({
    filePath: filePathForDiagnostics,
    source: src,
  });
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length) {
    throw new Error(
      [
        `compile failed for ${filePathForDiagnostics}:`,
        ...errors.map(
          (e) =>
            `${e.span?.filePath ?? ""}:${e.span?.line ?? "?"}:${
              e.span?.col ?? "?"
            } ${e.message}`
        ),
      ].join("\n")
    );
  }

  const outFile = resolve(outDir, relOutPath);
  await mkdir(resolve(outFile, ".."), { recursive: true });
  await writeFile(outFile, js, "utf8");
  return outFile;
}

describe("std::test (Tuff-written unit test helpers)", () => {
  test("pass case returns status 0", async () => {
    const stdTestSrc = await readFile(resolve("std", "test.tuff"), "utf8");

    const outDir = resolve(
      ".dist",
      "tuff-test-framework",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
    await mkdir(outDir, { recursive: true });
    await writeRuntime(outDir);

    await compileModuleToOut(
      outDir,
      "std/test.mjs",
      "/virtual/std/test.tuff",
      stdTestSrc
    );

    const programSrc = `
      import std::test

      fn main() => {
        test::reset();
        test::it("eq", test::expect_eq("eq", 1 + 1, 2));
        test::it("truth", test::expect("truth", 2 == 2));
        test::status()
      }
    `;

    const entryFile = await compileModuleToOut(
      outDir,
      "main.mjs",
      "/virtual/main.tuff",
      programSrc
    );

    const mod = await import(pathToFileURL(entryFile).toString());
    const testMod = await import(
      pathToFileURL(resolve(outDir, "std", "test.mjs")).toString()
    );
    expect(mod.main()).toBe(0);
    expect(testMod.get_failed()).toBe(0);
    expect(testMod.get_passed()).toBe(2);
  });

  test("failing case returns status 1", async () => {
    const stdTestSrc = await readFile(resolve("std", "test.tuff"), "utf8");

    const outDir = resolve(
      ".dist",
      "tuff-test-framework",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
    await mkdir(outDir, { recursive: true });
    await writeRuntime(outDir);

    await compileModuleToOut(
      outDir,
      "std/test.mjs",
      "/virtual/std/test.tuff",
      stdTestSrc
    );

    const programSrc = `
      import std::test

      fn main() => {
        test::reset();
        test::it("eq", test::expect_eq("eq", 1, 2));
        test::it("truth", test::expect("truth", 2 == 2));
        test::status()
      }
    `;

    const entryFile = await compileModuleToOut(
      outDir,
      "main.mjs",
      "/virtual/main.tuff",
      programSrc
    );

    const mod = await import(pathToFileURL(entryFile).toString());
    const testMod = await import(
      pathToFileURL(resolve(outDir, "std", "test.mjs")).toString()
    );
    expect(mod.main()).toBe(1);
    expect(testMod.get_failed()).toBe(1);
    expect(testMod.get_passed()).toBe(1);
  });
});
