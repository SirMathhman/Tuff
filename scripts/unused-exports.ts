import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Reports every export that no other project file imports or re-exports.
// Usage: bun scripts/unused-exports.ts

interface Finding {
  file: string;
  name: string;
}

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// The compiler reports file names with forward slashes, so match that form.
function listSources(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".d.ts"))
    .map((name) => join(dir, name).split("\\").join("/"));
}

const rootNames = [
  ...listSources(join(projectRoot, "src")),
  ...listSources(join(projectRoot, "scripts")),
];

const { ScriptTarget, ModuleKind, ModuleResolutionKind } = ts;

const options: ts.CompilerOptions = {
  target: ScriptTarget.ESNext,
  module: ModuleKind.ESNext,
  moduleResolution: ModuleResolutionKind.Bundler,
  noEmit: true,
};

const program = ts.createProgram(rootNames, options);
const checker = program.getTypeChecker();
const projectFiles = new Set(
  program
    .getSourceFiles()
    .filter((sf) => rootNames.includes(sf.fileName))
    .map((sf) => sf.fileName),
);

// The names listed in a named export clause, such as `export { a, b as c }`.
function exportedNames(clause: ts.NamedExports): string[] {
  const { elements } = clause;
  return elements.map((el) => (el.propertyName ?? el.name).text);
}

// "file::name" pairs that another file imports or re-exports; "file::*" marks a namespace import.
const usedElsewhere = new Set<string>();

function markUse(
  importerFile: string,
  specifier: string,
  names: string[],
): void {
  const resolved = ts.resolveModuleName(
    specifier,
    importerFile,
    options,
    ts.sys,
  ).resolvedModule;
  if (!resolved || !projectFiles.has(resolved.resolvedFileName)) return;
  for (const name of names) {
    usedElsewhere.add(`${resolved.resolvedFileName}::${name}`);
  }
}

for (const sf of program.getSourceFiles()) {
  if (!projectFiles.has(sf.fileName)) continue;
  for (const statement of sf.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const { moduleSpecifier, importClause } = statement;
      const bindings = importClause?.namedBindings;
      if (!bindings) continue;
      if (ts.isNamespaceImport(bindings)) {
        markUse(sf.fileName, moduleSpecifier.text, ["*"]);
      } else {
        const { elements } = bindings;
        const names = elements.map((el) => (el.propertyName ?? el.name).text);
        markUse(sf.fileName, moduleSpecifier.text, names);
      }
    } else if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const { moduleSpecifier, exportClause } = statement;
      const names =
        exportClause && ts.isNamedExports(exportClause)
          ? exportedNames(exportClause)
          : ["*"];
      markUse(sf.fileName, moduleSpecifier.text, names);
    }
  }
}

const findings: Finding[] = [];
for (const fileName of projectFiles) {
  const sf = program.getSourceFile(fileName);
  const moduleSymbol = sf && checker.getSymbolAtLocation(sf);
  if (!moduleSymbol) continue;
  if (usedElsewhere.has(`${fileName}::*`)) continue;
  for (const sym of checker.getExportsOfModule(moduleSymbol)) {
    const name = sym.getName();
    if (!usedElsewhere.has(`${fileName}::${name}`)) {
      findings.push({ file: fileName, name });
    }
  }
}

for (const finding of findings) {
  console.log(
    `${finding.file}: "${finding.name}" is exported but not used by any other file; remove "export".`,
  );
}
process.exitCode = findings.length > 0 ? 1 : 0;
