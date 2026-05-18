/**
 * Scans TypeScript source files for duplicate substrings shared across two or
 * more string literals within the same file and automatically extracts them
 * into local const declarations with generated names.
 *
 * Exit code 1 if any extractions were made. Exit code 0 if nothing changed.
 */

/* eslint-disable local/no-single-use-function, local/no-single-use-variable */

import { Project, Node, SyntaxKind, type SourceFile } from "ts-morph";
import { readdirSync } from "fs";
import { join } from "path";

const SRC_DIR = join(import.meta.dir, "..", "src");
const MIN_SUBSTRING_LENGTH = 5;

function allSubstrings(s: string): Set<string> {
  const subs = new Set<string>();
  for (let start = 0; start < s.length; start++) {
    for (let end = start + MIN_SUBSTRING_LENGTH; end <= s.length; end++) {
      subs.add(s.slice(start, end));
    }
  }
  return subs;
}

function buildReplacement(value: string, substring: string, name: string): string {
  const idx = value.indexOf(substring);
  if (idx === -1) return JSON.stringify(value);
  const before = value.slice(0, idx);
  const after = value.slice(idx + substring.length);
  const parts: string[] = [];
  if (before) parts.push(JSON.stringify(before));
  parts.push(name);
  if (after) parts.push(JSON.stringify(after));
  return parts.join(" + ");
}

function getContainingStatement(node: Node): Node | undefined {
  let current: Node = node;
  while (current.getParent()) {
    const parent = current.getParent()!;
    if (
      Node.isBlock(parent) ||
      Node.isSourceFile(parent) ||
      Node.isModuleBlock(parent)
    ) {
      return current;
    }
    current = parent;
  }
  return undefined;
}

function generateName(prefix: string, sourceFile: SourceFile, start: number): string {
  const text = sourceFile.getFullText();
  let i = start;
  while (true) {
    const name = prefix + i;
    if (!text.includes(name)) return name;
    i++;
  }
}

const project = new Project({ skipAddingFilesFromTsConfig: true });

const tsFiles = readdirSync(SRC_DIR).filter(
  (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
);
for (const f of tsFiles) {
  project.addSourceFileAtPath(join(SRC_DIR, f));
}

let totalExtracted = 0;
let globalCounter = 0;

for (const sourceFile of project.getSourceFiles()) {
  let extractedInFile = 0;

  let changed = true;
  while (changed) {
    changed = false;

    const stringNodes = [
      ...sourceFile.getDescendantsOfKind(SyntaxKind.StringLiteral),
      ...sourceFile.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral),
    ].filter((n) => n.getLiteralText().length >= MIN_SUBSTRING_LENGTH);

    // Map each substring to the string literal nodes that contain it
    const substringToNodes = new Map<string, typeof stringNodes>();
    for (const node of stringNodes) {
      const value = node.getLiteralText();
      for (const sub of allSubstrings(value)) {
        const bucket = substringToNodes.get(sub);
        if (bucket === undefined) {
          substringToNodes.set(sub, [node]);
        } else {
          const already = bucket.some((n) => n.getStart() === node.getStart());
          if (!already) bucket.push(node);
        }
      }
    }

    // Find groups with 2+ distinct string literals sharing the substring
    type Group = { substring: string; nodes: typeof stringNodes };
    let groups: Group[] = [];
    for (const [substring, nodes] of substringToNodes) {
      if (nodes.length >= 2) groups.push({ substring, nodes });
    }

    // Remove substrings covered by a longer duplicate
    const allSubs = new Set(groups.map((g) => g.substring));
    groups = groups.filter((g) => {
      for (const other of allSubs) {
        if (other !== g.substring && other.includes(g.substring)) {
          const parentGroup = groups.find((pg) => pg.substring === other);
          if (parentGroup && parentGroup.nodes.length >= 2) return false;
        }
      }
      return true;
    });

    if (groups.length === 0) break;

    const group = groups[0]!;
    const { substring, nodes } = group;
    const sorted = [...nodes].sort((a, b) => a.getStart() - b.getStart());
    const firstNode = sorted[0]!;

    const stmt = getContainingStatement(firstNode);
    if (!stmt) break;

    const name = generateName("str", sourceFile, globalCounter++);

    // Replace string literals from last to first to preserve positions
    for (const node of [...sorted].reverse()) {
      const value = node.getLiteralText();
      node.replaceWithText(buildReplacement(value, substring, name));
    }

    // Prepend the const declaration before the containing statement
    stmt.replaceWithText(
      `const ${name} = ${JSON.stringify(substring)};\n${stmt.getText()}`,
    );

    extractedInFile++;
    changed = true;
  }

  if (extractedInFile > 0) {
    sourceFile.saveSync();
    console.log(
      sourceFile.getBaseName() +
        ": extracted " +
        extractedInFile +
        " string substring" +
        (extractedInFile === 1 ? "" : "s"),
    );
    totalExtracted += extractedInFile;
  }
}

if (totalExtracted === 0) {
  console.log("No duplicate string substrings found.");
  process.exit(0);
}

console.log("\nTotal extracted: " + totalExtracted);
process.exit(1);
