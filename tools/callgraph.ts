// Generates callgraph.svg: a Graphviz call graph of all functions in the repo.
// Usage: bun tools/callgraph.ts
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import * as ts from "typescript";
import {
  renderGraph,
  type Box,
  type GroupBox,
  type LeafBox,
} from "./graphsvg.ts";

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

/**
 * A function definition found in a source file.
 */
interface FunctionDef {
  name: string;
  node: ts.FunctionLikeDeclaration;
}

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);

  const functions: FunctionDef[] = [];

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

// Group nodes by file so each file is drawn as a labeled box.
const byFile = new Map<string, string[]>();
for (const id of calls.keys()) {
  const file = id.split("::")[0]!;
  const list = byFile.get(file) ?? [];
  list.push(id);
  byFile.set(file, list);
}

// Build a directory tree so nested folders (e.g. src > parser) render as
// nested boxes, each labeled with just its own name rather than the path.
interface DirNode {
  name: string; // basename; "" for the repo root
  files: string[]; // full relative paths of files directly in this dir
  dirs: Map<string, DirNode>;
}

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

const leaves = new Map<string, LeafBox>();
for (const [file, ids] of byFile) {
  leaves.set(file, {
    kind: "leaf",
    id: file,
    label: file.replace(/\\/g, "/").split("/").pop()!,
    nodes: ids.map((id) => ({ id, label: id.split("::")[1]! })),
    edges: [],
  });
}

// Every box that can own edges, and, per file, the boxes enclosing it from the
// root inwards -- the pair of chains for a call locates the boxes its arrow
// should join, and the box that arrow is drawn in.
const groups = new Map<string, GroupBox>();
const chains = new Map<string, string[]>();

// A directory is drawn as its own box unless it holds a single file and no
// subdirectories, in which case that file's box stands in for it.
function buildDir(node: DirNode, relPath: string, ancestors: string[]): Box {
  if (node.dirs.size === 0 && node.files.length === 1) {
    const file = node.files[0]!;
    chains.set(file, [...ancestors, file]);
    return leaves.get(file)!;
  }
  const id = `dir:${relPath}`;
  const here = [...ancestors, id];
  const group: GroupBox = {
    kind: "group",
    id,
    label: node.name || ".",
    children: [],
    edges: [],
  };
  groups.set(id, group);
  for (const file of node.files) {
    chains.set(file, [...here, file]);
    group.children.push(leaves.get(file)!);
  }
  for (const [name, child] of [...node.dirs.entries()].sort()) {
    const childPath = relPath ? `${relPath}/${name}` : name;
    group.children.push(buildDir(child, childPath, here));
  }
  return group;
}

const rootBox: GroupBox = {
  kind: "group",
  id: "dir:",
  label: "",
  children: [],
  edges: [],
};
groups.set(rootBox.id, rootBox);
for (const file of rootDir.files) {
  chains.set(file, [rootBox.id, file]);
  rootBox.children.push(leaves.get(file)!);
}
for (const [name, child] of [...rootDir.dirs.entries()].sort()) {
  rootBox.children.push(buildDir(child, name, [rootBox.id]));
}

// Intra-file calls stay function-level; cross-file calls are collapsed into a
// single box -> box edge to avoid a tangle of parallel lines between files.
const seenEdges = new Set<string>();
function addEdge(edges: [string, string][], from: string, to: string): void {
  const key = `${from}->${to}`;
  if (seenEdges.has(key)) return;
  seenEdges.add(key);
  edges.push([from, to]);
}

for (const [id, called] of calls) {
  const fromFile = id.split("::")[0]!;
  for (const callee of called) {
    const targets = defs.get(callee);
    if (!targets) continue; // not a function in this repo
    for (const targetFile of targets) {
      if (targetFile === fromFile) {
        addEdge(leaves.get(fromFile)!.edges, id, defId(targetFile, callee));
        continue;
      }
      // Attach the edge to the outermost box holding one file but not the
      // other, so a call leaving a directory is drawn as the directory's
      // arrow rather than one escaping from a file nested inside it.
      const fromChain = chains.get(fromFile)!;
      const targetChain = chains.get(targetFile)!;
      let depth = 0;
      while (fromChain[depth] === targetChain[depth]) depth++;
      const owner = groups.get(fromChain[depth - 1]!)!;
      addEdge(owner.edges, fromChain[depth]!, targetChain[depth]!);
    }
  }
}

const { svg, sources } = renderGraph(rootBox);
const docsDir = join(root, "docs");
mkdirSync(docsDir, { recursive: true });
const dotPath = join(docsDir, "callgraph.dot");
const svgPath = join(docsDir, "callgraph.svg");
writeFileSync(svgPath, svg);
writeFileSync(dotPath, sources.join("\n\n"));

console.log(`wrote ${relative(root, svgPath)} (${calls.size} functions)`);
