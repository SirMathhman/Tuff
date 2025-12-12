import { describe, expect, test } from "bun:test";

import { mkdir, writeFile } from "node:fs/promises";
import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { compileToESM } from "../src/index";

async function writeRuntime(outDir: string) {
  const rtDir = resolve(outDir, "rt");
  await mkdir(rtDir, { recursive: true });
  await copyFile(resolve("rt/stdlib.mjs"), resolve(rtDir, "stdlib.mjs"));
  await copyFile(resolve("rt/vec.mjs"), resolve(rtDir, "vec.mjs"));
}

async function buildStage1(outDir: string) {
  const tuffcSrc = await Bun.file(resolve("selfhost", "tuffc.tuff")).text();
  const { js, diagnostics } = compileToESM({
    filePath: resolve("selfhost", "tuffc.tuff"),
    source: tuffcSrc,
  });
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length) {
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

  await mkdir(outDir, { recursive: true });
  await writeRuntime(outDir);

  const stage1File = resolve(outDir, "tuffc.stage1.mjs");
  await writeFile(stage1File, js, "utf8");
  const stage1 = await import(pathToFileURL(stage1File).toString());
  return stage1 as any;
}

describe("selfhost diagnostics", () => {
  test("parse error includes location and caret", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-diagnostics",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const stage1 = await buildStage1(outDir);

    // Trigger a simple parser error: missing ')' in paren expression.
    const badSrc = `fn main() => (1 + 2`;

    let msg = "";
    try {
      stage1.compile_tiny(badSrc);
      throw new Error("expected compile_tiny to throw");
    } catch (e: any) {
      msg = String(e?.message ?? e);
    }

    // Should include file:line:col + a code frame caret.
    expect(msg).toMatch(/<input>:\d+:\d+/);
    expect(msg).toContain("expected");
    expect(msg).toMatch(/\n\s*\|\s*\^/);
  });
});
