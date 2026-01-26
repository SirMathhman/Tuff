#!/usr/bin/env bun
import { join, relative } from "path";
import { execSync } from "child_process";
import {
  ArrowFunction,
  FunctionDeclaration,
  FunctionExpression,
  Identifier,
  Node,
  Project,
  SourceFile,
  VariableDeclaration,
} from "ts-morph";

const DEFAULT_MAX_LINES_PER_FUNCTION = 80;
const INLINE_PADDING_LINES = 5;
const ESLINT_CONFIG_PATH = join(process.cwd(), "eslint.config.mjs");

function getGitTouchedFiles(): Set<string> {
  try {
    const output = execSync("/usr/bin/git diff --cached --name-only", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const files = output.split("\n").filter((f) => f.length > 0);
    return new Set(files.map((f) => join(process.cwd(), f)));
  } catch {
    return new Set();
  }
}

type FunctionLike =
  | FunctionDeclaration
  | FunctionExpression
  | ArrowFunction;

interface NamedFunction {
  name: string;
  nameNode: Identifier;
  node: FunctionLike;
  lines: number;
  filePath: string;
}

interface CallReference {
  caller: FunctionLike;
  callerName: string;
  callerLines: number;
  callerPath: string;
  referenceLine: number;
}

interface InlineCandidate {
  functionName: string;
  functionPath: string;
  functionLine: number;
  functionLines: number;
  callerName: string;
  callerPath: string;
  callerLines: number;
  referenceLine: number;
  totalLines: number;
}

function toConfigArray(config: unknown): unknown[] {
  if (Array.isArray(config)) return config;
  if (config === undefined) return [];
  return [config];
}

function extractMaxFromRule(rule: unknown): number | undefined {
  if (!Array.isArray(rule)) return undefined;
  const options = rule[1];
  if (!options || typeof options !== "object") return undefined;
  const maxValue = (options as { max?: unknown }).max;
  if (typeof maxValue !== "number") return undefined;
  return maxValue;
}

async function loadMaxLinesPerFunction(): Promise<number> {
  try {
    const configModule = await import(ESLINT_CONFIG_PATH);
    const configArray = toConfigArray(configModule.default);
    for (const entry of configArray) {
      if (!entry || typeof entry !== "object") continue;
      const rules = (entry as { rules?: unknown }).rules;
      if (!rules || typeof rules !== "object") continue;
      const rule = (rules as Record<string, unknown>)[
        "max-lines-per-function"
      ];
      const maxValue = extractMaxFromRule(rule);
      if (maxValue !== undefined) return maxValue;
    }
  } catch (error) {
    console.error("Failed to read eslint.config.mjs; using default max lines", error);
  }
  return DEFAULT_MAX_LINES_PER_FUNCTION;
}

function createProject(): Project {
  return new Project({
    tsConfigFilePath: join(process.cwd(), "tsconfig.json"),
  });
}

function loadSourceFiles(project: Project): SourceFile[] {
  project.addSourceFilesAtPaths(["src/main/ts/**/*.ts", "src/test/ts/**/*.ts"]);
  return project.getSourceFiles();
}

function createNamedFunctionFromDeclaration(
  declaration: FunctionDeclaration,
): NamedFunction | undefined {
  const nameNode = declaration.getNameNode();
  if (!nameNode) return undefined;
  return {
    name: nameNode.getText(),
    nameNode,
    node: declaration,
    lines: declaration.getEndLineNumber() - declaration.getStartLineNumber() + 1,
    filePath: declaration.getSourceFile().getFilePath(),
  };
}

function collectNamedFunctions(files: SourceFile[]): NamedFunction[] {
  const namedFunctions: NamedFunction[] = [];
  for (const file of files) {
    for (const declaration of file.getFunctions()) {
      const named = createNamedFunctionFromDeclaration(declaration);
      if (named) namedFunctions.push(named);
    }
    for (const declaration of file.getVariableDeclarations()) {
      const named = createNamedFunctionFromVariable(declaration);
      if (named) namedFunctions.push(named);
    }
  }
  return namedFunctions;
}

function createNamedFunctionFromVariable(
  declaration: VariableDeclaration,
): NamedFunction | undefined {
  const initializer = declaration.getInitializer();
  if (!initializer || (!Node.isArrowFunction(initializer) && !Node.isFunctionExpression(initializer))) return undefined;
  const nameNode = declaration.getNameNode();
  if (!Node.isIdentifier(nameNode)) return undefined;
  return {
    name: nameNode.getText(),
    nameNode,
    node: initializer,
    lines: initializer.getEndLineNumber() - initializer.getStartLineNumber() + 1,
    filePath: declaration.getSourceFile().getFilePath(),
  };
}

function getCallReferences(named: NamedFunction): CallReference[] {
  const references = named.nameNode.findReferences();
  const callReferences: CallReference[] = [];
  for (const reference of references) {
    for (const refEntry of reference.getReferences()) {
      if (refEntry.isDefinition()) continue;
      const node = refEntry.getNode();
      const parent = node.getParent();
      if (!parent || !Node.isCallExpression(parent) || parent.getExpression() !== node) continue;
      const caller = node.getFirstAncestor((ancestor) =>
        Node.isFunctionDeclaration(ancestor) || Node.isFunctionExpression(ancestor) || Node.isArrowFunction(ancestor),
      ) as FunctionLike | undefined;
      if (!caller) continue;
      const getName = (fn: FunctionLike): string => {
        if (Node.isFunctionDeclaration(fn) || Node.isFunctionExpression(fn)) {
          const nameNode = fn.getNameNode();
          if (nameNode) return nameNode.getText();
        }
        const variable = fn.getFirstAncestor(Node.isVariableDeclaration);
        return variable ? variable.getName() : "<anonymous>";
      };
      callReferences.push({
        caller,
        callerName: getName(caller),
        callerLines: caller.getEndLineNumber() - caller.getStartLineNumber() + 1,
        callerPath: caller.getSourceFile().getFilePath(),
        referenceLine: node.getStartLineNumber(),
      });
    }
  }
  return callReferences;
}

function canInline(
  named: NamedFunction,
  callReference: CallReference,
  maxLinesPerFunction: number,
): InlineCandidate | undefined {
  const totalLines = callReference.callerLines + named.lines + INLINE_PADDING_LINES;
  if (totalLines > maxLinesPerFunction) return undefined;
  return {
    functionName: named.name,
    functionPath: relative(process.cwd(), named.filePath),
    functionLine: named.nameNode.getStartLineNumber(),
    functionLines: named.lines,
    callerName: callReference.callerName,
    callerPath: relative(process.cwd(), callReference.callerPath),
    callerLines: callReference.callerLines,
    referenceLine: callReference.referenceLine,
    totalLines,
  };
}

function filterByGitTouched(
  candidate: InlineCandidate,
  gitTouched: Set<string>,
): boolean {
  const calleeFullPath = join(process.cwd(), candidate.functionPath);
  const callerFullPath = join(process.cwd(), candidate.callerPath);
  return gitTouched.has(calleeFullPath) || gitTouched.has(callerFullPath);
}

function isValidCallerName(name: string): boolean {
  return name !== "<anonymous>" && !name.startsWith("{") && !name.startsWith("[");
}

function findInlineCandidates(
  namedFunctions: NamedFunction[],
  maxLinesPerFunction: number,
  gitTouched?: Set<string>,
): InlineCandidate[] {
  const candidates: InlineCandidate[] = [];
  for (const named of namedFunctions) {
    const callReferences = getCallReferences(named);
    if (callReferences.length !== 1) continue;
    const ref = callReferences[0];
    if (!ref || ref.caller === named.node || !isValidCallerName(ref.callerName)) continue;
    const candidate = canInline(named, ref, maxLinesPerFunction);
    if (!candidate || (gitTouched && !filterByGitTouched(candidate, gitTouched))) continue;
    candidates.push(candidate);
  }
  return candidates;
}

function printCandidate(candidate: InlineCandidate): void {
  console.error("Function has a single usage and can be inlined:");
  console.error(
    `- callee: ${candidate.functionName} (${candidate.functionPath}:${candidate.functionLine})`,
  );
  console.error(
    `- caller: ${candidate.callerName} (${candidate.callerPath}:${candidate.referenceLine})`,
  );
  console.error(
    `- lines: caller ${candidate.callerLines} + callee ${candidate.functionLines} + padding ${INLINE_PADDING_LINES} = ${candidate.totalLines}\n`,
  );
}

async function main(): Promise<void> {
  const gitFilesOnly = process.argv.includes("--git-files-only");
  const gitTouched = gitFilesOnly ? getGitTouchedFiles() : undefined;
  const project = createProject();
  const sourceFiles = loadSourceFiles(project);
  const namedFunctions = collectNamedFunctions(sourceFiles);
  const maxLinesPerFunction = await loadMaxLinesPerFunction();
  const candidates = findInlineCandidates(
    namedFunctions,
    maxLinesPerFunction,
    gitTouched,
  );
  if (candidates.length === 0) {
    console.log("No inline opportunities found");
    process.exit(0);
    return;
  }
  for (const candidate of candidates) printCandidate(candidate);
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
