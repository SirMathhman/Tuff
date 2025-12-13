import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

async function writeRuntime(outDir: string) {
  const rtDir = resolve(outDir, "rt");
  await mkdir(rtDir, { recursive: true });
  await copyFile(resolve("rt/stdlib.mjs"), resolve(rtDir, "stdlib.mjs"));
  await copyFile(resolve("rt/vec.mjs"), resolve(rtDir, "vec.mjs"));
}

async function writeStdSources(outDir: string) {
  const stdDir = resolve(outDir, "std");
  await mkdir(stdDir, { recursive: true });

  // Stage all stdlib sources so tests can import new modules like std::iter.
  const repoStdDir = resolve("src", "main", "tuff", "std");

  async function walkAndCopyTuffSources(
    srcDir: string,
    dstDir: string
  ): Promise<void> {
    const entries = await readdir(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = join(srcDir, entry.name);
      const dstPath = join(dstDir, entry.name);
      if (entry.isDirectory()) {
        await walkAndCopyTuffSources(srcPath, dstPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".tuff")) {
        await mkdir(dirname(dstPath), { recursive: true });
        await copyFile(srcPath, dstPath);
      }
    }
  }

  await walkAndCopyTuffSources(repoStdDir, stdDir);

  // The selfhost compiler currently emits rt extern imports as "./rt/<mod>.mjs".
  // When std modules compile to outDir/std/*.mjs, those imports must resolve from
  // within the std directory.
  const stdRtDir = resolve(stdDir, "rt");
  await mkdir(stdRtDir, { recursive: true });
  await copyFile(resolve("rt/stdlib.mjs"), resolve(stdRtDir, "stdlib.mjs"));
  await copyFile(resolve("rt/vec.mjs"), resolve(stdRtDir, "vec.mjs"));
}

async function writeCompilerSources(outDir: string) {
  // Stage compiler sources so .tuff tests can import them.
  // We mirror the repo-relative path inside outDir.
  const repoCompilerDir = resolve("src", "main", "tuff", "compiler");
  const stagedCompilerDir = resolve(outDir, "src", "main", "tuff", "compiler");

  async function walkAndCopyTuffSources(
    srcDir: string,
    dstDir: string
  ): Promise<void> {
    const entries = await readdir(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = join(srcDir, entry.name);
      const dstPath = join(dstDir, entry.name);
      if (entry.isDirectory()) {
        await walkAndCopyTuffSources(srcPath, dstPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".tuff")) {
        await mkdir(dirname(dstPath), { recursive: true });
        await copyFile(srcPath, dstPath);
      }
    }
  }

  await mkdir(stagedCompilerDir, { recursive: true });
  await walkAndCopyTuffSources(repoCompilerDir, stagedCompilerDir);

  // The selfhost compiler currently emits rt extern imports as "./rt/<mod>.mjs".
  // If a module compiles into outDir/src/main/tuff/compiler/*.mjs, those imports
  // must resolve from within that directory.
  const compilerRtDir = resolve(stagedCompilerDir, "rt");
  await mkdir(compilerRtDir, { recursive: true });
  await copyFile(
    resolve("rt/stdlib.mjs"),
    resolve(compilerRtDir, "stdlib.mjs")
  );
  await copyFile(resolve("rt/vec.mjs"), resolve(compilerRtDir, "vec.mjs"));
}

export async function stagePrebuiltSelfhostCompiler(
  outDir: string,
  options?: { includeStd?: boolean; includeCompilerSources?: boolean }
) {
  const prebuiltDir = resolve("selfhost", "prebuilt");

  await mkdir(outDir, { recursive: true });
  await writeRuntime(outDir);
  if (options?.includeStd) {
    await writeStdSources(outDir);
  }
  if (options?.includeCompilerSources) {
    await writeCompilerSources(outDir);
  }

  // Copy all prebuilt compiler modules, recursively preserving directory structure.
  async function copyRecursively(srcDir: string, dstDir: string) {
    const entries = await readdir(srcDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name === "rt") continue; // rt/ is handled separately
      const srcPath = join(srcDir, ent.name);
      const dstPath = join(dstDir, ent.name);
      if (ent.isDirectory()) {
        await mkdir(dstPath, { recursive: true });
        await copyRecursively(srcPath, dstPath);
      } else if (ent.isFile() && ent.name.endsWith(".mjs")) {
        await copyFile(srcPath, dstPath);
      }
    }
  }

  await copyRecursively(prebuiltDir, outDir);

  return {
    entryFile: resolve(outDir, "tuffc.mjs"),
    libFile: resolve(outDir, "tuffc_lib.mjs"),
  };
}
