import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

async function writeRuntime(outDir: string) {
  const rtDir = resolve(outDir, "rt");
  await mkdir(rtDir, { recursive: true });
  await copyFile(resolve("rt/stdlib.mjs"), resolve(rtDir, "stdlib.mjs"));
  await copyFile(resolve("rt/vec.mjs"), resolve(rtDir, "vec.mjs"));
}

export async function stagePrebuiltSelfhostCompiler(outDir: string) {
  const prebuiltDir = resolve("selfhost", "prebuilt");

  await mkdir(outDir, { recursive: true });
  await writeRuntime(outDir);

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
