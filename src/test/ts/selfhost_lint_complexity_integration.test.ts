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

describe("selfhost cyclomatic complexity linting (integration)", () => {
  test("fluff reads build.json and prints complexity warning", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-complexity",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify(
        { fluff: { complexity: "warning", complexityThreshold: 1 } },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const inFile = resolve(stage2Dir, "high_complexity.tuff");
    await writeFile(
      inFile,
      [
        "fn complex_fn(a: I32) : I32 => {",
        "  if (a > 0) { yield 1; }",
        "  0",
        "}",
        "",
        "out fn run() : I32 => complex_fn(1)",
        "",
      ].join("\n"),
      "utf8"
    );

    const { value: rc, out } = captureStdout(() => fluff2.run([inFile]));
    expect(rc).toBe(0);
    expect(out).toMatch(/warning/i);
    expect(out).toMatch(/cyclomatic complexity/i);
    expect(out).toMatch(/complex_fn/);
  });
});
