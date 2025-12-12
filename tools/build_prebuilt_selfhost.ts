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
  await copyFile(entrySrc, resolve(intoDir, "tuffc.mjs"));
  await copyFile(libSrc, resolve(intoDir, "tuffc_lib.mjs"));

  return resolve(intoDir, "tuffc.mjs");
}

async function bootstrapCompileSelfhost(intoDir: string) {
  // Dynamically import the bootstrap compiler so this script can keep working
  // after bootstrap removal, as long as `selfhost/prebuilt` already exists.
  const { compileToESM } = (await import(
    "../src/index"
  )) as typeof import("../src/index");

  await mkdir(intoDir, { recursive: true });
  await writeRuntime(intoDir);

  const selfhostDir = resolve("selfhost");
  const entries = await readdir(selfhostDir, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (!ent.name.endsWith(".tuff")) continue;

    const filePath = resolve(selfhostDir, ent.name);
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

    const outFile = resolve(intoDir, ent.name.replace(/\.tuff$/, ".mjs"));
    await writeFile(outFile, js, "utf8");
  }

  return resolve(intoDir, "tuffc.mjs");
}

async function runCompiler(
  entryFile: string,
  inputTuff: string,
  outDir: string
) {
  await mkdir(outDir, { recursive: true });
  await writeRuntime(outDir);

  const outFile = resolve(outDir, "tuffc.mjs");

  const mod = (await import(pathToFileURL(entryFile).toString())) as any;
  if (typeof mod.main !== "function") {
    throw new Error(`expected compiler module to export main(): ${entryFile}`);
  }

  const rc = mod.main([inputTuff, outFile]);
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

  const input = resolve("selfhost", "tuffc.tuff");

  const s2 = await runCompiler(stage1Entry, input, stage2Dir);
  const s3 = await runCompiler(s2.entry, input, stage3Dir);
  const s4 = await runCompiler(s3.entry, input, stage4Dir);

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

  await mkdir(prebuiltDir, { recursive: true });
  await writeRuntime(prebuiltDir);
  await copyFile(s4.entry, resolve(prebuiltDir, "tuffc.mjs"));
  await copyFile(s4.lib, resolve(prebuiltDir, "tuffc_lib.mjs"));

  console.log(`wrote prebuilt compiler to ${prebuiltDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
