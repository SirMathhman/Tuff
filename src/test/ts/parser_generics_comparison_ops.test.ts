import { describe, test, expect } from "vitest";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { stagePrebuiltSelfhostCompiler } from "./selfhost_helpers";

describe("parser: comparison operators in generic functions", () => {
  test("< operator in generic function body", async () => {
    const outDir = resolve(".dist", "parser-test-" + Date.now());
    await mkdir(outDir, { recursive: true });

    const { entryFile: tuffcFile } = await stagePrebuiltSelfhostCompiler(
      outDir,
      { includeStd: true, includeCompilerSources: false }
    );

    const tuffc = await import(pathToFileURL(tuffcFile).toString());

    const srcTestFile = resolve(
      "src/test/tuff/parser_generics_comparison_ops.test.tuff"
    );

    // Stage test file into outDir so imports can resolve
    const { copyFile } = await import("node:fs/promises");
    const testFile = join(outDir, "parser_generics_comparison_ops.test.tuff");
    const outFile = join(outDir, "parser_generics_comparison_ops.test.mjs");
    await copyFile(srcTestFile, testFile);

    // Compile the test file
    const rc = tuffc.run([testFile, outFile]);

    // Should compile successfully (rc === 0)
    expect(rc).toBe(0);
    expect(existsSync(outFile)).toBe(true);

    // Import and run the compiled test module (must call main() explicitly)
    const mod = await import(
      pathToFileURL(outFile).toString() + `?v=${Date.now()}`
    );
    expect(typeof mod.main).toBe("function");

    const rcRun = mod.main();

    // main() returns 0 if all tests pass, 1 if any fail
    expect(rcRun).toBe(0);
  });
});
