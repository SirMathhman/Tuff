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

// NOTE: The detailed complexity logic is now covered by fast in-memory tests in
// `src/test/ts/api/selfhost_lint_complexity.test.ts`.
//
// This legacy suite is intentionally skipped to avoid the cost of staging a
// stage2 compiler + filesystem for dozens of cases.
describe.skip("selfhost cyclomatic complexity linting", () => {
  test("warns when function complexity exceeds threshold", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-complexity",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify(
        { fluff: { complexity: "warning", complexityThreshold: 3 } },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const inFile = resolve(stage2Dir, "high_complexity.tuff");

    // Cyclomatic complexity = 1 (base) + 3 (if) + 1 (&&) = 5, exceeds threshold of 3
    await writeFile(
      inFile,
      [
        "fn complex_fn(a: I32, b: I32, c: I32, d: I32) : I32 => {",
        "  if (a > 0) { yield 1; }",
        "  if (b > 0) { yield 2; }",
        "  if (c > 0 && d > 0) { yield 3; }",
        "  0",
        "}",
        "",
        "out fn run() : I32 => complex_fn(1, 2, 3, 4)",
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

  test("does not warn when complexity is within threshold", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-complexity",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify(
        { fluff: { complexity: "warning", complexityThreshold: 10 } },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const inFile = resolve(stage2Dir, "low_complexity.tuff");

    // Cyclomatic complexity = 1 (base) + 1 (if) = 2, within threshold
    await writeFile(
      inFile,
      [
        "fn simple_fn(a: I32) : I32 => {",
        "  if (a > 0) { yield 1; }",
        "  0",
        "}",
        "",
        "out fn run() : I32 => simple_fn(1)",
        "",
      ].join("\n"),
      "utf8"
    );

    const { value: rc, out } = captureStdout(() => fluff2.run([inFile]));
    expect(rc).toBe(0);

    expect(out).not.toMatch(/cyclomatic complexity/i);
  });

  test("counts while loops in complexity", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-complexity",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify(
        { fluff: { complexity: "warning", complexityThreshold: 2 } },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const inFile = resolve(stage2Dir, "while_complexity.tuff");

    // Cyclomatic complexity = 1 (base) + 2 (while) = 3, exceeds threshold of 2
    await writeFile(
      inFile,
      [
        "fn loop_fn() : I32 => {",
        "  let mut i = 0;",
        "  while (i < 10) { i = i + 1; }",
        "  while (i > 0) { i = i - 1; }",
        "  i",
        "}",
        "",
        "out fn run() : I32 => loop_fn()",
        "",
      ].join("\n"),
      "utf8"
    );

    const { value: rc, out } = captureStdout(() => fluff2.run([inFile]));
    expect(rc).toBe(0);

    expect(out).toMatch(/warning/i);
    expect(out).toMatch(/cyclomatic complexity/i);
    expect(out).toMatch(/loop_fn/);
  });

  test("counts match arms in complexity (arms - 1)", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-complexity",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify(
        { fluff: { complexity: "warning", complexityThreshold: 2 } },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const inFile = resolve(stage2Dir, "match_complexity.tuff");

    // Cyclomatic complexity = 1 (base) + 3 (match with 4 arms => 3 branches) = 4, exceeds threshold of 2
    await writeFile(
      inFile,
      [
        "fn branchy_fn(x: I32) : I32 => {",
        "  match (x) {",
        "    0 => { yield 0; }",
        "    1 => { yield 1; }",
        "    2 => { yield 2; }",
        "    _ => { yield 3; }",
        "  }",
        "  0",
        "}",
        "",
        "out fn run() : I32 => branchy_fn(1)",
        "",
      ].join("\n"),
      "utf8"
    );

    const { value: rc, out } = captureStdout(() => fluff2.run([inFile]));
    expect(rc).toBe(0);

    expect(out).toMatch(/warning/i);
    expect(out).toMatch(/cyclomatic complexity/i);
    expect(out).toMatch(/branchy_fn/);
  });

  test("counts logical operators (&&, ||) in complexity", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-complexity",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify(
        { fluff: { complexity: "warning", complexityThreshold: 2 } },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const inFile = resolve(stage2Dir, "logical_complexity.tuff");

    // Cyclomatic complexity = 1 (base) + 1 (if) + 2 (&&, ||) = 4, exceeds threshold of 2
    await writeFile(
      inFile,
      [
        "fn logical_fn(a: Bool, b: Bool, c: Bool) : I32 => {",
        "  if (a && b || c) { yield 1; }",
        "  0",
        "}",
        "",
        "out fn run() : I32 => logical_fn(true, false, true)",
        "",
      ].join("\n"),
      "utf8"
    );

    const { value: rc, out } = captureStdout(() => fluff2.run([inFile]));
    expect(rc).toBe(0);

    expect(out).toMatch(/warning/i);
    expect(out).toMatch(/cyclomatic complexity/i);
    expect(out).toMatch(/logical_fn/);
  });

  test("inner functions are counted independently", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-complexity",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify(
        { fluff: { complexity: "warning", complexityThreshold: 2 } },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const inFile = resolve(stage2Dir, "inner_fn_complexity.tuff");

    // Outer function: complexity = 1 (base), within threshold
    // Inner function: complexity = 1 (base) + 2 (if) = 3, exceeds threshold
    await writeFile(
      inFile,
      [
        "fn outer() : I32 => {",
        "  fn inner(x: I32) : I32 => {",
        "    if (x > 0) { yield 1; }",
        "    if (x < 0) { yield -1; }",
        "    0",
        "  };",
        "  inner(5)",
        "}",
        "",
        "out fn run() : I32 => outer()",
        "",
      ].join("\n"),
      "utf8"
    );

    const { value: rc, out } = captureStdout(() => fluff2.run([inFile]));
    expect(rc).toBe(0);

    // Should warn for inner, not for outer
    expect(out).toMatch(/warning/i);
    expect(out).toMatch(/cyclomatic complexity/i);
    expect(out).toMatch(/inner/);
    expect(out).not.toMatch(/outer.*cyclomatic complexity/i);
  });

  test("default threshold is 15", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-complexity",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    // Enable complexity warning without specifying threshold
    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify({ fluff: { complexity: "warning" } }, null, 2) + "\n",
      "utf8"
    );

    const inFile = resolve(stage2Dir, "default_threshold.tuff");

    // Function with CC = 10, should not trigger warning with default threshold of 15
    await writeFile(
      inFile,
      [
        "fn medium_fn(a: I32, b: I32, c: I32, d: I32, e: I32, f: I32, g: I32, h: I32, i: I32) : I32 => {",
        "  if (a > 0) { yield 1; }",
        "  if (b > 0) { yield 2; }",
        "  if (c > 0) { yield 3; }",
        "  if (d > 0) { yield 4; }",
        "  if (e > 0) { yield 5; }",
        "  if (f > 0) { yield 6; }",
        "  if (g > 0) { yield 7; }",
        "  if (h > 0) { yield 8; }",
        "  if (i > 0) { yield 9; }",
        "  0",
        "}",
        "",
        "out fn run() : I32 => medium_fn(1, 2, 3, 4, 5, 6, 7, 8, 9)",
        "",
      ].join("\n"),
      "utf8"
    );

    const { value: rc, out } = captureStdout(() => fluff2.run([inFile]));
    expect(rc).toBe(0);

    // CC = 1 + 9 = 10, should not warn with default threshold 15
    expect(out).not.toMatch(/cyclomatic complexity/i);
  });

  test("reports actual complexity value in warning", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-complexity",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify(
        { fluff: { complexity: "warning", complexityThreshold: 2 } },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const inFile = resolve(stage2Dir, "report_value.tuff");

    // CC = 1 + 3 = 4
    await writeFile(
      inFile,
      [
        "fn fn_with_cc_4(a: I32, b: I32, c: I32) : I32 => {",
        "  if (a > 0) { yield 1; }",
        "  if (b > 0) { yield 2; }",
        "  if (c > 0) { yield 3; }",
        "  0",
        "}",
        "",
        "out fn run() : I32 => fn_with_cc_4(1, 2, 3)",
        "",
      ].join("\n"),
      "utf8"
    );

    const { value: rc, out } = captureStdout(() => fluff2.run([inFile]));
    expect(rc).toBe(0);

    // Should mention the actual complexity value (4) and threshold (2)
    expect(out).toMatch(/4/);
    expect(out).toMatch(/2/);
  });

  test("complexity rule can be disabled", async () => {
    const outDir = resolve(
      ".dist",
      "selfhost-lint-complexity",
      `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    const { stage2Dir, fluff2 } = await buildStage2SelfhostCompiler(outDir);

    await writeFile(
      resolve(stage2Dir, "build.json"),
      JSON.stringify(
        { fluff: { complexity: "off", complexityThreshold: 2 } },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const inFile = resolve(stage2Dir, "disabled_complexity.tuff");

    // High complexity function
    await writeFile(
      inFile,
      [
        "fn high_cc(a: I32, b: I32, c: I32) : I32 => {",
        "  if (a > 0) { yield 1; }",
        "  if (b > 0) { yield 2; }",
        "  if (c > 0) { yield 3; }",
        "  0",
        "}",
        "",
        "out fn run() : I32 => high_cc(1, 2, 3)",
        "",
      ].join("\n"),
      "utf8"
    );

    const { value: rc, out } = captureStdout(() => fluff2.run([inFile]));
    expect(rc).toBe(0);

    // Should not warn when disabled
    expect(out).not.toMatch(/cyclomatic complexity/i);
  });
});
