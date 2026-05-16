/**
 * Scans TypeScript source files for local variables that are only read once
 * and automatically inlines their initializer at the use site, removing the
 * declaration entirely.
 *
 * Example:
 *   const x = foo();   // declaration
 *   return x + 1;      // only reference
 *
 * Becomes:
 *   return foo() + 1;
 *
 * Exported variables are skipped — they may be read from outside this file.
 *
 * Exit code 1 if any variables were inlined (so CI can re-run or flag the
 * change for review). Exit code 0 if nothing was changed.
 */
import { Project, Node, VariableDeclarationKind, SyntaxKind } from "ts-morph";
import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const tsFiles = readdirSync(SRC_DIR).filter((f) => f.endsWith(".ts"));

const project = new Project({ skipAddingFilesFromTsConfig: true });
for (const f of tsFiles) {
  project.addSourceFileAtPath(join(SRC_DIR, f));
}

let totalInlined = 0;

for (const sourceFile of project.getSourceFiles()) {
  let inlinedInFile = 0;

  // Iterate until no more single-use variables remain in this file.
  // Each inline may expose new single-use variables, so we repeat.
  let changed = true;
  while (changed) {
    changed = false;

    for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
      // Skip exported declarations.
      const varStatement = declaration.getVariableStatement();
      if (varStatement && varStatement.isExported()) continue;

      // Skip destructuring patterns.
      const nameNode = declaration.getNameNode();
      if (!Node.isIdentifier(nameNode)) continue;

      const initializer = declaration.getInitializer();
      if (!initializer) continue;

      const refs = nameNode
        .findReferencesAsNodes()
        .filter((ref) => ref !== nameNode);

      if (refs.length !== 1) continue;

      const ref = refs[0];
      if (!ref) continue;

      // Replace the reference with the initializer text.
      // Wrap in parens when the declaration used `const`/`let` (i.e. not
      // already a simple identifier) to preserve operator precedence.
      const initText = initializer.getText();
      const needsParens =
        varStatement?.getDeclarationKind() !== VariableDeclarationKind.Var &&
        initText.includes(" ");
      const replacement = needsParens ? "(" + initText + ")" : initText;

      ref.replaceWithText(replacement);

      // Remove the variable statement if this was its only declarator,
      // otherwise just remove this declarator.
      const siblings = varStatement?.getDeclarations() ?? [];
      if (siblings.length <= 1) {
        varStatement?.remove();
      } else {
        declaration.remove();
      }

      inlinedInFile++;
      changed = true;
      // Restart iteration — AST nodes are now stale after mutation.
      break;
    }
  }

  if (inlinedInFile > 0) {
    sourceFile.saveSync();
    console.log(
      sourceFile.getBaseName() +
        ": inlined " +
        inlinedInFile +
        " variable" +
        (inlinedInFile === 1 ? "" : "s"),
    );
    totalInlined += inlinedInFile;
  }
}

if (totalInlined === 0) {
  console.log("No single-use variables found.");
  process.exit(0);
}

console.log("\nTotal inlined: " + totalInlined);
process.exit(1);
