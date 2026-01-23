#!/usr/bin/env bun
/**
 * Subdirectory dependency validator
 * Ensures subdirectories in src don't have circular dependencies with each other
 * E.g., core should not depend on eval, and eval should not depend on core in a cycle
 * Exits with code 1 if circular subdirectory dependencies found
 */

import { execSync } from "child_process";
import { existsSync, readdirSync } from "fs";
import { join } from "path";

interface DependencyGraph {
  [key: string]: string[];
}

interface CircularDependency {
  from: string;
  to: string;
  path: string[];
}

function getSubdirectories(rootPath: string): string[] {
  if (!existsSync(rootPath)) return [];
  return readdirSync(rootPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name);
}

function getFileSubdirectory(
  filePath: string,
  srcDir: string,
): string | undefined {
  const normalized = filePath.split("\\").join("/");
  const prefix = `${srcDir}/`;
  const prefixIndex = normalized.indexOf(prefix);
  if (prefixIndex === -1) return undefined;
  const afterPrefix = normalized.slice(prefixIndex + prefix.length);
  const slashIndex = afterPrefix.indexOf("/");
  if (slashIndex === -1) return undefined;
  return afterPrefix.slice(0, slashIndex);
}

function getMadgeDependencies(srcDir: string): DependencyGraph {
  try {
    const nvmNodePath = "/home/mathm/.nvm/versions/node/v24.13.0/bin";
    const output = execSync(`./node_modules/.bin/madge --json ${srcDir}`, {
      encoding: "utf-8",
      cwd: process.cwd(),
      shell: "/bin/bash",
      env: { ...process.env, PATH: `${nvmNodePath}:${process.env.PATH}` },
    });
    return JSON.parse(output);
  } catch (error) {
    console.error("Error running madge:", error);
    process.exit(1);
  }
}

function buildSubdirectoryGraph(
  madgeDeps: DependencyGraph,
  srcDir: string,
  subdirs: string[],
): DependencyGraph {
  const subdirGraph: DependencyGraph = {};
  
  // Initialize graph with all subdirectories
  for (const subdir of subdirs) {
    subdirGraph[subdir] = [];
  }

  // Build subdirectory-level dependency graph
  for (const [file, deps] of Object.entries(madgeDeps)) {
    const fromSubdir = getFileSubdirectory(file, srcDir);
    if (!fromSubdir) continue;

    for (const dep of deps) {
      const toSubdir = getFileSubdirectory(dep, srcDir);
      if (!toSubdir || toSubdir === fromSubdir) continue;

      // Add edge if not already present (guard in case fromSubdir wasn't initialized)
      const edges = subdirGraph[fromSubdir];
      if (!edges) continue;
      if (!edges.includes(toSubdir)) {
        edges.push(toSubdir);
      }
    }
  }

  return subdirGraph;
}

function findCircularPaths(
  graph: DependencyGraph,
  start: string,
  current: string,
  visited: Set<string>,
  path: string[],
  cycles: CircularDependency[],
): void {
  if (visited.has(current)) {
    // Found a cycle - check if it includes the start node
    const cycleStartIndex = path.indexOf(current);
    if (cycleStartIndex !== -1) {
      const cyclePath = path.slice(cycleStartIndex);
      cycles.push({
        from: cyclePath[0]!,
        to: cyclePath[cyclePath.length - 1]!,
        path: [...cyclePath, current],
      });
    }
    return;
  }

  visited.add(current);
  path.push(current);

  const neighbors = graph[current] || [];
  for (const neighbor of neighbors) {
    findCircularPaths(graph, start, neighbor, visited, path, cycles);
  }

  path.pop();
  visited.delete(current);
}

function findAllCircularDependencies(
  graph: DependencyGraph,
): CircularDependency[] {
  const allCycles: CircularDependency[] = [];
  const uniqueCycles = new Set<string>();

  for (const node of Object.keys(graph)) {
    const visited = new Set<string>();
    const path: string[] = [];
    const cycles: CircularDependency[] = [];
    findCircularPaths(graph, node, node, visited, path, cycles);

    // Deduplicate cycles by creating a canonical representation
    for (const cycle of cycles) {
      const sortedPath = [...cycle.path].sort().join(" -> ");
      if (!uniqueCycles.has(sortedPath)) {
        uniqueCycles.add(sortedPath);
        allCycles.push(cycle);
      }
    }
  }

  return allCycles;
}

function printCircularDependency(cycle: CircularDependency): void {
  console.error(`\n🔄 Circular dependency detected:`);
  console.error(`   ${cycle.path.join(" → ")}`);
}

function printSuggestions(): void {
  console.error("\n💡 How to fix circular subdirectory dependencies:\n");
  console.error("1. Identify the architectural boundary:");
  console.error("   - Determine which direction the dependency should flow");
  console.error("   - Generally: utils/core ← parse ← eval\n");
  console.error("2. Refactor to remove the cycle:");
  console.error("   - Extract shared code to a common subdirectory (e.g., core or utils)");
  console.error("   - Use dependency injection to invert the dependency");
  console.error("   - Split modules to separate concerns\n");
  console.error("3. Example fix:");
  console.error("   - If eval depends on core, and core depends on eval:");
  console.error("   - Extract the shared interface to core");
  console.error("   - Pass implementation from eval to core via parameters\n");
}

function handleSuccess(): void {
  console.log("✓ No circular subdirectory dependencies found");
  process.exit(0);
}

function handleFailure(cycles: CircularDependency[]): void {
  console.error("\n❌ Circular subdirectory dependencies detected:");
  cycles.forEach(printCircularDependency);
  printSuggestions();
  process.exit(1);
}

function main() {
  const srcDir = "src";
  const fullSrcPath = join(process.cwd(), srcDir);
  
  // Get all subdirectories in src
  const subdirs = getSubdirectories(fullSrcPath);
  
  if (subdirs.length === 0) {
    console.log("✓ No subdirectories to check");
    process.exit(0);
  }

  console.log(`Checking subdirectory dependencies: ${subdirs.join(", ")}`);

  // Get file-level dependencies from madge
  const madgeDeps = getMadgeDependencies(srcDir);

  // Build subdirectory-level dependency graph
  const subdirGraph = buildSubdirectoryGraph(madgeDeps, srcDir, subdirs);

  // Find circular dependencies
  const cycles = findAllCircularDependencies(subdirGraph);

  if (cycles.length === 0) {
    handleSuccess();
  } else {
    handleFailure(cycles);
  }
}

main();
