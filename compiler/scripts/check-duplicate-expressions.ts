/**
 * Scans TypeScript source files for duplicate sub-expressions and automatically
 * extracts them into local const declarations with generated names.
 *
 * Expressions are compared both by normalized text AND by the resolved
 * declaration of every identifier they contain, so `x + 1` in two different
 * scopes (where `x` refers to different variables) is NOT treated as a
 * duplicate.
 *
 * Exit code 1 if any expressions were extracted. Exit code 0 if nothing changed.
 */

/* eslint-disable local/no-single-use-function, local/no-single-use-variable */

import { Project, Node, SyntaxKind, type SourceFile } from "ts-morph";
import { join } from "path";

const TSCONFIG_PATH = join(import.meta.dir, "..", "tsconfig.json");
const MIN_TEXT_LENGTH = 7;

const CANDIDATE_KINDS = new Set([
  SyntaxKind.BinaryExpression,
  SyntaxKind.PrefixUnaryExpression,
  SyntaxKind.PostfixUnaryExpression,
  SyntaxKind.CallExpression,
  SyntaxKind.PropertyAccessExpression,
  SyntaxKind.ConditionalExpression,
  SyntaxKind.NewExpression,
]);

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Returns a key that captures both the normalized text of an expression and
 * the resolved declaration site of every identifier it contains.  Two
 * expressions with the same text but different identifier bindings (e.g. `x`
 * from different scopes) will produce different keys.
 */
function computeNodeKey(node: Node): string {
  const textKey = normalize(node.getText());
  const identifiers = node.getDescendantsOfKind(SyntaxKind.Identifier);
  const symbolParts = identifiers.map((id) => {
    const firstDecl = id.getSymbol()?.getDeclarations()?.[0];
    return firstDecl
      ? firstDecl.getSourceFile().getFilePath() + ":" + firstDecl.getStart()
      : "?:" + id.getText();
  });
  return textKey + "\0" + symbolParts.join(",");
}

/**
 * Returns true if every node in `nodes` is contained within the source range
 * of some node in another group that also has 2+ occurrences.  Used to skip
 * sub-expression groups when a larger enclosing expression is already being
 * extracted.
 */
function isContainedInLargerGroup(
  nodes: Node[],
  byKey: Map<string, Node[]>,
): boolean {
  for (const otherNodes of byKey.values()) {
    if (otherNodes === nodes || otherNodes.length < 2) continue;
    for (const n of nodes) {
      for (const other of otherNodes) {
        if (n.getStart() >= other.getStart() && n.getEnd() <= other.getEnd()) {
          return true;
        }
      }
    }
  }
  return false;
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

function generateName(
  prefix: string,
  sourceFile: SourceFile,
  start: number,
): string {
  const text = sourceFile.getFullText();
  let i = start;
  while (true) {
    const name = prefix + i;
    if (!text.includes(name)) return name;
    i++;
  }
}

const project = new Project({ tsConfigFilePath: TSCONFIG_PATH });

let totalExtracted = 0;
let globalCounter = 0;

for (const sourceFile of project.getSourceFiles()) {
  // Skip declaration files and test files
  if (
    sourceFile.isDeclarationFile() ||
    sourceFile.getBaseName().endsWith(".test.ts")
  ) {
    continue;
  }

  let extractedInFile = 0;

  let changed = true;
  while (changed) {
    changed = false;

    const byKey = new Map<string, Node[]>();
    sourceFile.forEachDescendant((node) => {
      if (!CANDIDATE_KINDS.has(node.getKind())) return;
      if (node.getText().length < MIN_TEXT_LENGTH) return;
      const key = computeNodeKey(node);
      const bucket = byKey.get(key);
      if (bucket === undefined) {
        byKey.set(key, [node]);
      } else {
        bucket.push(node);
      }
    });

    for (const nodes of byKey.values()) {
      if (nodes.length < 2) continue;
      if (isContainedInLargerGroup(nodes, byKey)) continue;

      const sorted = [...nodes].sort((a, b) => a.getStart() - b.getStart());
      const firstNode = sorted[0]!;
      const exprText = firstNode.getText();

      const stmt = getContainingStatement(firstNode);
      if (!stmt) continue;

      const name = generateName("expr", sourceFile, globalCounter++);

      // Replace all occurrences from last to first to preserve positions
      for (const node of [...sorted].reverse()) {
        node.replaceWithText(name);
      }

      // Prepend the const declaration before the containing statement
      stmt.replaceWithText(`const ${name} = ${exprText};\n${stmt.getText()}`);

      extractedInFile++;
      changed = true;
      break;
    }
  }

  if (extractedInFile > 0) {
    sourceFile.saveSync();
    console.log(
      sourceFile.getBaseName() +
        ": extracted " +
        extractedInFile +
        " expression" +
        (extractedInFile === 1 ? "" : "s"),
    );
    totalExtracted += extractedInFile;
  }
}

if (totalExtracted === 0) {
  console.log("No duplicate expressions found.");
  process.exit(0);
}

console.log("\nTotal extracted: " + totalExtracted);
process.exit(1);
