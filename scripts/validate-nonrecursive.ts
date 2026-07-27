/**
 * Statically analyzes a TypeScript file with ts-morph and flags recursive
 * functions (direct self-calls and indirect/mutual-recursion cycles) via
 * call-graph cycle detection. Intended as a CLI validation gate: exits 2 if
 * any recursive function is found, exits 0 if the file is clean.
 *
 * Scope: syntactic, name-based static analysis. It does not track
 * reassigned function references, callback/higher-order indirection,
 * .call()/.apply()/.bind(), computed member access, or `this.foo()` method
 * calls — those are intentionally out of scope for this tool.
 */
import path from "node:path";
import {
  Project,
  ScriptTarget,
  SyntaxKind,
  Node,
  type CallExpression,
  type FunctionDeclaration,
  type FunctionExpression,
  type ArrowFunction,
  type MethodDeclaration,
} from "ts-morph";

type FunctionLikeNode =
  FunctionDeclaration | FunctionExpression | ArrowFunction | MethodDeclaration;

const FUNCTION_LIKE_KINDS = new Set<SyntaxKind>([
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.FunctionExpression,
  SyntaxKind.ArrowFunction,
  SyntaxKind.MethodDeclaration,
]);

interface FunctionInfo {
  name: string;
  node: FunctionLikeNode;
  line: number;
  column: number;
}

export interface RecursionViolation {
  /** Function names forming the cycle, e.g. ["f", "g", "f"] (closed loop). */
  cycle: string[];
  isSelfLoop: boolean;
  /** "name (file:line:col)" for each function in the cycle, in order. */
  locations: string[];
  /** "caller calls callee at file:line:col" for each edge in the cycle. */
  callSites: string[];
}

function isFunctionLike(node: Node): node is FunctionLikeNode {
  return FUNCTION_LIKE_KINDS.has(node.getKind());
}

function getFunctionName(node: FunctionLikeNode): string {
  const declaredName = "getName" in node ? node.getName() : undefined;
  if (declaredName) return declaredName;

  const parent = node.getParent();
  if (parent && Node.isVariableDeclaration(parent)) {
    return parent.getName();
  }

  const { line, column } = node
    .getSourceFile()
    .getLineAndColumnAtPos(node.getStart());
  return `<anonymous@${line}:${column}>`;
}

function collectFunctions(
  sourceFile: import("ts-morph").SourceFile,
): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  sourceFile.forEachDescendant((node) => {
    if (!isFunctionLike(node)) return;
    const { line, column } = sourceFile.getLineAndColumnAtPos(node.getStart());
    functions.push({ name: getFunctionName(node), node, line, column });
  });
  return functions;
}

function buildCallGraph(functions: FunctionInfo[]): {
  graph: Map<string, Set<string>>;
  callSites: Map<string, CallExpression>;
} {
  const namesInFile = new Set(functions.map((f) => f.name));
  const graph = new Map<string, Set<string>>();
  const callSites = new Map<string, CallExpression>();

  for (const fn of functions) {
    const edges = graph.get(fn.name) ?? new Set<string>();
    graph.set(fn.name, edges);

    const body = fn.node.getBody();
    if (!body) continue;

    const calls = body.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const call of calls) {
      const callee = call.getExpression();
      if (!Node.isIdentifier(callee)) continue;
      const calleeName = callee.getText();
      if (!namesInFile.has(calleeName)) continue;

      edges.add(calleeName);
      const edgeKey = `${fn.name}->${calleeName}`;
      if (!callSites.has(edgeKey)) callSites.set(edgeKey, call);
    }
  }

  return { graph, callSites };
}

function normalizeCycleSignature(cycle: string[]): string {
  // cycle is closed (first === last); rotate the open part so the
  // lexicographically-smallest name is first, for de-duplication.
  const open = cycle.slice(0, -1);
  let minIndex = 0;
  for (let i = 1; i < open.length; i++) {
    if (open[i]! < open[minIndex]!) minIndex = i;
  }
  const rotated = [...open.slice(minIndex), ...open.slice(0, minIndex)];
  return rotated.join("->");
}

function findCycles(graph: Map<string, Set<string>>): string[][] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const name of graph.keys()) color.set(name, WHITE);

  const path: string[] = [];
  const cycles: string[][] = [];
  const seenSignatures = new Set<string>();

  function visit(node: string) {
    color.set(node, GRAY);
    path.push(node);

    for (const callee of graph.get(node) ?? []) {
      const calleeColor = color.get(callee);
      if (calleeColor === GRAY) {
        const startIndex = path.indexOf(callee);
        const cycle = [...path.slice(startIndex), callee];
        const signature = normalizeCycleSignature(cycle);
        if (!seenSignatures.has(signature)) {
          seenSignatures.add(signature);
          cycles.push(cycle);
        }
      } else if (calleeColor === WHITE) {
        visit(callee);
      }
    }

    path.pop();
    color.set(node, BLACK);
  }

  for (const name of graph.keys()) {
    if (color.get(name) === WHITE) visit(name);
  }

  return cycles;
}

export function analyzeFileForRecursion(
  filePath: string,
): RecursionViolation[] {
  const project = new Project({
    compilerOptions: { target: ScriptTarget.ESNext, allowJs: true },
  });
  const sourceFile = project.addSourceFileAtPath(filePath);

  const fileName = sourceFile.getBaseName();
  const functions = collectFunctions(sourceFile);
  const functionsByName = new Map(functions.map((f) => [f.name, f]));
  const { graph, callSites } = buildCallGraph(functions);
  const cycles = findCycles(graph);

  return cycles.map((cycle) => {
    const isSelfLoop = cycle.length === 2 && cycle[0] === cycle[1];

    const locations = cycle.map((name) => {
      const fn = functionsByName.get(name);
      return fn ? `${name} (${fileName}:${fn.line}:${fn.column})` : name;
    });

    const callSiteLines: string[] = [];
    for (let i = 0; i < cycle.length - 1; i++) {
      const caller = cycle[i]!;
      const callee = cycle[i + 1]!;
      const call = callSites.get(`${caller}->${callee}`);
      if (call) {
        const { line, column } = sourceFile.getLineAndColumnAtPos(
          call.getStart(),
        );
        callSiteLines.push(
          `${caller} calls ${callee} at ${fileName}:${line}:${column}`,
        );
      }
    }

    return { cycle, isSelfLoop, locations, callSites: callSiteLines };
  });
}

export function formatViolations(
  filePath: string,
  violations: RecursionViolation[],
): string {
  const fileName = path.basename(filePath);
  if (violations.length === 0) {
    return `No recursive functions found in ${fileName}.`;
  }

  const blocks = violations.map((v) => {
    if (v.isSelfLoop) {
      const [location] = v.locations;
      const [callSite] = v.callSites;
      return `[RECURSION DETECTED] Direct recursion: ${location} calls itself${
        callSite ? ` at ${callSite.split(" at ")[1]}` : ""
      }`;
    }

    const chain = v.locations.join(" -> ");
    const callSiteLines = v.callSites.map((line) => `    ${line}`).join("\n");
    return [
      `[RECURSION DETECTED] Cycle of ${v.cycle.length - 1} function(s):`,
      `  ${chain}`,
      `  Call sites:`,
      callSiteLines,
    ].join("\n");
  });

  const summary = `Found ${violations.length} recursive cycle(s) in ${fileName}. Replace this with a loop and manual stack approach.`;
  return [...blocks, summary].join("\n\n");
}

function main() {
  const targetArg = process.argv[2];
  const targetPath = targetArg
    ? path.resolve(process.cwd(), targetArg)
    : path.resolve(import.meta.dir, "..", "index.ts");

  const violations = analyzeFileForRecursion(targetPath);
  console.log(formatViolations(targetPath, violations));

  process.exit(violations.length > 0 ? 2 : 0);
}

if (import.meta.main) {
  main();
}
