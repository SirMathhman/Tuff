import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

async function exists(p: string) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function writeRuntime(outDir: string) {
  const rtDir = resolve(outDir, "rt");
  await mkdir(rtDir, { recursive: true });
  await copyFile(resolve("rt/stdlib.mjs"), resolve(rtDir, "stdlib.mjs"));
  await copyFile(resolve("rt/vec.mjs"), resolve(rtDir, "vec.mjs"));
}

async function copyPrebuiltRecursively(srcDir: string, dstDir: string) {
  // Copy all .mjs files from prebuilt, preserving directory structure
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const ent of entries) {
    const srcPath = resolve(srcDir, ent.name);
    const dstPath = resolve(dstDir, ent.name);
    if (ent.isDirectory() && ent.name !== "rt") {
      // Skip rt; it's handled separately
      await mkdir(dstPath, { recursive: true });
      await copyPrebuiltRecursively(srcPath, dstPath);
    } else if (ent.isFile() && ent.name.endsWith(".mjs")) {
      await copyFile(srcPath, dstPath);
    }
  }
}

async function copyTopLevelMjsFiles(srcDir: string, dstDir: string) {
  // Copy all emitted compiler modules, preserving directory structure from prebuilt/
  await copyPrebuiltRecursively(srcDir, dstDir);
}

async function stagePrebuiltCompiler(intoDir: string) {
  const prebuiltDir = resolve("selfhost", "prebuilt");
  const entrySrc = resolve(prebuiltDir, "tuffc.mjs");
  const libSrc = resolve(prebuiltDir, "tuffc_lib.mjs");
  if (!(await exists(entrySrc)) || !(await exists(libSrc))) {
    throw new Error(
      `missing prebuilt compiler at ${prebuiltDir}. Run this script once while the bootstrap compiler still exists.`
    );
  }

  await mkdir(intoDir, { recursive: true });
  await writeRuntime(intoDir);
  await copyTopLevelMjsFiles(prebuiltDir, intoDir);

  return resolve(intoDir, "tuffc.mjs");
}

async function collectTuffFiles(
  dir: string,
  baseDir: string
): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const fullPath = resolve(dir, ent.name);
    if (ent.isDirectory()) {
      files.push(...(await collectTuffFiles(fullPath, baseDir)));
    } else if (ent.isFile() && ent.name.endsWith(".tuff")) {
      files.push(fullPath);
    }
  }
  return files;
}

async function bootstrapCompileSelfhost(intoDir: string) {
  // Dynamically import the bootstrap compiler so this script can keep working
  // after bootstrap removal, as long as `selfhost/prebuilt` already exists.
  const { compileToESM } = (await import(
    "../src/index"
  )) as typeof import("../src/index");

  await mkdir(intoDir, { recursive: true });
  await writeRuntime(intoDir);

  const selfhostDir = resolve("src", "main", "tuff", "compiler");
  const allTuffFiles = await collectTuffFiles(selfhostDir, selfhostDir);

  for (const filePath of allTuffFiles) {
    const source = await readFile(filePath, "utf8");
    const { js, diagnostics } = compileToESM({ filePath, source });
    const errors = diagnostics.filter((d) => d.severity === "error");
    if (errors.length) {
      throw new Error(
        [
          `bootstrap compiler failed to compile ${filePath}:`,
          ...errors.map(
            (e) =>
              `${e.span?.filePath ?? ""}:${e.span?.line ?? "?"}:${
                e.span?.col ?? "?"
              } ${e.message}`
          ),
        ].join("\n")
      );
    }

    // Preserve directory structure: e.g., parsing/primitives.tuff -> parsing/primitives.mjs
    const relPath = resolve(filePath).substring(
      resolve(selfhostDir).length + 1
    );
    const outFile = resolve(intoDir, relPath.replace(/\.tuff$/, ".mjs"));
    await mkdir(resolve(outFile, ".."), { recursive: true });
    await writeFile(outFile, js, "utf8");
  }

  return resolve(intoDir, "tuffc.mjs");
}

async function runCompiler(
  entryFile: string,
  inputTuff: string,
  outDir: string,
  outEntryName = "tuffc.mjs"
) {
  await mkdir(outDir, { recursive: true });
  await writeRuntime(outDir);

  const outFile = resolve(outDir, outEntryName);

  const mod = (await import(pathToFileURL(entryFile).toString())) as any;
  if (typeof mod.run !== "function") {
    throw new Error(`expected compiler module to export run(): ${entryFile}`);
  }

  const rc = mod.run([inputTuff, outFile]);
  if (rc !== 0) {
    throw new Error(`compiler returned nonzero exit code ${rc}`);
  }

  return {
    entry: outFile,
    lib: resolve(outDir, "tuffc_lib.mjs"),
  };
}

async function main() {
  const buildRoot = resolve(
    ".dist",
    "selfhost-prebuilt-build",
    `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );

  const stage1Dir = resolve(buildRoot, "stage1");
  const stage2Dir = resolve(buildRoot, "stage2");
  const stage3Dir = resolve(buildRoot, "stage3");
  const stage4Dir = resolve(buildRoot, "stage4");

  const prebuiltDir = resolve("selfhost", "prebuilt");
  const hasPrebuilt =
    (await exists(resolve(prebuiltDir, "tuffc.mjs"))) &&
    (await exists(resolve(prebuiltDir, "tuffc_lib.mjs")));

  const stage1Entry = hasPrebuilt
    ? await stagePrebuiltCompiler(stage1Dir)
    : await bootstrapCompileSelfhost(stage1Dir);

  const inputTuffc = resolve("src", "main", "tuff", "compiler", "tuffc.tuff");
  const inputFluff = resolve("src", "main", "tuff", "compiler", "fluff.tuff");

  const s2 = await runCompiler(stage1Entry, inputTuffc, stage2Dir, "tuffc.mjs");
  const s3 = await runCompiler(s2.entry, inputTuffc, stage3Dir, "tuffc.mjs");
  const s4 = await runCompiler(s3.entry, inputTuffc, stage4Dir, "tuffc.mjs");

  const s3Entry = await readFile(s3.entry, "utf8");
  const s4Entry = await readFile(s4.entry, "utf8");
  if (s3Entry !== s4Entry) {
    throw new Error(
      "selfhost did not reach a fixed point for tuffc.mjs (stage3 != stage4)"
    );
  }

  const s3Lib = await readFile(s3.lib, "utf8");
  const s4Lib = await readFile(s4.lib, "utf8");
  if (s3Lib !== s4Lib) {
    throw new Error(
      "selfhost did not reach a fixed point for tuffc_lib.mjs (stage3 != stage4)"
    );
  }

  // Also compile Fluff and ensure it is stable.
  const s3Fluff = await runCompiler(
    s3.entry,
    inputFluff,
    stage3Dir,
    "fluff.mjs"
  );
  const s4Fluff = await runCompiler(
    s4.entry,
    inputFluff,
    stage4Dir,
    "fluff.mjs"
  );

  const s3FluffEntry = await readFile(s3Fluff.entry, "utf8");
  const s4FluffEntry = await readFile(s4Fluff.entry, "utf8");
  if (s3FluffEntry !== s4FluffEntry) {
    throw new Error(
      "selfhost did not reach a fixed point for fluff.mjs (stage3 != stage4)"
    );
  }

  await mkdir(prebuiltDir, { recursive: true });
  await writeRuntime(prebuiltDir);
  await copyTopLevelMjsFiles(stage4Dir, prebuiltDir);

  console.log(`wrote prebuilt compiler to ${prebuiltDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
