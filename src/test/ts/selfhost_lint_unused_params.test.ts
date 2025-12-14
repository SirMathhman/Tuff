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
  test("warns on unused function parameters", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-unused-params",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify({ fluff: { unusedParams: "warning" } }, null, 2) + "\n",
      "utf8"
    );

    const inFile = resolve(stage2Dir, "unused_params.tuff");
    const outFile = resolve(stage2Dir, "unused_params.mjs");

    await writeFile(
      inFile,
      ["fn f(x: I32) : I32 => 0", "", "fn main() : I32 => f(1)", ""].join("\n"),
      "utf8"
    );

    const { value: rc, out } = captureStdout(() => fluff2.main([inFile]));
    expect(rc).toBe(0);

    expect(out).toMatch(/warning/i);
    expect(out).toMatch(/unused parameter/i);
    expect(out).toMatch(/\bx\b/);
  });

  test("does not warn for underscore-prefixed parameters", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-unused-params",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify({ fluff: { unusedParams: "warning" } }, null, 2) + "\n",
      "utf8"
    );

    const inFile = resolve(stage2Dir, "unused_params_ignored.tuff");
    const outFile = resolve(stage2Dir, "unused_params_ignored.mjs");

    await writeFile(
      inFile,
      ["fn f(_x: I32) : I32 => 0", "", "fn main() : I32 => f(1)", ""].join(
        "\n"
      ),
      "utf8"
    );

    const { value: rc, out } = captureStdout(() => fluff2.main([inFile]));
    expect(rc).toBe(0);

    expect(out).not.toMatch(/unused parameter/i);
  });

  test("build.json can enable unused parameter warnings", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-unused-params",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    const inFile = resolve(stage2Dir, "unused_params_cfg.tuff");
    const outFile = resolve(stage2Dir, "unused_params_cfg.mjs");

    await writeFile(
      inFile,
      ["fn f(x: I32) : I32 => 0", "", "fn main() : I32 => f(1)", ""].join("\n"),
      "utf8"
    );

    const r0 = captureStdout(() => fluff2.main([inFile]));
    expect(r0.value).toBe(0);
    expect(r0.out).not.toMatch(/unused parameter/i);

    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify({ fluff: { unusedParams: "warning" } }, null, 2) + "\n",
      "utf8"
    );

    const r1 = captureStdout(() => fluff2.main([inFile]));
    expect(r1.value).toBe(0);
    expect(r1.out).toMatch(/unused parameter/i);
    expect(r1.out).toMatch(/\bx\b/);
  });

  test("build.json can disable unused parameter warnings", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-unused-params",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify({ fluff: { unusedParams: "off" } }, null, 2) + "\n",
      "utf8"
    );

    const inFile = resolve(stage2Dir, "unused_params_cfg_disable.tuff");
    const outFile = resolve(stage2Dir, "unused_params_cfg_disable.mjs");

    await writeFile(
      inFile,
      ["fn f(x: I32) : I32 => 0", "", "fn main() : I32 => f(1)", ""].join("\n"),
      "utf8"
    );

    const { value: rc, out } = captureStdout(() => fluff2.main([inFile]));
    expect(rc).toBe(0);
    expect(out).not.toMatch(/unused parameter/i);
  });
});
