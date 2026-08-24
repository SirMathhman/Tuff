// Generates callgraph.svg: a Graphviz call graph of all functions in the repo.
// Usage: bun tools/callgraph.ts
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path, { join, relative } from "node:path";
import * as ts from "typescript";

const root = join(import.meta.dir, "..");

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTsFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

const files = collectTsFiles(path.join(root, "src"));

// name -> file(s) defining a function with that name
const defs = new Map<string, Set<string>>();
// file::name -> set of called names
const calls = new Map<string, Set<string>>();

function defId(file: string, name: string): string {
  return `${relative(root, file)}::${name}`;
}

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);

  const functions: { name: string; node: ts.FunctionLikeDeclaration }[] = [];

  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node)) {
      functions.push({ name: node.name.text, node });
    } else if (
      (ts.isFunctionExpression(node) || ts.isArrowFunction(node)) &&
      ts.isVariableDeclaration(node.parent) &&
      ts.isIdentifier(node.parent.name)
    ) {
      functions.push({ name: node.parent.name.text, node });
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  for (const { name, node } of functions) {
    const set = defs.get(name) ?? new Set();
    set.add(file);
    defs.set(name, set);
    const id = defId(file, name);
    const called = calls.get(id) ?? new Set<string>();
    calls.set(id, called);

    function walk(body: ts.Node): void {
      if (ts.isCallExpression(body) && ts.isIdentifier(body.expression)) {
        called.add(body.expression.text);
      }
      ts.forEachChild(body, walk);
    }
    walk(node);
  }
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

const lines: string[] = [
  "digraph tuff {",
  "  rankdir=TB;",
  "  splines=ortho;",
  '  node [shape=box, style="rounded,filled", fillcolor="#eef2ff", fontname="Consolas"];',
  '  edge [color="#64748b"];',
];

// Group nodes by file so each file is drawn as a labeled cluster box.
const byFile = new Map<string, string[]>();
for (const id of calls.keys()) {
  const file = id.split("::")[0]!;
  const list = byFile.get(file) ?? [];
  list.push(id);
  byFile.set(file, list);
}

for (const [file, ids] of [...byFile.entries()].sort()) {
  const cluster = `cluster_${file.replace(/[^a-zA-Z0-9]+/g, "_")}`;
  lines.push(`  subgraph "${cluster}" {`);
  lines.push(`    style="rounded";`);
  lines.push(`    color="#94a3b8";`);
  lines.push(`    fontname="Consolas";`);
  lines.push(`    fontsize=12;`);
  lines.push(`    label="${esc(file)}";`);
  for (const id of ids) {
    const name = id.split("::")[1]!;
    lines.push(`    "${esc(id)}" [label="${esc(name)}"];`);
  }
  lines.push("  }");
}

const seenEdges = new Set<string>();
for (const [id, called] of calls) {
  for (const callee of called) {
    const targets = defs.get(callee);
    if (!targets) continue; // not a function in this repo
    for (const targetFile of targets) {
      const targetId = defId(targetFile, callee);
      const key = `${id}->${targetId}`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      lines.push(`  "${esc(id)}" -> "${esc(targetId)}";`);
    }
  }
}
lines.push("}");

const dotPath = join(root, "docs", "callgraph.dot");
const svgPath = join(root, "docs", "callgraph.svg");
writeFileSync(dotPath, lines.join("\n") + "\n");

const result = spawnSync("dot", ["-Tsvg", "-o", svgPath, dotPath], {
  stdio: "inherit",
});
if (result.status !== 0) {
  console.error("dot failed with exit code", result.status);
  process.exit(result.status ?? 1);
}
console.log(`wrote ${relative(root, svgPath)} (${calls.size} functions)`);
