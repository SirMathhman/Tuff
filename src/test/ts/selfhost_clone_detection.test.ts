import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { stagePrebuiltSelfhostCompiler } from "./selfhost_helpers";
import { randomUUID } from "node:crypto";

describe("clone detection lint", () => {
  it("compiles with clone detection enabled in build.json", async () => {
    const testId = `case-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const baseDir = resolve(".dist/selfhost-clone-detection", testId);
    const stage1 = resolve(baseDir, "stage1");

    // Stage the prebuilt compiler
    const stage1TuffcPath = await stagePrebuiltSelfhostCompiler(stage1);

    // Create a test file with duplicated code
    const testFile = resolve(stage1, "clone_test.tuff");
    // Deliberately duplicate code patterns
    await writeFile(
      testFile,
      `
fn helper_a() : I32 => {
  let x = 1;
  let y = 2;
  let z = x + y;
  z
}

fn helper_b() : I32 => {
  let x = 1;
  let y = 2;
  let z = x + y;
  z
}

fn helper_c() : I32 => {
  let x = 1;
  let y = 2;
  let z = x + y;
  z
}

out fn run() : I32 => {
  helper_a() + helper_b() + helper_c()
}
`
    );

    // Create a build.json with clone detection enabled
    const buildJson = resolve(stage1, "build.json");
    await writeFile(
      buildJson,
      JSON.stringify({
        fluff: {
          cloneDetection: "warning",
          cloneMinTokens: 5,
          cloneMinOccurrences: 2,
        },
      })
    );

    // Import and run the fluff linter
    const fluffModule = await import(resolve(stage1, "fluff.mjs"));
    const result = fluffModule.run(["--format", "json", testFile]);

    // Should complete without crashing (return 0)
    expect(result).toBe(0);

    // And should report at least one warning when enabled.
    expect(typeof fluffModule.project_warning_count).toBe("function");
    expect(fluffModule.project_warning_count()).toBeGreaterThan(0);
  });

  it("supports --debug flag", async () => {
    const testId = `case-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const baseDir = resolve(".dist/selfhost-clone-detection", testId);
    const stage1 = resolve(baseDir, "stage-debug");

    await stagePrebuiltSelfhostCompiler(stage1);

    const testFile = resolve(stage1, "clone_test_debug.tuff");
    await writeFile(
      testFile,
      `
fn helper_a() : I32 => {
  let x = 1;
  let y = 2;
  let z = x + y;
  z
}

fn helper_b() : I32 => {
  let x = 1;
  let y = 2;
  let z = x + y;
  z
}

out fn run() : I32 => {
  helper_a() + helper_b()
}
`
    );

    const buildJson = resolve(stage1, "build.json");
    await writeFile(
      buildJson,
      JSON.stringify({
        fluff: {
          cloneDetection: "warning",
          cloneMinTokens: 5,
          cloneMinOccurrences: 2,
        },
      })
    );

    const fluffModule = await import(resolve(stage1, "fluff.mjs"));
    const result = fluffModule.run(["--debug", "--format", "json", testFile]);
    expect(result).toBe(0);
  });

  it("supports scoped --debug=clone", async () => {
    const testId = `case-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const baseDir = resolve(".dist/selfhost-clone-detection", testId);
    const stage1 = resolve(baseDir, "stage-debug-scoped");

    await stagePrebuiltSelfhostCompiler(stage1);

    const testFile = resolve(stage1, "clone_test_debug_scoped.tuff");
    await writeFile(
      testFile,
      `
fn helper_a() : I32 => { let x = 1; let y = 2; let z = x + y; z }
fn helper_b() : I32 => { let x = 1; let y = 2; let z = x + y; z }
out fn run() : I32 => helper_a() + helper_b()
`
    );

    const buildJson = resolve(stage1, "build.json");
    await writeFile(
      buildJson,
      JSON.stringify({
        fluff: {
          cloneDetection: "warning",
          cloneMinTokens: 5,
          cloneMinOccurrences: 2,
        },
      })
    );

    const fluffModule = await import(resolve(stage1, "fluff.mjs"));
    const result = fluffModule.run([
      "--debug=clone",
      "--format",
      "json",
      testFile,
    ]);
    expect(result).toBe(0);
  });

  it("accepts build.json cloneParameterized flag", async () => {
    const testId = `case-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const baseDir = resolve(".dist/selfhost-clone-detection", testId);
    const stage1 = resolve(baseDir, "stage-parameterized");

    await stagePrebuiltSelfhostCompiler(stage1);

    const testFile = resolve(stage1, "clone_test_param.tuff");
    await writeFile(
      testFile,
      `
fn helper_a() : I32 => { let x = 1; let y = 2; let z = x + y; z }
fn helper_b() : I32 => { let x = 3; let y = 4; let z = x + y; z }
out fn run() : I32 => helper_a() + helper_b()
`
    );

    const buildJson = resolve(stage1, "build.json");
    await writeFile(
      buildJson,
      JSON.stringify({
        fluff: {
          cloneDetection: "warning",
          cloneMinTokens: 5,
          cloneMinOccurrences: 2,
          cloneParameterized: true,
        },
      })
    );

    const fluffModule = await import(resolve(stage1, "fluff.mjs"));
    const result = fluffModule.run(["--format", "json", testFile]);
    expect(result).toBe(0);
  });

  it("clone detection is disabled by default", async () => {
    const testId = `case-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const baseDir = resolve(".dist/selfhost-clone-detection", testId);
    const stage1 = resolve(baseDir, "stage2");

    // Stage the prebuilt compiler
    const stage1TuffcPath = await stagePrebuiltSelfhostCompiler(stage1);

    // Create a test file with duplicated code
    const testFile = resolve(stage1, "clone_test_off.tuff");
    await writeFile(
      testFile,
      `
fn dup_a() : I32 => {
  let x = 1;
  let y = 2;
  x + y
}

fn dup_b() : I32 => {
  let x = 1;
  let y = 2;
  x + y
}

out fn run() : I32 => {
  dup_a() + dup_b()
}
`
    );

    // Create a build.json with clone detection OFF (default)
    const buildJson = resolve(stage1, "build.json");
    await writeFile(
      buildJson,
      JSON.stringify({
        fluff: {
          cloneDetection: "off",
        },
      })
    );

    // Import and run the fluff linter
    const fluffModule = await import(resolve(stage1, "fluff.mjs"));
    const result = fluffModule.run(["--format", "json", testFile]);

    // Should pass with no issues
    expect(result).toBe(0);

    expect(typeof fluffModule.project_warning_count).toBe("function");
    expect(fluffModule.project_warning_count()).toBe(0);
  });
});
