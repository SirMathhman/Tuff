import { tokenize } from "./tokenize";
import type {
  Token,
  Result,
  CompileError,
  Statement,
  ModuleExportsMap,
  ModuleExportInfo,
  LetDeclarationNode,
} from "./types";
import { parseStatement } from "./parse-statements";
import type { ParseContext } from "./parse-expressions";

function parse(tokens: Token[]): Result<Statement[], CompileError> {
  const ctx: ParseContext = { tokens, pos: 0 };
  const statements: Statement[] = [];
  while (!isEof(ctx)) {
    const stmt = parseStatement(ctx);
    if (!stmt.isOk) return stmt;
    statements.push(stmt.value);
  }
  return { isOk: true, value: statements };
}

function isEof(ctx: ParseContext): boolean {
  return ctx.pos >= ctx.tokens.length;
}

import { analyzeSemantics } from "./semantic";
import { generateCode } from "./generate";

function compilePipeline(
  tuffSource: string,
  moduleMode = false,
  moduleExports?: ModuleExportsMap,
): Result<string, CompileError> {
  const tokensResult = tokenize(tuffSource);
  if (!tokensResult.isOk) return tokensResult;
  const statementsResult = parse(tokensResult.value);
  if (!statementsResult.isOk) return statementsResult;
  const semanticResult = analyzeSemantics(
    statementsResult.value,
    moduleMode ? moduleExports : undefined,
  );
  if (!semanticResult.isOk) return semanticResult;
  return {
    isOk: true,
    value: generateCode(semanticResult.value, moduleMode, moduleExports),
  };
}

export function compileTuffToTS(
  tuffSource: string,
): Result<string, CompileError> {
  if (tuffSource.length === 0) return { isOk: true, value: "process.exit(0)" };
  return compilePipeline(tuffSource);
}

export type SourceMap = Record<string, string>;

function collectModuleExports(
  source: string,
): Result<ModuleExportInfo[], CompileError> {
  const tokensResult = tokenize(source);
  if (!tokensResult.isOk) return tokensResult;
  const statementsResult = parse(tokensResult.value);
  if (!statementsResult.isOk) return statementsResult;
  const exports: ModuleExportInfo[] = [];
  for (const stmt of statementsResult.value) {
    if (
      stmt.type === "LetDeclaration" &&
      (stmt as LetDeclarationNode).exported
    ) {
      const ln = stmt as LetDeclarationNode;
      exports.push({ name: ln.name, typeName: ln.typeName });
    }
  }
  return { isOk: true, value: exports };
}

export function compileTuffToTSWithModules(
  mainNamespace: string[],
  sourceMap: SourceMap,
): Result<SourceMap, CompileError> {
  const moduleExports: ModuleExportsMap = {};
  for (const [namespace, source] of Object.entries(sourceMap)) {
    const moduleName = namespace.replace(/\./g, "::");
    const exportsResult = collectModuleExports(source);
    if (!exportsResult.isOk) return exportsResult;
    moduleExports[moduleName] = exportsResult.value;
  }
  const result: SourceMap = {};
  for (const [namespace, source] of Object.entries(sourceMap)) {
    const compiled = compilePipeline(source, true, moduleExports);
    if (!compiled.isOk) return compiled;
    result[namespace] = compiled.value;
  }
  return { isOk: true, value: result };
}
