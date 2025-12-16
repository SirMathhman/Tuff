import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

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

  // Also stage tools sources so tests can import tools like ebnf_parser.
  const repoToolsDir = resolve("src", "main", "tuff", "tools");
  const stagedToolsDir = resolve(outDir, "src", "main", "tuff", "tools");
  await mkdir(stagedToolsDir, { recursive: true });
  await walkAndCopyTuffSources(repoToolsDir, stagedToolsDir);

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

  // Also add rt to tools directory
  const toolsRtDir = resolve(stagedToolsDir, "rt");
  await mkdir(toolsRtDir, { recursive: true });
  await copyFile(resolve("rt/stdlib.mjs"), resolve(toolsRtDir, "stdlib.mjs"));
  await copyFile(resolve("rt/vec.mjs"), resolve(toolsRtDir, "vec.mjs"));
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

export async function buildStage2SelfhostCompiler(outDir: string): Promise<{
  stage1Dir: string;
  stage2Dir: string;
  stage1File: string;
  stage2File: string;
  stage2FluffFile: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tuffc2: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fluff2: any;
}> {
  await mkdir(outDir, { recursive: true });

  const stage1Dir = resolve(outDir, "stage1");
  const stage2Dir = resolve(outDir, "stage2");
  await mkdir(stage1Dir, { recursive: true });
  await mkdir(stage2Dir, { recursive: true });

  const { entryFile: stage1File } = await stagePrebuiltSelfhostCompiler(
    stage1Dir
  );

  // runtime for stage2 output
  await writeRuntime(stage2Dir);

  const stage2In = resolve("src", "main", "tuff", "compiler", "tuffc.tuff");
  const stage2File = resolve(stage2Dir, "tuffc.stage2.mjs");
  const stage2FluffIn = resolve(
    "src",
    "main",
    "tuff",
    "compiler",
    "fluff.tuff"
  );
  const stage2FluffFile = resolve(stage2Dir, "fluff.stage2.mjs");

  // Build stage2 compiler using stage1 compiler.
  const tuffc1 = await import(pathToFileURL(stage1File).toString());
  const rc2 = (tuffc1 as any).main([stage2In, stage2File]);
  if (rc2 !== 0) {
    throw new Error(`stage2 compile failed with code ${rc2}`);
  }

  const rcFluff = (tuffc1 as any).main([stage2FluffIn, stage2FluffFile]);
  if (rcFluff !== 0) {
    throw new Error(`stage2 fluff compile failed with code ${rcFluff}`);
  }

  const tuffc2 = await import(pathToFileURL(stage2File).toString());
  if (typeof (tuffc2 as any).main !== "function") {
    throw new Error("stage2 compiler missing main() export");
  }

  const fluff2 = await import(pathToFileURL(stage2FluffFile).toString());
  if (typeof (fluff2 as any).main !== "function") {
    throw new Error("stage2 fluff missing main() export");
  }

  return {
    stage1Dir,
    stage2Dir,
    stage1File,
    stage2File,
    stage2FluffFile,
    tuffc2: tuffc2 as any,
    fluff2: fluff2 as any,
  };
}
