import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const MAPPINGS = [
  ["parsing_primitives", "parsing::primitives"],
  ["parsing_types", "parsing::types"],
  ["parsing_expr_stmt", "parsing::expr_stmt"],
  ["parsing_decls", "parsing::decls"],
  ["diagnostics", "util::diagnostics"],
  ["lexing", "util::lexing"],
  ["formatting", "util::formatting"],
  ["emit_ast_js", "emit::ast_js"],
  ["emit_tuff", "emit::tuff"],
  ["refactor_move_file", "refactor::move_file"],
];

function rewriteImports(source: string): string {
  let updated = source;
  for (const [oldPath, newPath] of MAPPINGS) {
    // from <oldPath> use
    const fromRegex = new RegExp(`\\bfrom\\s+${oldPath}(?=\\s+use\\b)`, "g");
    updated = updated.replace(fromRegex, `from ${newPath}`);

    // extern from <oldPath> use
    const externRegex = new RegExp(
      `\\bextern\\s+from\\s+${oldPath}(?=\\s+use\\b)`,
      "g"
    );
    updated = updated.replace(externRegex, `extern from ${newPath}`);
  }
  return updated;
}

async function listTuffFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await listTuffFiles(full)));
    } else if (ent.isFile() && full.endsWith(".tuff")) {
      out.push(full);
    }
  }
  return out;
}

async function main() {
  const compilerDir = resolve("src/main/tuff/compiler");
  const files = await listTuffFiles(compilerDir);

  for (const file of files) {
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
