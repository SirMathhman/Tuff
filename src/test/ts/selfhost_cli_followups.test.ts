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
  test("fluff lints without writing any output file", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-cli-followups",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    const inFile = resolve(stage2Dir, "src", "main.tuff");
    const outFile = resolve(stage2Dir, "out.mjs");

    await writeText(
      inFile,
      ["fn main() : I32 => {", "  let x: I32 = 1;", "  x", "}", ""].join("\n")
    );

    // Fluff has no output path, so ensure it doesn't incidentally write one.
    const rc = fluff2.run([inFile]);
    expect(rc).toBe(0);
    expect(await exists(outFile)).toBe(false);
  });

  test("fluff --format json prints JSON warnings", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-cli-followups",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    // Enable lint as a warning via build.json (auto-discovered from inFile).
    await writeText(
      resolve(stage2Dir, "build.json"),
      JSON.stringify({ fluff: { unusedLocals: "warning" } }, null, 2) + "\n"
    );

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
      fluff2.run(["--format", "json", inFile])
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

  test("config auto-discovery finds build.json up the directory tree", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-cli-followups",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    const configDir = resolve(stage2Dir, "proj");
    const configFile = resolve(configDir, "build.json");
    await writeText(
      configFile,
      JSON.stringify({ fluff: { unusedLocals: "warning" } }, null, 2) + "\n"
    );

    const inFile = resolve(configDir, "src", "main.tuff");

    await writeText(
      inFile,
      ["fn main() : I32 => {", "  let x: I32 = 1;", "  0", "}", ""].join("\n")
    );

    const { value: rc, out } = captureStdout(() =>
      fluff2.run([inFile])
    );
    expect(rc).toBe(0);
    expect(out).toMatch(/unused local/i);
  });

  test("fluff can be run twice in the same process", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-cli-followups",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    await writeText(
      resolve(stage2Dir, "build.json"),
      JSON.stringify({ fluff: { unusedLocals: "warning" } }, null, 2) + "\n"
    );

    const inFile = resolve(stage2Dir, "twice.tuff");
    await writeText(
      inFile,
      ["fn main() : I32 => {", "  let x: I32 = 1;", "  0", "}", ""].join("\n")
    );

    const runOnce = () => fluff2.run([inFile]);

    const r1 = captureStdout(runOnce);
    expect(r1.value).toBe(0);
    expect(r1.out).toMatch(/unused local/i);

    const r2 = captureStdout(runOnce);
    expect(r2.value).toBe(0);
    expect(r2.out).toMatch(/unused local/i);
  });
});
