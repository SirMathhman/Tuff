import { compileToESM } from "../src/index";

import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";

export function compile(src: string, filePath = "/virtual/test.tuff") {
  return compileToESM({ filePath, source: src });
}

async function writeRuntime(outDir: string) {
  const rtDir = resolve(outDir, "rt");
  await mkdir(rtDir, { recursive: true });
  await copyFile(resolve("rt/stdlib.mjs"), resolve(rtDir, "stdlib.mjs"));
  await copyFile(resolve("rt/vec.mjs"), resolve(rtDir, "vec.mjs"));
}

function throwIfErrors(diagnostics: any[], label: string) {
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      [
        label,
        ...errors.map(
          (e) =>
            `${e.span?.filePath ?? ""}:${e.span?.line ?? "?"}:${
              e.span?.col ?? "?"
            } ${e.message}`
        ),
      ].join("\n")
    );
  }
}

export async function buildSelfhostCompiler(outDir: string) {
  await mkdir(outDir, { recursive: true });
  await writeRuntime(outDir);

  const selfhostDir = resolve("selfhost");
  const entries = await readdir(selfhostDir, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (!ent.name.endsWith(".tuff")) continue;

    const filePath = resolve(selfhostDir, ent.name);
    const src = await readFile(filePath, "utf8");
    const { js, diagnostics } = compileToESM({ filePath, source: src });
    throwIfErrors(
      diagnostics as any[],
      `bootstrap compiler failed to compile ${filePath}:`
    );

    const outFile = resolve(outDir, ent.name.replace(/\.tuff$/, ".mjs"));
    await writeFile(outFile, js, "utf8");
  }

  return {
    entryFile: resolve(outDir, "tuffc.mjs"),
    libFile: resolve(outDir, "tuffc_lib.mjs"),
  };
}
