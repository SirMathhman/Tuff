// Fails if directories depend on each other in a cycle. A package is a directory; each import
// between two different directories is one edge between them.
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";

/**
 * Turns a file dependency graph into a directory graph, dropping edges within one directory.
 *
 * @param fileGraph - Each file mapped to the files it imports.
 * @returns Each directory mapped to the directories it imports.
 */
function directoryGraph(fileGraph) {
  const graph = new Map();
  for (const [file, imports] of Object.entries(fileGraph)) {
    const from = dirname(file);
    const edges = graph.get(from) ?? new Set();
    for (const target of imports) {
      const to = dirname(target);
      if (to !== from) edges.add(to);
    }
    graph.set(from, edges);
  }
  return graph;
}

/**
 * Finds the cycles in a directory graph by depth-first search.
 *
 * @param graph - Each directory mapped to the directories it imports.
 * @returns The cycles found, each as the list of directories in order, closing back on the first.
 */
function findCycles(graph) {
  const cycles = [];
  const done = new Set();
  /**
   * Walks the graph from one directory, recording a cycle whenever an edge reaches a directory on the current path.
   *
   * @param node - The directory being visited.
   * @param path - The directories on the current path, in order.
   */
  function visit(node, path) {
    if (path.includes(node)) {
      cycles.push([...path.slice(path.indexOf(node)), node]);
      return;
    }
    if (done.has(node)) return;
    for (const next of graph.get(node) ?? []) visit(next, [...path, node]);
    done.add(node);
  }
  for (const node of graph.keys()) visit(node, []);
  return cycles;
}

const fileGraph = JSON.parse(
  execFileSync(
    process.execPath,
    ["node_modules/madge/bin/cli.js", "--json", "--extensions", "ts", "--ts-config", "tsconfig.json", "."],
    { encoding: "utf8" },
  ),
);
const cycles = findCycles(directoryGraph(fileGraph));
if (cycles.length > 0) {
  for (const cycle of cycles) {
    console.error(`package cycle: ${cycle.map((dir) => (dir === "." ? "(root)" : dir)).join(" -> ")}`);
  }
  process.exit(1);
}
console.log("packages: no cyclical dependencies between directories");
