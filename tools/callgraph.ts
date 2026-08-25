// Generates callgraph.svg: a Graphviz call graph of all functions in the repo.
// Usage: bun tools/callgraph.ts
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import * as ts from "typescript";

const root = join(import.meta.dir, "..");

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) {
      if (entry.name === "tools") continue;
      out.push(...collectTsFiles(join(dir, entry.name)));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

const files = collectTsFiles(root);

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
    if (ts.isFunctionDeclaration(node) && node.name) {
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
    const relFile = relative(root, file);
    const set = defs.get(name) ?? new Set();
    set.add(relFile);
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

// Build a directory tree so nested folders (e.g. src > parser) render as
// nested clusters, each labeled with just its own name rather than the path.
type DirNode = {
  name: string; // basename; "" for the repo root
  files: string[]; // full relative paths of files directly in this dir
  dirs: Map<string, DirNode>;
};

const rootDir: DirNode = { name: "", files: [], dirs: new Map() };
for (const file of byFile.keys()) {
  const segments = file.replace(/\\/g, "/").split("/");
  let node = rootDir;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    let child = node.dirs.get(seg);
    if (!child) {
      child = { name: seg, files: [], dirs: new Map() };
      node.dirs.set(seg, child);
    }
    node = child;
  }
  node.files.push(file);
}

function fileCluster(file: string, ids: string[]): string[] {
  const label = file.replace(/\\/g, "/").split("/").pop()!;
  const cluster = `cluster_${file.replace(/[^a-zA-Z0-9]+/g, "_")}`;
  const out = [`  subgraph "${cluster}" {`];
  out.push(`    style="rounded";`);
  out.push(`    color="#94a3b8";`);
  out.push(`    fontname="Consolas";`);
  out.push(`    fontsize=12;`);
  out.push(`    label="${esc(label)}";`);
  // A node representing the file itself, so cross-file edges can target it.
  out.push(
    `    "${esc(file)}" [label="${esc(label)}", shape=folder, fillcolor="#e2e8f0"];`,
  );
  for (const id of ids) {
    const name = id.split("::")[1]!;
    out.push(`    "${esc(id)}" [label="${esc(name)}"];`);
  }
  out.push("  }");
  return out;
}

// Render a directory's contents. A dir gets its own labeled box when it holds
// more than one file or contains subdirectories; otherwise its single file is
// emitted directly into the parent.
function renderDir(node: DirNode, relPath: string, isRoot = false): string[] {
  const out: string[] = [];
  if (isRoot) {
    for (const file of node.files)
      out.push(...fileCluster(file, byFile.get(file)!));
    for (const [name, child] of [...node.dirs.entries()].sort()) {
      out.push(...renderDir(child, name));
    }
    return out;
  }
  if (node.files.length < 2 && node.dirs.size === 0) {
    for (const file of node.files)
      out.push(...fileCluster(file, byFile.get(file)!));
    return out;
  }
  const cluster = `cluster_dir_${(relPath || "root").replace(/[^a-zA-Z0-9]+/g, "_")}`;
  out.push(`  subgraph "${cluster}" {`);
  out.push(`    style="rounded";`);
  out.push(`    color="#64748b";`);
  out.push(`    fontname="Consolas";`);
  out.push(`    fontsize=13;`);
  out.push(`    label="${esc(node.name || ".")}";`);
  for (const file of node.files)
    out.push(...fileCluster(file, byFile.get(file)!));
  for (const [name, child] of [...node.dirs.entries()].sort()) {
    out.push(...renderDir(child, relPath ? `${relPath}/${name}` : name));
  }
  out.push("  }");
  return out;
}

lines.push(...renderDir(rootDir, "", true));

// Intra-file calls stay function-level; cross-file calls are collapsed into a
// single file -> file edge to avoid a tangle of parallel lines between files.
const seenEdges = new Set<string>();
const seenFileEdges = new Set<string>();
for (const [id, called] of calls) {
  const fromFile = id.split("::")[0]!;
  for (const callee of called) {
    const targets = defs.get(callee);
    if (!targets) continue; // not a function in this repo
    for (const targetFile of targets) {
      if (targetFile === fromFile) {
        const targetId = defId(targetFile, callee);
        const key = `${id}->${targetId}`;
        if (seenEdges.has(key)) continue;
        seenEdges.add(key);
        lines.push(`  "${esc(id)}" -> "${esc(targetId)}";`);
      } else {
        const key = `${fromFile}->${targetFile}`;
        if (seenFileEdges.has(key)) continue;
        seenFileEdges.add(key);
        lines.push(`  "${esc(fromFile)}" -> "${esc(targetFile)}";`);
      }
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
