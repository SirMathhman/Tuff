import { describe, expect, test } from "vitest";

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { stagePrebuiltSelfhostCompiler } from "./selfhost_helpers";

async function listTuffTests(rootDir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (entry.isFile() && full.endsWith(".test.tuff")) {
        results.push(full);
      }
    }
  }

  await walk(rootDir);
  results.sort();
  return results;
}

describe("tuff tests (.tuff)", () => {
  test("compiles and runs all src/test/tuff/*.test.tuff", async () => {
    const testsRoot = resolve("src", "test", "tuff");

    const testFiles = await listTuffTests(testsRoot);
    expect(testFiles.length).toBeGreaterThan(0);

    const outDir = resolve(
      ".dist",
      "tuff-tests",
      `suite-${Date.now().toString()}`
    );
    await mkdir(outDir, { recursive: true });

    const { entryFile: tuffcFile } = await stagePrebuiltSelfhostCompiler(
      outDir,
      {
        includeStd: true,
        includeCompilerSources: true,
      }
    );

    const tuffc = await import(pathToFileURL(tuffcFile).toString());
    expect(typeof tuffc.run).toBe("function");

    for (const testFile of testFiles) {
      // IMPORTANT: compile from a staged copy inside outDir so that module
      // resolution for `from std::test use { ... }` finds outDir/std/test.tuff
      // (rather than looking for src/test/tuff/std/test.tuff in the repo).
      const relFromTestsRoot = relative(testsRoot, testFile).replaceAll(
        "\\\\",
        "/"
      );

      // Stage into outDir root so `std::test` resolves to outDir/std/test.tuff
      // (stagePrebuiltSelfhostCompiler places std/ there).
      const inFile = resolve(outDir, relFromTestsRoot);
      const outFile = resolve(
        outDir,
        relFromTestsRoot.replace(/\.test\.tuff$/, ".test.mjs")
      );

      await mkdir(dirname(inFile), { recursive: true });
      await mkdir(dirname(outFile), { recursive: true });

      const src = await readFile(testFile, "utf8");
      await writeFile(inFile, src, "utf8");

      const rcCompile = tuffc.run([inFile, outFile]);
      expect(rcCompile, `compile failed: ${relFromTestsRoot}`).toBe(0);

      const mod = await import(
        pathToFileURL(outFile).toString() + `?v=${Date.now()}`
      );
      expect(typeof mod.run).toBe("function");

      const rcRun = mod.run();
      expect(rcRun, `run failed: ${relFromTestsRoot}`).toBe(0);
    }
  });
});
