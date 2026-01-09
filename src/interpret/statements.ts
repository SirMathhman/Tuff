import { splitTopLevelStatements } from "../parser";
import { evaluateReturningOperand } from "../eval";
import {
  getLastTopLevelStatement,
  evaluateRhs,
  extractAssignmentParts,
  convertOperandToNumber,
  registerFunctionFromStmt,
  parseStructDef,
  parseFnComponents,
} from "../interpret_helpers";
import { handleWhileStatement, handleForStatement } from "./loop_handlers";
import { handleIfStatement } from "./if_handlers";
import {
  handleExternFn,
  handleExternLet,
  handleImportStatement,
} from "./extern_handlers";
import { handleLetStatement } from "./let_handlers";
import { handleAssignmentStatement } from "./assignment_statement";
import { Env, envClone, envGet, envSet } from "../env";
import type { InterpretFn } from "../types";
import { isPlainObject, toErrorMessage } from "../types";

type BlockCtx = {
  env: Env;
  localEnv: Env;
  declared: Set<string>;
  interpret: InterpretFn;
  evaluateRhsLocal: (rhs: string, envLocal: Env) => unknown;
  getLastTopLevelStatementLocal: (s: string) => string | undefined;
};

function interpretTrailingExprOrUndefined(ctx: BlockCtx, tExpr: string | undefined) {
  if (tExpr)
    return { handled: true, last: ctx.interpret(tExpr + ";", ctx.localEnv) };
  return { handled: true, last: undefined };
}

function handleOutFnStatement(ctx: BlockCtx, stmt: string) {
  const stripped = stmt.replace(/^out\s+/, "");
  const parsed = parseFnComponents(stripped);
  const tExpr = registerFunctionFromStmt(stripped, ctx.localEnv, ctx.declared);
  const __exports = envGet(ctx.localEnv, "__exports");
  if (isPlainObject(__exports))
    __exports[parsed.name] = envGet(ctx.localEnv, parsed.name);
  return interpretTrailingExprOrUndefined(ctx, tExpr);
}

function handleFnDeclaration(ctx: BlockCtx, stmt: string) {
  const tExpr = registerFunctionFromStmt(stmt, ctx.localEnv, ctx.declared);
  return interpretTrailingExprOrUndefined(ctx, tExpr);
}

function handleStructDefinition(ctx: BlockCtx, stmt: string) {
  const structDef = parseStructDef(stmt);
  if (ctx.declared.has(structDef.name))
    throw new Error("duplicate declaration");
  ctx.declared.add(structDef.name);
  envSet(ctx.localEnv, structDef.name, {
    isStructDef: true,
    name: structDef.name,
    fields: structDef.fields,
  });
  const remaining = stmt.slice(structDef.endPos).trim();
  if (remaining)
    return {
      handled: true,
      last: ctx.interpret(remaining + ";", ctx.localEnv),
    };
  return { handled: true, last: undefined };
}

function handleYieldStatement(ctx: BlockCtx, stmt: string) {
  const m = stmt.match(/^yield\s+([\s\S]+)$/);
  if (!m) throw new Error("yield requires an expression");
  const rhs = m[1].trim();
  if (!rhs) throw new Error("yield requires an expression");
  const rhsOperand = ctx.evaluateRhsLocal(rhs, ctx.localEnv);
  throw { __yield: convertOperandToNumber(rhsOperand) };
}

function handleTypeAliasDeclaration(ctx: BlockCtx, stmt: string) {
  const m = stmt.match(/^type\s+([a-zA-Z_]\w*)\s*=\s*([^;]+);?$/);
  if (!m) throw new Error("invalid type declaration");
  const name = m[1];
  const alias = m[2].trim();
  if (ctx.declared.has(name)) throw new Error("duplicate declaration");
  ctx.declared.add(name);
  envSet(ctx.localEnv, name, { typeAlias: alias });
  return { handled: true, last: undefined };
}

function handleLeadingDeclarations(ctx: BlockCtx, stmt: string) {
  if (/^out\s+fn\b/.test(stmt)) return handleOutFnStatement(ctx, stmt);
  if (/^extern\s+fn\b/.test(stmt)) {
    handleExternFn(stmt, ctx.localEnv, ctx.declared);
    return { handled: true, last: undefined };
  }
  if (/^extern\s+let\b/.test(stmt)) {
    handleExternLet(stmt, ctx.localEnv, ctx.declared);
    return { handled: true, last: undefined };
  }
  if (/^extern\b/.test(stmt) || /^from\b/.test(stmt)) {
    handleImportStatement(stmt, ctx.env, ctx.localEnv, ctx.declared);
    return { handled: true, last: undefined };
  }
  if (/^fn\b/.test(stmt)) return handleFnDeclaration(ctx, stmt);
  return { handled: false, last: undefined };
}

function handleNonLeadingStatement(ctx: BlockCtx, stmt: string) {
  if (/^yield\b/.test(stmt)) {
    handleYieldStatement(ctx, stmt);
    return { handled: true };
  }

  if (/^let\b/.test(stmt)) {
    const res = handleLetStatement(
      stmt,
      ctx.localEnv,
      ctx.declared,
      ctx.evaluateRhsLocal,
      evaluateReturningOperand
    );
    if (res.handled) return { handled: true, last: res.last };
    return { handled: true, last: undefined };
  }

  if (/^type\b/.test(stmt)) return handleTypeAliasDeclaration(ctx, stmt);
  if (/^struct\b/.test(stmt)) return handleStructDefinition(ctx, stmt);
  if (handleIfStatement(stmt, ctx.localEnv, ctx.interpret))
    return { handled: true, last: undefined };
  if (handleWhileStatement(stmt, ctx.localEnv, ctx.interpret))
    return { handled: true, last: undefined };
  if (handleForStatement(stmt, ctx.localEnv, ctx.interpret))
    return { handled: true, last: undefined };

  const assignParts = extractAssignmentParts(stmt);
  if (assignParts) {
    const res = handleAssignmentStatement(
      assignParts,
      ctx.localEnv,
      ctx.evaluateRhsLocal,
      convertOperandToNumber
    );
    return { handled: true, last: res.last };
  }

  const last = evalBracedBlockAndTrailingExpression(
    stmt,
    ctx.localEnv,
    ctx.interpret,
    evaluateReturningOperand
  );
  return { handled: true, last };
}

export function interpretBlock(
  s: string,
  env: Env,
  interpret: InterpretFn
): number {
  return interpretBlockInternal(s, env, interpret, false);
}

function interpretBlockInternal(
  s: string,
  env: Env,
  interpret: InterpretFn,
  inPlace: boolean
): number {
  // Block evaluator with lexical scoping. When inPlace=true, operate directly
  // on the provided env (used for top-level sequences and function call envs).
  const localEnv: Env = inPlace ? env : envClone(env);
  const declared = new Set<string>();
  let last: unknown = undefined;

  const getLastTopLevelStatementLocal = (str: string) =>
    getLastTopLevelStatement(str, splitTopLevelStatements);
  const evaluateRhsLocal = (rhs: string, envLocal: Env) =>
    evaluateRhs(rhs, envLocal, interpret, getLastTopLevelStatementLocal);
  const ctx: BlockCtx = {
    env,
    localEnv,
    declared,
    interpret,
    evaluateRhsLocal,
    getLastTopLevelStatementLocal,
  };

  const stmts = splitTopLevelStatements(s);

  for (let raw of stmts) {
    const stmt = raw.trim();
    if (!stmt) continue;

    const leading = handleLeadingDeclarations(ctx, stmt);
    if (leading.handled) {
      last = leading.last;
      continue;
    }

    const nonLeading = handleNonLeadingStatement(ctx, stmt);
    last = nonLeading.last;
  }
  // if the block/sequence contained only statements (no final expression), return 0
  if (last === undefined) return 0;
  // convert last to number
  return convertOperandToNumber(last);
}

// Variant of interpretBlock that mutates the provided env in-place. This is used
// when executing function block bodies so inner declarations (like nested fn)
// remain visible for subsequent evaluation of `this` within the same call env.
export function interpretBlockInPlace(
  s: string,
  env: Env,
  interpret: InterpretFn
): number {
  return interpretBlockInternal(s, env, interpret, true);
}

/**
 * Evaluate a leading sequence of braced blocks (e.g., `{ ... } { ... }`) and
 * then a trailing expression if present. Returns the resulting value (or
 * undefined when nothing is present).
 */
function evalBracedBlockAndTrailingExpression(
  starting: string,
  localEnv: Env,
  interpret: InterpretFn,
  evaluateReturningOperandFn: (expr: string, localEnv: Env) => unknown
): unknown {
  let remaining = starting;
  let last: unknown = undefined;

  while (true) {
    if (/^\s*$/.test(remaining)) {
      // nothing left; preserve last (do not overwrite) and exit
      break;
    }
    const trimmed = remaining.trimStart();
    if (trimmed[0] === "{") {
      // find matching closing brace for the leading braced block
      let depth = 0;
      let endIdx = -1;
      const startIdx = remaining.indexOf("{");
      for (let j = startIdx; j < remaining.length; j++) {
        const ch = remaining[j];
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) {
            endIdx = j;
            break;
          }
        }
      }
      if (endIdx === -1) throw new Error("unbalanced braces in statement");
      const block = remaining.slice(startIdx, endIdx + 1);
      // Evaluate as a braced block so inner declarations stay scoped.
      last = interpret(block, localEnv);
      remaining = remaining.slice(endIdx + 1);
      continue;
    }

    // No leading block left; treat the remainder as a single expression
    const expr = remaining.replace(/^[;\s]*/, "");
    if (/^\s*$/.test(expr)) {
      last = undefined;
      break;
    }
    try {
      last = evaluateReturningOperandFn(expr, localEnv);
    } catch (e: unknown) {
      if (toErrorMessage(e) === "invalid expression") {
        // Fall back to interpret for inputs that aren't valid single expressions
        last = interpret(expr, localEnv);
      } else throw e;
    }
    break;
  }

  return last;
}
