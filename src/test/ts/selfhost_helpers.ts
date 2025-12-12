import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

async function writeRuntime(outDir: string) {
  const rtDir = resolve(outDir, "rt");
  await mkdir(rtDir, { recursive: true });
  await copyFile(resolve("rt/stdlib.mjs"), resolve(rtDir, "stdlib.mjs"));
  await copyFile(resolve("rt/vec.mjs"), resolve(rtDir, "vec.mjs"));
}

async function writeStdSources(outDir: string) {
  const stdDir = resolve(outDir, "std");
  await mkdir(stdDir, { recursive: true });
  await copyFile(
    resolve("src", "main", "tuff", "std", "test.tuff"),
    resolve(stdDir, "test.tuff")
  );
  await copyFile(
    resolve("src", "main", "tuff", "std", "prelude.tuff"),
    resolve(stdDir, "prelude.tuff")
  );

  // The selfhost compiler currently emits rt extern imports as "./rt/<mod>.mjs".
  // When std modules compile to outDir/std/*.mjs, those imports must resolve from
  // within the std directory.
  const stdRtDir = resolve(stdDir, "rt");
  await mkdir(stdRtDir, { recursive: true });
  await copyFile(resolve("rt/stdlib.mjs"), resolve(stdRtDir, "stdlib.mjs"));
  await copyFile(resolve("rt/vec.mjs"), resolve(stdRtDir, "vec.mjs"));
}

export async function stagePrebuiltSelfhostCompiler(
  outDir: string,
  options?: { includeStd?: boolean }
) {
  const prebuiltDir = resolve("selfhost", "prebuilt");

  await mkdir(outDir, { recursive: true });
  await writeRuntime(outDir);
  if (options?.includeStd) {
    await writeStdSources(outDir);
  }

  await copyFile(
    resolve(prebuiltDir, "tuffc.mjs"),
    resolve(outDir, "tuffc.mjs")
  );
  await copyFile(
    resolve(prebuiltDir, "tuffc_lib.mjs"),
    resolve(outDir, "tuffc_lib.mjs")
  );

  return {
    entryFile: resolve(outDir, "tuffc.mjs"),
    libFile: resolve(outDir, "tuffc_lib.mjs"),
  };
}
