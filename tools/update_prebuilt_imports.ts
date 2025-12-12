import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const MAPPINGS = [
  ["parsing_primitives", "parsing/primitives"],
  ["parsing_types", "parsing/types"],
  ["parsing_expr_stmt", "parsing/expr_stmt"],
  ["parsing_decls", "parsing/decls"],
  ["diagnostics", "util/diagnostics"],
  ["lexing", "util/lexing"],
  ["formatting", "util/formatting"],
  ["emit_ast_js", "emit/ast_js"],
  ["emit_tuff", "emit/tuff"],
  ["refactor_move_file", "refactor/move_file"],
];

function rewriteImports(source: string): string {
  let updated = source;
  for (const [oldPath, newPath] of MAPPINGS) {
    // from "./<oldPath>" -> from "./<newPath>"
    const pattern1 = new RegExp(`"\\./([./]*)?${oldPath}\.mjs"`, "g");
    updated = updated.replace(pattern1, `"./${newPath}.mjs"`);

    // import from "./<oldPath>" etc
    const pattern2 = new RegExp(`from\\s+"\\./([./]*)?${oldPath}\.mjs"`, "g");
    updated = updated.replace(pattern2, `from "./${newPath}.mjs"`);
  }
  return updated;
}

async function listAllFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory() && ent.name !== "node_modules") {
      out.push(...(await listAllFiles(full)));
    } else if (ent.isFile()) {
      out.push(full);
    }
  }
  return out;
}

async function main() {
  const prebuiltDir = resolve("selfhost/prebuilt");
  const files = await listAllFiles(prebuiltDir);

  for (const file of files) {
    if (!file.endsWith(".mjs")) continue;

    const src = await readFile(file, "utf8");
    const updated = rewriteImports(src);
    if (updated !== src) {
      await writeFile(file, updated, "utf8");
      console.log(`Updated: ${file}`);
    }
  }
  console.log("Done!");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
