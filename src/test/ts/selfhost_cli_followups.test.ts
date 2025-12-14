import { describe, expect, test } from "vitest";

import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

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

async function writeText(p: string, src: string): Promise<void> {
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, src, "utf8");
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

describe("selfhost CLI follow-ups", () => {
  test("`lint` subcommand lints without writing output", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-cli-followups",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, tuffc2 } = await buildStage2SelfhostCompiler(outDir);

    const inFile = resolve(stage2Dir, "src", "main.tuff");
    const outFile = resolve(stage2Dir, "out.mjs");

    await writeText(
      inFile,
      ["fn main() : I32 => {", "  let x: I32 = 1;", "  x", "}", ""].join("\n")
    );

    const rc = tuffc2.main(["lint", inFile]);
    expect(rc).toBe(0);
    expect(await exists(outFile)).toBe(false);
  });

  test("--format json prints JSON warnings", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-cli-followups",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, tuffc2 } = await buildStage2SelfhostCompiler(outDir);

    const inFile = resolve(stage2Dir, "warn.tuff");
    await writeText(
      inFile,
      [
        "fn main() : I32 => {",
        "  let x: I32 = 1;", // unused
        "  0",
        "}",
        "",
      ].join("\n")
    );

    const { value: rc, out } = captureStdout(() =>
      tuffc2.main(["--format", "json", "--warn-unused-locals", "lint", inFile])
    );
    expect(rc).toBe(0);

    // Expect at least one JSON object line containing warning.
    const lines = out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.level).toBe("warning");
    expect(String(parsed.text)).toMatch(/unused local/i);
  });

  test("config auto-discovery finds tuffc.conf up the directory tree", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-cli-followups",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, tuffc2 } = await buildStage2SelfhostCompiler(outDir);

    const configDir = resolve(stage2Dir, "proj");
    const configFile = resolve(configDir, "tuffc.conf");
    await writeText(configFile, "warn_unused_locals=true\n");

    const inFile = resolve(configDir, "src", "main.tuff");
    const outFile = resolve(configDir, "out.mjs");

    await writeText(
      inFile,
      ["fn main() : I32 => {", "  let x: I32 = 1;", "  0", "}", ""].join("\n")
    );

    const { value: rc, out } = captureStdout(() =>
      tuffc2.main([inFile, outFile])
    );
    expect(rc).toBe(0);
    expect(out).toMatch(/unused local/i);
  });

  test("--warn-all enables unused locals and params warnings", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-cli-followups",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, tuffc2 } = await buildStage2SelfhostCompiler(outDir);

    const inFile = resolve(stage2Dir, "warn_all.tuff");
    const outFile = resolve(stage2Dir, "warn_all.mjs");

    await writeText(
      inFile,
      [
        "fn f(x: I32) : I32 => 0",
        "fn main() : I32 => {",
        "  let y: I32 = 1;",
        "  f(1)",
        "}",
        "",
      ].join("\n")
    );

    const { value: rc, out } = captureStdout(() =>
      tuffc2.main(["--warn-all", inFile, outFile])
    );
    expect(rc).toBe(0);
    expect(out).toMatch(/unused local/i);
    expect(out).toMatch(/unused parameter/i);
  });

  test("--no-warn silences warnings even if config enables them", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-cli-followups",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, tuffc2 } = await buildStage2SelfhostCompiler(outDir);

    const configFile = resolve(stage2Dir, "tuffc.conf");
    await writeText(
      configFile,
      "warn_unused_locals=true\nwarn_unused_params=true\n"
    );

    const inFile = resolve(stage2Dir, "no_warn.tuff");
    const outFile = resolve(stage2Dir, "no_warn.mjs");

    await writeText(
      inFile,
      [
        "fn f(x: I32) : I32 => 0",
        "fn main() : I32 => {",
        "  let y: I32 = 1;",
        "  f(1)",
        "}",
        "",
      ].join("\n")
    );

    const { value: rc, out } = captureStdout(() =>
      tuffc2.main(["--no-warn", inFile, outFile])
    );
    expect(rc).toBe(0);
    expect(out).not.toMatch(/warning/i);
  });

  test("lint can be run twice in the same process", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-cli-followups",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, tuffc2 } = await buildStage2SelfhostCompiler(outDir);

    const inFile = resolve(stage2Dir, "twice.tuff");
    await writeText(
      inFile,
      ["fn main() : I32 => {", "  let x: I32 = 1;", "  0", "}", ""].join("\n")
    );

    const runOnce = () => tuffc2.main(["--warn-unused-locals", "lint", inFile]);

    const r1 = captureStdout(runOnce);
    expect(r1.value).toBe(0);
    expect(r1.out).toMatch(/unused local/i);

    const r2 = captureStdout(runOnce);
    expect(r2.value).toBe(0);
    expect(r2.out).toMatch(/unused local/i);
  });
});
