/**
 * Scans TypeScript source files for duplicate sub-expressions and reports them
 * with file/line/column context so the author can decide whether to extract a
 * shared variable.
 *
 * Unlike an ESLint rule, this script prints a human-readable diff-style report
 * rather than a hard error, making it clear *what* is duplicated and *where*.
 *
 * Exit code 1 if any duplicates are found.
 */

import { Linter } from "eslint";
import * as ts from "typescript";
import { readFileSync, readdirSync } from "fs";
import { join, relative } from "path";

const SRC_DIR = join(import.meta.dir, "..", "src");
const MIN_TOKENS = 4;

interface Occurrence {
  file: string;
  line: number;
  col: number;
  text: string;
}

interface DuplicateGroup {
  key: string;
  occurrences: Occurrence[];
}

function normalize(text: string): string {
  let key = "";
  let inSpace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      if (!inSpace) {
        key += " ";
        inSpace = true;
      }
    } else {
      key += ch;
      inSpace = false;
    }
  }
  return key.trim();
}

function findDuplicatesInFile(
  filePath: string,
  seen: Map<string, Occurrence[]>,
): void {
  const tsSource = readFileSync(filePath, "utf8");
  const jsSource = ts.transpile(tsSource, {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
  });
  const relPath = relative(SRC_DIR, filePath);

  const linter = new Linter({ configType: "flat" });
  const occurrencesByKey = new Map<string, Occurrence[]>();

  linter.verify(jsSource, {
    plugins: {
      local: {
        rules: {
          collect: {
            create(context) {
              function record(
                node: Parameters<typeof context.report>[0] extends {
                  node: infer N;
                }
                  ? N
                  : never,
              ): void {
                const trivial =
                  node.type === "Identifier" ||
                  node.type === "Literal" ||
                  node.type === "ThisExpression" ||
                  node.type === "Super";
                if (trivial) return;
                if (context.sourceCode.getTokens(node).length < MIN_TOKENS)
                  return;
                const raw = context.sourceCode.getText(node);
                const key = normalize(raw);
                const loc = node.loc;
                if (!loc) return;
                const occ: Occurrence = {
                  file: relPath,
                  line: loc.start.line,
                  col: loc.start.column + 1,
                  text: raw.split("\n")[0].slice(0, 80),
                };
                const bucket = occurrencesByKey.get(key);
                if (bucket === undefined) {
                  occurrencesByKey.set(key, [occ]);
                } else {
                  bucket.push(occ);
                }
              }
              return {
                BinaryExpression: record,
                LogicalExpression: record,
                UnaryExpression: record,
                CallExpression: record,
                MemberExpression: record,
                ConditionalExpression: record,
                AssignmentExpression: record,
                NewExpression: record,
              };
            },
          },
        },
      },
    },
    languageOptions: { ecmaVersion: 2022, sourceType: "module" },
    rules: { "local/collect": "error" },
  });

  for (const [key, occs] of occurrencesByKey) {
    if (occs.length < 2) continue;
    const existing = seen.get(key);
    if (existing === undefined) {
      seen.set(key, [...occs]);
    } else {
      for (const occ of occs) existing.push(occ);
    }
  }
}

function isContainedInLargerDuplicate(
  occ: Occurrence,
  key: string,
  allGroups: Map<string, Occurrence[]>,
): boolean {
  for (const [otherKey, otherOccs] of allGroups) {
    if (otherKey === key || otherOccs.length < 2) continue;
    // A larger duplicate contains this one if its key text contains our key text
    // and it appears in the same file/vicinity. We use text containment as a proxy
    // since we don't have range info across the transpilation boundary.
    if (otherKey.includes(key) && otherKey.length > key.length) {
      const sameFileGroup = otherOccs.filter((o) => o.file === occ.file);
      if (sameFileGroup.length >= 2) return true;
    }
  }
  return false;
}

// Collect duplicates across all source files.
const seen = new Map<string, Occurrence[]>();
const tsFiles = readdirSync(SRC_DIR).filter(
  (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
);
for (const f of tsFiles) {
  findDuplicatesInFile(join(SRC_DIR, f), seen);
}

// Filter to only groups with 2+ occurrences and suppress sub-expression noise.
const groups: DuplicateGroup[] = [];
for (const [key, occs] of seen) {
  if (occs.length < 2) continue;
  if (isContainedInLargerDuplicate(occs[0]!, key, seen)) continue;
  groups.push({ key, occurrences: occs });
}

if (groups.length === 0) {
  console.log("No duplicate expressions found.");
  process.exit(0);
}

console.error(
  `Found ${groups.length} duplicate expression${groups.length === 1 ? "" : "s"}:\n`,
);

for (const group of groups) {
  console.error(`  Duplicated expression: ${group.key.slice(0, 72)}`);
  for (const occ of group.occurrences) {
    console.error(`    ${occ.file}:${occ.line}:${occ.col}  ${occ.text}`);
  }
  console.error("");
}

process.exit(1);
