import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve, dirname } from "node:path";

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

function fixRelativeImports(source: string, filePath: string, prebuiltRoot: string): string {
  // For a file at prebuiltRoot/util/lexing.mjs:
  // - The import "./util/diagnostics.mjs" should be "./diagnostics.mjs" (sibling in same dir)
  // - The import "./parsing/primitives.mjs" should be "../parsing/primitives.mjs" (up one, then down)
  // - The import "./ast.mjs" should be "../ast.mjs" (up one level to root)
  
  const fileDir = dirname(relative(prebuiltRoot, filePath));
  let updated = source;

  // First, fix imports of modules in the new structure
  for (const [_, newPath] of MAPPINGS) {
    // Find imports of this module and fix relative paths based on file location
    const targetPath = resolve(prebuiltRoot, `${newPath}.mjs`);
    const currentPath = resolve(prebuiltRoot, filePath);
    const relativePath = relative(dirname(currentPath), targetPath);
    
    // Normalize slashes and add ./ prefix if needed
    const normalizedRelativePath = "./" + relativePath.replace(/\\/g, "/");
    
    // Replace old import with new relative import
    const pattern = new RegExp(`from\\s+"\\./[^"]*${newPath}\\.mjs"`, "g");
    updated = updated.replace(pattern, `from "${normalizedRelativePath}"`);
  }

  // Second, fix root-level imports (like ast.mjs) when accessed from subdirectories
  const rootFiles = ["ast.mjs", "analyzer.mjs"];
  for (const rootFile of rootFiles) {
    const targetPath = resolve(prebuiltRoot, rootFile);
    const currentPath = resolve(prebuiltRoot, filePath);
    const relativePath = relative(dirname(currentPath), targetPath);
    
    if (relativePath !== rootFile) {
      // File is in a subdirectory; fix the import
      const normalizedRelativePath = "./" + relativePath.replace(/\\/g, "/");
      const pattern = new RegExp(`from\\s+"\\./([./]*)?${rootFile}"`, "g");
      updated = updated.replace(pattern, `from "${normalizedRelativePath}"`);
    }
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
    const updated = fixRelativeImports(src, file, prebuiltDir);
    if (updated !== src) {
      await writeFile(file, updated, "utf8");
      console.log(`Fixed imports in: ${relative(prebuiltDir, file)}`);
    }
  }
  console.log("Done!");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
