import { describe, expect, test } from "bun:test";
import { compileToESM } from "../src/index";

import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

async function writeRuntime(outDir: string) {
  const rtDir = resolve(outDir, "rt");
  await mkdir(rtDir, { recursive: true });
  await copyFile(resolve("rt/stdlib.mjs"), resolve(rtDir, "stdlib.mjs"));
  await copyFile(resolve("rt/vec.mjs"), resolve(rtDir, "vec.mjs"));
}

describe("selfhost structs + unions", () => {
  test("selfhost tuffc compiles structs and union decls", async () => {
    const src = await readFile(resolve("selfhost/tuffc.tuff"), "utf8");
    const { js, diagnostics } = compileToESM({
      filePath: resolve("selfhost/tuffc.tuff"),
      source: src,
    });
    const errors = diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0) {
      throw new Error(
        [
          "bootstrap compiler failed to compile selfhost/tuffc.tuff:",
          ...errors.map(
            (e) =>
              `${e.span?.filePath ?? ""}:${e.span?.line ?? "?"}:${
                e.span?.col ?? "?"
              } ${e.message}`
          ),
        ].join("\n")
      );
    }

    const outDir = resolve(".dist", "selfhost", `structs-unions-${Date.now()}`);
    await mkdir(outDir, { recursive: true });
    await writeRuntime(outDir);

    const tuffcFile = resolve(outDir, "tuffc.mjs");
    await writeFile(tuffcFile, js, "utf8");

    const tinyIn = resolve(outDir, "tiny.tuff");
    const tinyOut = resolve(outDir, "tiny.mjs");

    await writeFile(
      tinyIn,
      [
        "extern from rt::vec use { vec_new, vec_push, vec_get, vec_set };",
        "",
        "type Option<T> = Some<T> | None;",
        "",
        "struct Point {",
        "  x: I32,",
        "  y: I32",
        "}",
        "",
        "fn main() => {",
        "  let mut p = Point { 10, 20 };",
        "  p.x = p.x + 1;",
        "  let o = Some(42);",
        '  (if (o.tag == "Some") { p.x + p.y + o.value } else { 0 })',
        "}",
        "",
      ].join("\n"),
      "utf8"
    );

    const tuffc = await import(pathToFileURL(tuffcFile).toString());
    expect(typeof tuffc.main).toBe("function");

    const rc = tuffc.main([tinyIn, tinyOut]);
    expect(rc).toBe(0);

    const emitted = await readFile(tinyOut, "utf8");
    expect(emitted).toContain("export function main");

    const tinyMod = await import(pathToFileURL(tinyOut).toString());
    expect(tinyMod.main()).toBe(73);
  });
});
