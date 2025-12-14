import { describe, expect, test } from "vitest";

import { writeFile } from "node:fs/promises";
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

describe("selfhost lint config", () => {
  test("build.json can disable unused-locals warnings", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-config",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify({ fluff: { unusedLocals: "off" } }, null, 2) + "\n",
      "utf8"
    );

    const inFile = resolve(stage2Dir, "flag_disable_unused_locals.tuff");

    await writeFile(
      inFile,
      [
        "fn main() : I32 => {",
        "  let x: I32 = 1;", // would warn
        "  0",
        "}",
        "",
      ].join("\n"),
      "utf8"
    );

    const { value: rc, out } = captureStdout(() =>
      fluff2.main([inFile])
    );
    expect(rc).toBe(0);
    expect(out).not.toMatch(/unused local/i);
  });

  test("build.json can enable unused-locals warnings", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-config",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify({ fluff: { unusedLocals: "warning" } }, null, 2) + "\n",
      "utf8"
    );

    const inFile = resolve(stage2Dir, "config_enable_unused_locals.tuff");

    await writeFile(
      inFile,
      [
        "fn main() : I32 => {",
        "  let x: I32 = 1;", // would warn
        "  0",
        "}",
        "",
      ].join("\n"),
      "utf8"
    );

    const { value: rc, out } = captureStdout(() =>
      fluff2.main([inFile])
    );
    expect(rc).toBe(0);
    expect(out).toMatch(/unused local/i);
  });
});
