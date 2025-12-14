import { describe, expect, test } from "vitest";

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildStage2SelfhostCompiler } from "./selfhost_helpers";

function captureStdout<T>(fn: () => T): { value: T; out: string } {
  const orig = process.stdout.write.bind(process.stdout);
  let out = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stdout as any).write = (chunk: any, ...args: any[]) => {
    out += String(chunk);
    return orig(chunk, ...args);
  };

  try {
    const value = fn();
    return { value, out };
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout as any).write = orig;
  }
}

describe("selfhost analyzer linting", () => {
  test("warns on unused local variables", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-unused-locals",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify({ fluff: { unusedLocals: "warning" } }, null, 2) + "\n",
      "utf8"
    );

    const inFile = resolve(stage2Dir, "unused_locals.tuff");
    const outFile = resolve(stage2Dir, "unused_locals.mjs");

    await writeFile(
      inFile,
      [
        "fn main() : I32 => {",
        "  let x: I32 = 1;", // should warn
        "  0",
        "}",
        "",
      ].join("\n"),
      "utf8"
    );

    const { value: rc, out } = captureStdout(() => fluff2.main([inFile]));
    expect(rc).toBe(0);

    expect(out).toMatch(/warning/i);
    expect(out).toMatch(/unused/i);
    expect(out).toMatch(/\bx\b/);
  });

  test("warns when a local is only written (never read)", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-unused-locals",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify({ fluff: { unusedLocals: "warning" } }, null, 2) + "\n",
      "utf8"
    );

    const inFile = resolve(stage2Dir, "unused_locals_written_only.tuff");
    const outFile = resolve(stage2Dir, "unused_locals_written_only.mjs");

    await writeFile(
      inFile,
      [
        "fn main() : I32 => {",
        "  let mut x: I32 = 0;",
        "  x = 1;", // write only
        "  0",
        "}",
        "",
      ].join("\n"),
      "utf8"
    );

    const { value: rc, out } = captureStdout(() => fluff2.main([inFile]));
    expect(rc).toBe(0);

    expect(out).toMatch(/warning/i);
    expect(out).toMatch(/unused/i);
    expect(out).toMatch(/\bx\b/);
  });

  test("does not warn when a local is read", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-unused-locals",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify({ fluff: { unusedLocals: "warning" } }, null, 2) + "\n",
      "utf8"
    );

    const inFile = resolve(stage2Dir, "unused_locals_read.tuff");
    const outFile = resolve(stage2Dir, "unused_locals_read.mjs");

    await writeFile(
      inFile,
      [
        "fn main() : I32 => {",
        "  let mut x: I32 = 0;",
        "  x = 1;",
        "  x",
        "}",
        "",
      ].join("\n"),
      "utf8"
    );

    const { value: rc, out } = captureStdout(() => fluff2.main([inFile]));
    expect(rc).toBe(0);

    expect(out).not.toMatch(/unused local/i);
  });

  test("does not warn for underscore-prefixed locals", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-unused-locals",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify({ fluff: { unusedLocals: "warning" } }, null, 2) + "\n",
      "utf8"
    );

    const inFile = resolve(stage2Dir, "unused_locals_ignored.tuff");
    const outFile = resolve(stage2Dir, "unused_locals_ignored.mjs");

    await writeFile(
      inFile,
      [
        "fn main() : I32 => {",
        "  let _ignored: I32 = 2;", // should NOT warn
        "  0",
        "}",
        "",
      ].join("\n"),
      "utf8"
    );

    const { value: rc, out } = captureStdout(() => fluff2.main([inFile]));
    expect(rc).toBe(0);

    expect(out).not.toMatch(/warning/i);
  });

  test("build.json can enable unused local warnings", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-unused-locals",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    // No build.json => lint defaults to off.

    const inFile = resolve(stage2Dir, "unused_locals_cfg.tuff");
    const outFile = resolve(stage2Dir, "unused_locals_cfg.mjs");

    await writeFile(
      inFile,
      [
        "fn main() : I32 => {",
        "  let x: I32 = 1;", // should warn when config enables
        "  0",
        "}",
        "",
      ].join("\n"),
      "utf8"
    );

    const r0 = captureStdout(() => fluff2.main([inFile]));
    expect(r0.value).toBe(0);
    expect(r0.out).not.toMatch(/unused local/i);

    // With build.json, lint is enabled.
    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify({ fluff: { unusedLocals: "warning" } }, null, 2) + "\n",
      "utf8"
    );

    const r1 = captureStdout(() => fluff2.main([inFile]));
    expect(r1.value).toBe(0);
    expect(r1.out).toMatch(/unused local/i);
  });

  test("build.json can disable unused local warnings", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-unused-locals",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify({ fluff: { unusedLocals: "off" } }, null, 2) + "\n",
      "utf8"
    );

    const inFile = resolve(stage2Dir, "unused_locals_cfg_disable.tuff");
    const outFile = resolve(stage2Dir, "unused_locals_cfg_disable.mjs");

    await writeFile(
      inFile,
      ["fn main() : I32 => {", "  let x: I32 = 1;", "  0", "}", ""].join("\n"),
      "utf8"
    );

    const { value: rc, out } = captureStdout(() => fluff2.main([inFile]));
    expect(rc).toBe(0);
    expect(out).not.toMatch(/unused local/i);
  });
});
