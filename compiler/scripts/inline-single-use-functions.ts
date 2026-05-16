/**
 * Scans TypeScript source files for non-exported functions that are only called
 * once and automatically inlines the function body at the call site, removing
 * the declaration entirely.
 *
 * Two cases are handled:
 *
 *   1. Single-return body — the call expression is replaced by the return value:
 *        function double(x: number) { return x * 2; }
 *        const y = double(3);
 *      Becomes:
 *        const y = 3 * 2;
 *
 *   2. Multi-statement body — the containing statement of the call is replaced
 *      by the full body (parameters substituted, `return` on the last statement
 *      stripped so it becomes a plain expression statement):
 *        function greet(name: string) { console.log("hi"); console.log(name); }
 *        greet("world");
 *      Becomes:
 *        console.log("hi");
 *        console.log("world");
 *
 * Exported functions and functions with rest/default parameters are skipped.
 * Arrow functions and function expressions assigned to variables are handled
 * by inline-single-use-variables.ts — this script targets `function` declarations only.
 *
 * Exit code 1 if any functions were inlined (so CI can flag the change).
 * Exit code 0 if nothing changed.
 */

/* eslint-disable local/no-single-use-function, local/no-single-use-variable */

import {
  Project,
  Node,
  SyntaxKind,
  FunctionDeclaration,
  CallExpression,
  ParameterDeclaration,
} from "ts-morph";
import { readdirSync } from "fs";
import { join } from "path";

const SRC_DIR = join(import.meta.dir, "..", "src");

const tsFiles = readdirSync(SRC_DIR).filter((f) => f.endsWith(".ts"));

const project = new Project({ skipAddingFilesFromTsConfig: true });
for (const f of tsFiles) {
  project.addSourceFileAtPath(join(SRC_DIR, f));
}

/**
 * Substitute actual argument texts for parameter names in a code string.
 * Simple textual replacement — works for the non-complex cases this tool targets.
 */
function substituteArgs(
  code: string,
  params: ParameterDeclaration[],
  args: string[],
): string {
  let result = code;
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    if (!param) continue;
    const paramName = param.getName();
    const argText = args[i] ?? "undefined";
    // Replace whole-word occurrences of the parameter name.
    result = result.split(paramName).join(argText);
  }
  return result;
}

/**
 * Find the statement-level ancestor of a node (a child of a Block or SourceFile).
 */
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

let totalInlined = 0;

for (const sourceFile of project.getSourceFiles()) {
  let inlinedInFile = 0;

  let changed = true;
  while (changed) {
    changed = false;

    for (const fn of sourceFile.getFunctions()) {
      // Skip exported functions.
      if (fn.isExported()) continue;

      // Skip functions with rest or default parameters — substitution is unsafe.
      const params = fn.getParameters();
      const hasComplexParams = params.some(
        (p) => p.isRestParameter() || p.hasInitializer(),
      );
      if (hasComplexParams) continue;

      const nameNode = fn.getNameNode();
      if (!nameNode) continue;

      const refs = nameNode
        .findReferencesAsNodes()
        .filter((ref) => ref !== nameNode);

      if (refs.length !== 1) continue;

      const ref = refs[0];
      if (!ref) continue;

      // The reference must be used as a CallExpression callee.
      const callExpr = ref.getParentIfKind(SyntaxKind.CallExpression) as
        | CallExpression
        | undefined;
      if (!callExpr) continue;

      const body = fn.getBody();
      if (!Node.isBlock(body)) continue;

      const statements = body.getStatements();
      const argTexts = callExpr.getArguments().map((a) => a.getText());

      if (statements.length === 1) {
        // ── Case 1: single statement ─────────────────────────────────────
        const stmt = statements[0]!;

        if (Node.isReturnStatement(stmt)) {
          // Replace the call expression with the return value expression.
          const returnExpr = stmt.getExpression();
          const rawText = returnExpr ? returnExpr.getText() : "undefined";
          const inlined = substituteArgs(rawText, params, argTexts);
          // Wrap in parens if the inlined expression contains spaces and the
          // call site is nested inside another expression.
          const callParent = callExpr.getParent();
          const needsParens =
            inlined.includes(" ") &&
            !Node.isExpressionStatement(callParent) &&
            !Node.isReturnStatement(callParent);
          callExpr.replaceWithText(needsParens ? "(" + inlined + ")" : inlined);
        } else {
          // Non-return single statement: replace the containing statement.
          const container = getContainingStatement(callExpr);
          if (!container) continue;
          const rawText = stmt.getText();
          const inlined = substituteArgs(rawText, params, argTexts);
          container.replaceWithText(inlined);
        }
      } else {
        // ── Case 2: multiple statements ──────────────────────────────────
        // Replace the containing statement with all body statements.
        // The last statement's `return <expr>;` becomes `<expr>;`.
        const container = getContainingStatement(callExpr);
        if (!container) continue;

        const lines: string[] = [];
        for (let i = 0; i < statements.length; i++) {
          const stmt = statements[i]!;
          let text: string;
          if (i === statements.length - 1 && Node.isReturnStatement(stmt)) {
            const returnExpr = stmt.getExpression();
            text = returnExpr ? returnExpr.getText() + ";" : "";
          } else {
            text = stmt.getText();
          }
          if (text) lines.push(substituteArgs(text, params, argTexts));
        }
        container.replaceWithText(lines.join("\n"));
      }

      fn.remove();

      inlinedInFile++;
      changed = true;
      break;
    }
  }

  if (inlinedInFile > 0) {
    sourceFile.saveSync();
    console.log(
      sourceFile.getBaseName() +
        ": inlined " +
        inlinedInFile +
        " function" +
        (inlinedInFile === 1 ? "" : "s"),
    );
    totalInlined += inlinedInFile;
  }
}

if (totalInlined === 0) {
  console.log("No single-use functions found.");
  process.exit(0);
}

console.log("\nTotal inlined: " + totalInlined);
process.exit(1);
