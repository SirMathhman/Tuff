#!/usr/bin/env bun
/**
 * Directory dependency validator
 * Ensures all directories (at any depth) in src don't have circular dependencies
 * Each directory is treated as a separate package (like Java packages)
 * E.g., compiler/parsing and compiler are separate packages
 * Exits with code 1 if circular dependencies found
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

function getAllDirectories(
  rootPath: string,
  basePath: string = "",
): string[] {
  if (!existsSync(rootPath)) return [];
  const dirs: string[] = [];

  const entries = readdirSync(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      const relPath = basePath ? `${basePath}/${entry.name}` : entry.name;
      dirs.push(relPath);
      // Recursively add subdirectories
      const subDirs = getAllDirectories(
        join(rootPath, entry.name),
        relPath,
      );
      dirs.push(...subDirs);
    }
  }

  return dirs;
}

function getFileDirectory(
  filePath: string,
  srcDir: string,
): string | undefined {
  const normalized = filePath.split("\\").join("/");
  const prefix = `${srcDir}/`;
  const prefixIndex = normalized.indexOf(prefix);
  if (prefixIndex === -1) return undefined;
  const afterPrefix = normalized.slice(prefixIndex + prefix.length);
  // Get the directory part (everything except the filename)
  const lastSlash = afterPrefix.lastIndexOf("/");
  if (lastSlash === -1) return undefined;
  return afterPrefix.slice(0, lastSlash);
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

function buildDirectoryGraph(
  madgeDeps: DependencyGraph,
  srcDir: string,
  allDirs: string[],
): DependencyGraph {
  const dirGraph: DependencyGraph = {};

  // Initialize graph with all directories
  for (const dir of allDirs) {
    dirGraph[dir] = [];
  }

  // Build directory-level dependency graph
  for (const [file, deps] of Object.entries(madgeDeps)) {
    const fromDir = getFileDirectory(file, srcDir);
    if (!fromDir) continue;

    for (const dep of deps) {
      const toDir = getFileDirectory(dep, srcDir);
      if (!toDir || toDir === fromDir) continue;

      // Add edge if not already present
      const edges = dirGraph[fromDir];
      if (!edges) continue;
      if (!edges.includes(toDir)) {
        edges.push(toDir);
      }
    }
  }

  return dirGraph;
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
  console.error("\n💡 How to fix circular directory dependencies:\n");
  console.error("1. Identify the architectural boundary:");
  console.error("   - Determine which direction the dependency should flow");
  console.error("   - Each directory (at any depth) is a separate package\n");
  console.error("2. Refactor to remove the cycle:");
  console.error("   - Extract shared code to a common parent directory or sibling");
  console.error("   - Use dependency injection to invert the dependency");
  console.error("   - Split modules to separate concerns\n");
  console.error("3. Example fix:");
  console.error("   - If compiler/parsing depends on compiler/transforms,");
  console.error("   - and compiler/transforms depends on compiler/parsing:");
  console.error("   - Extract the shared interface to compiler/shared or compiler\n");
}

function handleSuccess(): void {
  console.log("✓ No circular directory dependencies found");
  process.exit(0);
}

function handleFailure(cycles: CircularDependency[]): void {
  console.error("\n❌ Circular directory dependencies detected:");
  cycles.forEach(printCircularDependency);
  printSuggestions();
  process.exit(1);
}

function main() {
  const srcDir = "src/main/ts";
  const fullSrcPath = join(process.cwd(), srcDir);

  // Get all directories at any depth in src/main/ts
  const allDirs = getAllDirectories(fullSrcPath);

  if (allDirs.length === 0) {
    console.log("✓ No directories to check");
    process.exit(0);
  }

  console.log(`Checking directory dependencies: ${allDirs.join(", ")}`);

  // Get file-level dependencies from madge
  const madgeDeps = getMadgeDependencies(srcDir);

  // Build directory-level dependency graph
  const dirGraph = buildDirectoryGraph(madgeDeps, srcDir, allDirs);

  // Find circular dependencies
  const cycles = findAllCircularDependencies(dirGraph);

  if (cycles.length === 0) {
    handleSuccess();
  } else {
    handleFailure(cycles);
  }
}

main();
