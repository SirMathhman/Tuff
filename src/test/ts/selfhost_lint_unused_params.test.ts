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

    const { stage2Dir, tuffc2 } = await buildStage2SelfhostCompiler(outDir);

    const inFile = resolve(stage2Dir, "unused_params.tuff");
    const outFile = resolve(stage2Dir, "unused_params.mjs");

    await writeFile(
      inFile,
      ["fn f(x: I32) : I32 => 0", "", "fn main() : I32 => f(1)", ""].join("\n"),
      "utf8"
    );

    const { value: rc, out } = captureStdout(() =>
      tuffc2.main(["--warn-unused-params", inFile, outFile])
    );
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

    const { stage2Dir, tuffc2 } = await buildStage2SelfhostCompiler(outDir);

    const inFile = resolve(stage2Dir, "unused_params_ignored.tuff");
    const outFile = resolve(stage2Dir, "unused_params_ignored.mjs");

    await writeFile(
      inFile,
      ["fn f(_x: I32) : I32 => 0", "", "fn main() : I32 => f(1)", ""].join(
        "\n"
      ),
      "utf8"
    );

    const { value: rc, out } = captureStdout(() =>
      tuffc2.main(["--warn-unused-params", inFile, outFile])
    );
    expect(rc).toBe(0);

    expect(out).not.toMatch(/unused parameter/i);
  });

  test("config can enable unused parameter warnings", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-unused-params",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, tuffc2 } = await buildStage2SelfhostCompiler(outDir);

    const configFile = resolve(stage2Dir, "tuffc.conf");
    await writeFile(configFile, "warn_unused_params=true\n", "utf8");

    const inFile = resolve(stage2Dir, "unused_params_cfg.tuff");
    const outFile = resolve(stage2Dir, "unused_params_cfg.mjs");

    await writeFile(
      inFile,
      ["fn f(x: I32) : I32 => 0", "", "fn main() : I32 => f(1)", ""].join("\n"),
      "utf8"
    );

    const { value: rc, out } = captureStdout(() =>
      tuffc2.main(["--config", configFile, inFile, outFile])
    );
    expect(rc).toBe(0);

    expect(out).toMatch(/unused parameter/i);
    expect(out).toMatch(/\bx\b/);
  });

  test("config can disable unused parameter warnings even if flag enables", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-unused-params",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, tuffc2 } = await buildStage2SelfhostCompiler(outDir);

    const configFile = resolve(stage2Dir, "tuffc.conf");
    await writeFile(configFile, "warn_unused_params=false\n", "utf8");

    const inFile = resolve(stage2Dir, "unused_params_cfg_disable.tuff");
    const outFile = resolve(stage2Dir, "unused_params_cfg_disable.mjs");

    await writeFile(
      inFile,
      ["fn f(x: I32) : I32 => 0", "", "fn main() : I32 => f(1)", ""].join("\n"),
      "utf8"
    );

    const { value: rc, out } = captureStdout(() =>
      tuffc2.main([
        "--warn-unused-params",
        "--config",
        configFile,
        inFile,
        outFile,
      ])
    );
    expect(rc).toBe(0);
    expect(out).not.toMatch(/unused parameter/i);
  });
});
