import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname } from "node:path";

interface FluffModule {
  main: (argv: string[]) => number;
  project_error_count: () => number;
  project_warning_count: () => number;
}

function repoRootFromHere(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..");
}

function makeRepeatedProgram(repetitions: number): string {
  // The goal is many repeated AST shapes to stress clone detection.
  // Keep it syntactically small so parse/analyze are not the bottleneck.
  const parts: string[] = [];
  for (let i = 0; i < repetitions; i++) {
    parts.push(`
fn f_${i}() : I32 => {
  let a = 1;
  let b = 2;
  let c = a + b;
  let d = c * 3;
  d
}
`);
  }

  parts.push(`
fn main() : I32 => {
  let mut sum = 0;
`);
  for (let i = 0; i < repetitions; i++) {
    parts.push(`  sum = sum + f_${i}();\n`);
  }
  parts.push("  sum\n}\n");

  return parts.join("");
}

export async function main(): Promise<number> {
  const root = repoRootFromHere();
  const outDir = resolve(root, ".dist", "bench-clones", `case-${Date.now()}`);
  await mkdir(outDir, { recursive: true });

  const buildJsonPath = resolve(outDir, "build.json");
  await writeFile(
    buildJsonPath,
    JSON.stringify(
      {
        fluff: {
          cloneDetection: "warning",
          cloneMinTokens: 8,
          cloneMinOccurrences: 3,
          // Flip this on if you want to benchmark parameterized detection.
          cloneParameterized: false,
        },
      },
      null,
      2
    )
  );

  const programPath = resolve(outDir, "bench_clone_detection.tuff");
  await writeFile(programPath, makeRepeatedProgram(200));

  const fluffFile = resolve(root, "selfhost", "prebuilt", "fluff.mjs");
  const fluff = (await import(
    pathToFileURL(fluffFile).toString()
  )) as FluffModule;

  const t0 = performance.now();
  const code = fluff.run(["--format", "json", programPath]);
  const t1 = performance.now();

  const err =
    typeof fluff.project_error_count === "function"
      ? fluff.project_error_count()
      : 0;
  const warn =
    typeof fluff.project_warning_count === "function"
      ? fluff.project_warning_count()
      : 0;

  console.log(
    JSON.stringify(
      {
        exitCode: code,
        errors: err,
        warnings: warn,
        elapsedMs: Math.round((t1 - t0) * 1000) / 1000,
        outDir,
        programPath,
      },
      null,
      2
    )
  );

  return code;
}

if (
  process.argv[1] &&
  process.argv[1]
    .replaceAll("\\", "/")
    .endsWith("tools/bench_clone_detection.ts")
) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    });
}
