import { describe, expect, test } from "bun:test";
import { compile } from "./helpers";

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Minimal e2e: compile to JS and import as an actual `.mjs` file.
// Note: Bun's `import(data:...)` currently exposes only `default`, so we use a file URL.

describe("e2e", () => {
  test("compiled code runs as ESM", async () => {
    const { js, diagnostics } = compile(`
      type Option<T> = Some<T> | None;
      fn main() => {
        let v = match (Some(41)) { Some => 1, _ => 0 };
        v + 1
      }
    `);
    expect(diagnostics.some((d) => d.severity === "error")).toBe(false);

    const outDir = resolve(".dist", "e2e");
    await mkdir(outDir, { recursive: true });
    const outFile = resolve(
      outDir,
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`
    );
    await writeFile(outFile, js, "utf8");

    const mod = await import(pathToFileURL(outFile).toString());
    expect(typeof mod.main).toBe("function");
    expect(mod.main()).toBe(2);
  });

  test("script-style top-level code runs", async () => {
    const { js, diagnostics } = compile(`
      let mut ran = false;
      fn main() => { ran = true; 0 }
      main();
    `);
    const errors = diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0) {
      throw new Error(
        [
          "compile failed:",
          ...errors.map(
            (e) =>
              `${e.span?.filePath ?? ""}:${e.span?.line ?? "?"}:${
                e.span?.col ?? "?"
              } ${e.message}`
          ),
        ].join("\n")
      );
    }

    const outDir = resolve(".dist", "e2e");
    await mkdir(outDir, { recursive: true });
    const outFile = resolve(
      outDir,
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`
    );
    await writeFile(outFile, js, "utf8");

    const mod = await import(pathToFileURL(outFile).toString());
    expect(mod.ran).toBe(true);
  });
});
