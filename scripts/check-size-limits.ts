/**
 * Size-limit linter: enforces the architecture's size limits on all .ts files.
 *   - max 100 lines per function
 *   - max 500 lines per file
 * (The 10-children-per-directory limit is enforced by the cap-children-per-directory hook.)
 * Exits non-zero if any limit is violated.
 */
import * as ts from "typescript";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MAX_FUNCTION_LINES = 100;
const MAX_FILE_LINES = 500;
const SKIP_DIRS = new Set(["node_modules", ".git", "target"]);

function collectTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) files.push(...collectTsFiles(path));
    } else if (entry.endsWith(".ts")) {
      files.push(path);
    }
  }
  return files;
}

function functionName(node: ts.SignatureDeclaration): string {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text;
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  return "anonymous";
}

function checkFile(file: string, source: string): string[] {
  const violations: string[] = [];
  const lineCount = source.split("\n").length;
  if (lineCount > MAX_FILE_LINES) {
    violations.push(`${file}: file is ${lineCount} lines (max ${MAX_FILE_LINES})`);
  }
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) {
      const start = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      const end = sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
      const len = end - start + 1;
      if (len > MAX_FUNCTION_LINES) {
        violations.push(
          `${file}:${start}: function "${functionName(node)}" is ${len} lines (max ${MAX_FUNCTION_LINES})`,
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return violations;
}

const root = process.cwd();
const allViolations = collectTsFiles(root).flatMap((file) =>
  checkFile(file, readFileSync(file, "utf8")),
);
if (allViolations.length > 0) {
  for (const v of allViolations) console.error(v);
  console.error(`${allViolations.length} size limit violation(s) found.`);
  process.exit(1);
}
console.log("Size limits OK.");
