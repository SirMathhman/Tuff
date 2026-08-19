import madge from "madge";

// The goal is to prevent circular references between "packages" (directories).
// `madge --circular` only catches file-level cycles; this goes one level up and
// detects cycles between whole directories, e.g. `src` importing `src/evaluator`
// while `src/evaluator` imports back into `src`.

/** The package (directory) a file path belongs to; files at the root map to ".". */
function packageOf(file: string): string {
  const parts = file.replace(/\\/g, "/").split("/");
  parts.pop(); // drop the file name
  return parts.length > 0 ? parts.join("/") : ".";
}

/** Collapse a file-level dependency graph into a package-level one (self-edges dropped). */
function toPackageGraph(graph: Record<string, string[]>): Map<string, string[]> {
  const edges = new Map<string, Set<string>>();
  for (const [file, deps] of Object.entries(graph)) {
    const from = packageOf(file);
    for (const dep of deps) {
      const to = packageOf(dep);
      if (from === to) {
        continue; // intra-package edges are not cross-package cycles
      }
      if (!edges.has(from)) {
        edges.set(from, new Set());
      }
      edges.get(from)!.add(to);
    }
  }
  return new Map([...edges].map(([from, to]) => [from, [...to]]));
}

/** Find all elementary cycles in a directed graph, deduplicated by node set. */
function findCycles(graph: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const seen = new Set<string>();

  const visit = (start: string, current: string, path: string[], onPath: Set<string>): void => {
    for (const next of graph.get(current) ?? []) {
      if (next === start) {
        const key = [...path].sort().join("|");
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push([...path]);
        }
      } else if (!onPath.has(next)) {
        onPath.add(next);
        visit(start, next, [...path, next], onPath);
        onPath.delete(next);
      }
    }
  };

  for (const node of graph.keys()) {
    visit(node, node, [node], new Set([node]));
  }
  return cycles;
}

madge("./src", { fileExtensions: ["ts"] }).then((instance) => {
  const packageGraph = toPackageGraph(instance.obj());
  const cycles = findCycles(packageGraph);

  if (cycles.length === 0) {
    console.log("No circular package dependencies found.");
    return;
  }

  console.error("Circular package dependencies detected:");
  for (const cycle of cycles) {
    console.error(`  ${[...cycle, cycle[0]].join(" -> ")}`);
  }
  process.exitCode = 2;
});
