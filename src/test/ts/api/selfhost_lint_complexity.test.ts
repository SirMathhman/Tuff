import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { lintCode, setFluffComplexityOptions } from "../compiler_api_wrapper";

describe("selfhost cyclomatic complexity linting (in-memory)", () => {
  beforeEach(async () => {
    // warning severity
    await setFluffComplexityOptions(1, 3);
  });

  afterEach(async () => {
    // reset to off
    await setFluffComplexityOptions(0, 0);
  });

  test("warns when function complexity exceeds threshold", async () => {
    // Cyclomatic complexity = 1 (base) + 3 (if) + 1 (&&) = 5 > 3
    const entryCode = [
      "fn complex_fn(a: I32, b: I32, c: I32, d: I32) : I32 => {",
      "  if (a > 0) { yield 1; }",
      "  if (b > 0) { yield 2; }",
      "  if (c > 0 && d > 0) { yield 3; }",
      "  0",
      "}",
      "",
      "out fn run() : I32 => complex_fn(1, 2, 3, 4)",
      "",
    ].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.diagnostics ?? "").toBe("");
    expect(r.success).toBe(true);

    const warnText = (r.warnings ?? []).map((w) => w.msg).join("\n");
    expect(warnText).toMatch(/cyclomatic complexity/i);
    expect(warnText).toMatch(/complex_fn/);
  });

  test("does not warn when complexity is within threshold", async () => {
    await setFluffComplexityOptions(1, 10);

    // Cyclomatic complexity = 1 + 1 (if) = 2
    const entryCode = [
      "fn simple_fn(a: I32) : I32 => {",
      "  if (a > 0) { yield 1; }",
      "  0",
      "}",
      "",
      "out fn run() : I32 => simple_fn(1)",
      "",
    ].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.diagnostics ?? "").toBe("");
    expect(r.success).toBe(true);
    const warnText = (r.warnings ?? []).map((w) => w.msg).join("\n");
    expect(warnText).not.toMatch(/cyclomatic complexity/i);
  });

  test("counts while loops in complexity", async () => {
    await setFluffComplexityOptions(1, 2);

    // Cyclomatic complexity = 1 + 2 (while) = 3 > 2
    const entryCode = [
      "fn loop_fn() : I32 => {",
      "  let mut i = 0;",
      "  while (i < 10) { i = i + 1; }",
      "  while (i > 0) { i = i - 1; }",
      "  i",
      "}",
      "",
      "out fn run() : I32 => loop_fn()",
      "",
    ].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.diagnostics ?? "").toBe("");
    expect(r.success).toBe(true);
    const warnText = (r.warnings ?? []).map((w) => w.msg).join("\n");
    expect(warnText).toMatch(/cyclomatic complexity/i);
    expect(warnText).toMatch(/loop_fn/);
  });

  test("counts match arms in complexity (arms - 1)", async () => {
    await setFluffComplexityOptions(1, 2);

    // Cyclomatic complexity = 1 + 3 (match arms 4 => +3) = 4 > 2
    const entryCode = [
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
    ].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.diagnostics ?? "").toBe("");
    expect(r.success).toBe(true);
    const warnText = (r.warnings ?? []).map((w) => w.msg).join("\n");
    expect(warnText).toMatch(/cyclomatic complexity/i);
    expect(warnText).toMatch(/branchy_fn/);
  });

  test("counts logical operators (&&, ||) in complexity", async () => {
    await setFluffComplexityOptions(1, 2);

    // Cyclomatic complexity = 1 + 1 (if) + 2 (&&, ||) = 4 > 2
    const entryCode = [
      "fn logical_fn(a: I32, b: I32, c: I32) : I32 => {",
      "  if (a > 0 && b > 0 || c > 0) { yield 1; }",
      "  0",
      "}",
      "",
      "out fn run() : I32 => logical_fn(1, 2, 3)",
      "",
    ].join("\n");

    const r = await lintCode(entryCode, {});
    expect(r.diagnostics ?? "").toBe("");
    expect(r.success).toBe(true);
    const warnText = (r.warnings ?? []).map((w) => w.msg).join("\n");
    expect(warnText).toMatch(/cyclomatic complexity/i);
    expect(warnText).toMatch(/logical_fn/);
  });
});
