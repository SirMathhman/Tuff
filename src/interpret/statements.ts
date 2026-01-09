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

  const stmts = splitTopLevelStatements(s);
  for (let raw of stmts) {
    const stmt = raw.trim();
    if (!stmt) continue;

    // export function: `out fn name(...) => ...` — register like a normal fn
    // and also export it on localEnv.__exports (if present)
    if (/^out\s+fn\b/.test(stmt)) {
      const stripped = stmt.replace(/^out\s+/, "");
      const parsed = parseFnComponents(stripped);
      const tExpr = registerFunctionFromStmt(stripped, localEnv, declared);
      const __exports = envGet(localEnv, "__exports");
      if (isPlainObject(__exports))
        __exports[parsed.name] = envGet(localEnv, parsed.name);
      if (tExpr) {
        last = interpret(tExpr + ";", localEnv);
      } else last = undefined;
      continue;
    }

    if (/^extern\s+fn\b/.test(stmt)) {
      handleExternFn(stmt, localEnv, declared);
      last = undefined;
      continue;
    }

    if (/^extern\s+let\b/.test(stmt)) {
      handleExternLet(stmt, localEnv, declared);
      last = undefined;
      continue;
    }

    // import statement: optionally prefixed with `extern`: `extern from <ns> use { a, b }`
    if (/^extern\b/.test(stmt) || /^from\b/.test(stmt)) {
      handleImportStatement(stmt, env, localEnv, declared);
      last = undefined;
      continue;
    }

    if (/^fn\b/.test(stmt)) {
      // Delegate parsing and registration to helper
      const tExpr = registerFunctionFromStmt(stmt, localEnv, declared);
      if (tExpr) {
        // Evaluate trailing expression as a statement sequence so function calls like
        // `add()` are executed (interpretExpression can strip calls like `()`).
        last = interpret(tExpr + ";", localEnv);
      } else last = undefined;
      continue;
    }

    // yield statement: `yield <expr>` causes immediate block-level return with <expr>
    if (/^yield\b/.test(stmt)) {
      const m = stmt.match(/^yield\s+([\s\S]+)$/);
      if (!m) throw new Error("yield requires an expression");
      const rhs = m[1].trim();
      if (!rhs) throw new Error("yield requires an expression");
      const rhsOperand = evaluateRhsLocal(rhs, localEnv);
      // throw a special marker that bubbles out of nested interpret() calls
      // until it is handled at the expression/initializer boundary
      throw { __yield: convertOperandToNumber(rhsOperand) };
    }

    // let statements handled by helper
    if (/^let\b/.test(stmt)) {
      const res = handleLetStatement(
        stmt,
        localEnv,
        declared,
        evaluateRhsLocal,
        evaluateReturningOperand
      );
      if (res.handled) last = res.last;
      continue;
    } else {
      // type alias: `type Name = <annotation>`
      if (/^type\b/.test(stmt)) {
        const m = stmt.match(/^type\s+([a-zA-Z_]\w*)\s*=\s*([^;]+);?$/);
        if (!m) throw new Error("invalid type declaration");
        const name = m[1];
        const alias = m[2].trim();
        if (declared.has(name)) throw new Error("duplicate declaration");
        declared.add(name);
        envSet(localEnv, name, { typeAlias: alias });
        last = undefined;
        continue;
      }

      // struct definition: struct Name { field1 : Type1; field2 : Type2; ... }
      if (/^struct\b/.test(stmt)) {
        const structDef = parseStructDef(stmt);
        if (declared.has(structDef.name))
          throw new Error("duplicate declaration");
        declared.add(structDef.name);
        envSet(localEnv, structDef.name, {
          isStructDef: true,
          name: structDef.name,
          fields: structDef.fields,
        });
        last = undefined;
        // If there's remaining content after the struct definition, parse it as an expression
        const remaining = stmt.slice(structDef.endPos).trim();
        if (remaining) {
          // Evaluate the remaining content as statements so trailing declarations
          // (e.g., a function following a struct declaration on the same line)
          // are handled correctly.
          last = interpret(remaining + ";", localEnv);
        }
        continue;
      }

      // if statement (statement-level, optional else)
      if (handleIfStatement(stmt, localEnv, interpret)) {
        last = undefined;
        continue;
      }

      // while loop - delegated to extracted handler
      if (handleWhileStatement(stmt, localEnv, interpret)) {
        last = undefined;
        continue;
      }

      // for loop - delegated to extracted handler
      if (handleForStatement(stmt, localEnv, interpret)) {
        last = undefined;
        continue;
      }

      // Handle all assignment statements: compound assignment, deref assignment, etc.
      const assignParts = extractAssignmentParts(stmt);
      if (assignParts) {
        const res = handleAssignmentStatement(
          assignParts,
          localEnv,
          evaluateRhsLocal,
          convertOperandToNumber
        );
        if (res.handled) {
          last = res.last;
          continue;
        }
      } else {
        // Support statements that begin with a braced block possibly followed by an
        // expression (e.g., `{ } x`). Delegate to helper to reduce complexity of the
        // enclosing function.
        let remaining = stmt;
        last = evalBracedBlockAndTrailingExpression(
          remaining,
          localEnv,
          interpret,
          evaluateReturningOperand
        );
      }
    }
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
