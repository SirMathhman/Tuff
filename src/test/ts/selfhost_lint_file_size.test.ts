import { describe, expect, test } from "vitest";

import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { buildStage2SelfhostCompiler } from "./selfhost_helpers";

type CaptureResult<T> =
  | { ok: true; value: T; out: string }
  | { ok: false; error: unknown; out: string };

function captureStdout<T>(fn: () => T): CaptureResult<T> {
  const orig = process.stdout.write.bind(process.stdout);
  let out = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stdout as any).write = (chunk: any, ...args: any[]) => {
    out += String(chunk);
    return orig(chunk, ...args);
  };

  try {
    const value = fn();
    return { ok: true, value, out };
  } catch (error) {
    return { ok: false, error, out };
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout as any).write = orig;
  }
}

function getErrorMessage(result: CaptureResult<unknown>): string {
  if (result.ok) return "";
  return result.error instanceof Error
    ? result.error.message
    : String(result.error);
}

// NOTE: The detailed file-size logic is now covered by fast in-memory tests in
// `src/test/ts/api/selfhost_lint_file_size.test.ts`.
//
// This legacy suite is intentionally skipped to avoid staging a stage2 compiler
// + filesystem for many cases.
describe.skip("selfhost file size linting (500 line limit)", () => {
  test("errors when file exceeds 500 lines", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-file-size",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    // Enable file size linting as error (severity = 2)
    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify(
        { fluff: { maxFileLines: "error", maxFileLinesThreshold: 500 } },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const inFile = resolve(stage2Dir, "large_file.tuff");

    // Generate a file with 501 lines (exceeds 500)
    const lines: string[] = [];
    lines.push("out fn run() : I32 => {");
    for (let i = 0; i < 498; i++) {
      lines.push(`  // line ${i + 2}`);
    }
    lines.push("  0");
    lines.push("}");
    // Total: 501 lines

    await writeFile(inFile, lines.join("\n") + "\n", "utf8");

    const result = captureStdout(() => fluff2.run([inFile]));

    // Should report an error for exceeding 500 lines (thrown as exception)
    expect(result.ok).toBe(false);
    const msg = getErrorMessage(result);
    expect(msg).toMatch(/file has \d+ lines, exceeds limit of 500/i);
  });

  test("does not error when file is within 500 lines", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-file-size",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify(
        { fluff: { maxFileLines: "error", maxFileLinesThreshold: 500 } },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const inFile = resolve(stage2Dir, "small_file.tuff");

    // Generate a file with exactly 500 lines (within limit)
    const lines: string[] = [];
    lines.push("out fn run() : I32 => {");
    for (let i = 0; i < 497; i++) {
      lines.push(`  // line ${i + 2}`);
    }
    lines.push("  0");
    lines.push("}");
    // Total: 500 lines

    await writeFile(inFile, lines.join("\n") + "\n", "utf8");

    const result = captureStdout(() => fluff2.run([inFile]));

    // Should succeed without file size error
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
  });

  test("default threshold is 500 lines", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-file-size",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    // Enable maxFileLines without specifying threshold
    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify({ fluff: { maxFileLines: "error" } }, null, 2) + "\n",
      "utf8"
    );

    const inFile = resolve(stage2Dir, "default_threshold.tuff");

    // Generate a file with 501 lines (exceeds default 500)
    const lines: string[] = [];
    lines.push("out fn run() : I32 => {");
    for (let i = 0; i < 498; i++) {
      lines.push(`  // line ${i + 2}`);
    }
    lines.push("  0");
    lines.push("}");

    await writeFile(inFile, lines.join("\n") + "\n", "utf8");

    const result = captureStdout(() => fluff2.run([inFile]));

    // Should error with default threshold of 500
    expect(result.ok).toBe(false);
    const msg = getErrorMessage(result);
    expect(msg).toMatch(/error/i);
  });

  test("can configure custom threshold", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-file-size",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    // Set a very low threshold of 10 lines
    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify(
        { fluff: { maxFileLines: "error", maxFileLinesThreshold: 10 } },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const inFile = resolve(stage2Dir, "custom_threshold.tuff");

    // Generate a file with 11 lines (exceeds 10)
    await writeFile(
      inFile,
      [
        "out fn run() : I32 => {",
        "  // line 2",
        "  // line 3",
        "  // line 4",
        "  // line 5",
        "  // line 6",
        "  // line 7",
        "  // line 8",
        "  // line 9",
        "  // line 10",
        "  0",
        "}",
      ].join("\n") + "\n",
      "utf8"
    );

    const result = captureStdout(() => fluff2.run([inFile]));

    expect(result.ok).toBe(false);
    const msg = getErrorMessage(result);
    expect(msg).toMatch(/exceeds limit of 10/i);
  });

  test("rule is off by default", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-file-size",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    // No maxFileLines config at all
    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify({ fluff: {} }, null, 2) + "\n",
      "utf8"
    );

    const inFile = resolve(stage2Dir, "no_rule.tuff");

    // Generate a file with 501 lines
    const lines: string[] = [];
    lines.push("out fn run() : I32 => {");
    for (let i = 0; i < 498; i++) {
      lines.push(`  // line ${i + 2}`);
    }
    lines.push("  0");
    lines.push("}");

    await writeFile(inFile, lines.join("\n") + "\n", "utf8");

    const result = captureStdout(() => fluff2.run([inFile]));

    // Should succeed when rule is off
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
  });

  test("reports line count and threshold in error message", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-file-size",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify(
        { fluff: { maxFileLines: "error", maxFileLinesThreshold: 100 } },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const inFile = resolve(stage2Dir, "report_counts.tuff");

    // Generate a file with 150 lines
    const lines: string[] = [];
    lines.push("out fn run() : I32 => {");
    for (let i = 0; i < 147; i++) {
      lines.push(`  // line ${i + 2}`);
    }
    lines.push("  0");
    lines.push("}");

    await writeFile(inFile, lines.join("\n") + "\n", "utf8");

    const result = captureStdout(() => fluff2.run([inFile]));

    expect(result.ok).toBe(false);
    const msg = getErrorMessage(result);
    // Should mention the actual line count (150) and threshold (100)
    expect(msg).toMatch(/150/);
    expect(msg).toMatch(/100/);
  });

  test("checks all files in module graph", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-file-size",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify(
        { fluff: { maxFileLines: "error", maxFileLinesThreshold: 10 } },
        null,
        2
      ) + "\n",
      "utf8"
    );

    // Create a submodule directory
    await mkdir(resolve(stage2Dir, "submod"), { recursive: true });

    // Main file is small (within limit)
    const mainFile = resolve(stage2Dir, "main_small.tuff");
    await writeFile(
      mainFile,
      [
        "from submod::large use { helper };",
        "",
        "out fn run() : I32 => helper()",
        "",
      ].join("\n"),
      "utf8"
    );

    // Submodule file is large (exceeds limit)
    const subFile = resolve(stage2Dir, "submod", "large.tuff");
    const lines: string[] = [];
    lines.push("out fn helper() : I32 => {");
    for (let i = 0; i < 10; i++) {
      lines.push(`  // line ${i + 2}`);
    }
    lines.push("  0");
    lines.push("}");

    await writeFile(subFile, lines.join("\n") + "\n", "utf8");

    const result = captureStdout(() => fluff2.run([mainFile]));

    // Should error because submodule exceeds limit
    expect(result.ok).toBe(false);
    const msg = getErrorMessage(result);
    expect(msg).toMatch(/large\.tuff/i);
    expect(msg).toMatch(/exceeds limit/i);
  });
});
