import { splitTopLevelStatements } from "../parser";
import { evaluateReturningOperand } from "../eval";
import {
  getLastTopLevelStatement,
  evaluateRhs,
  validateAnnotation,
  findMatchingParen,
  parseOperand,
  extractAssignmentParts,
  convertOperandToNumber,
  registerFunctionFromStmt,
  parseStructDef,
  parseFnComponents,
  parseArrayAnnotation,
  parseSliceAnnotation,
  cloneArrayInstance,
  makeArrayInstance,
} from "../interpret_helpers";
import { handleWhileStatement, handleForStatement } from "./loop_handlers";
import { handleIfStatement } from "./if_handlers";
import {
  handleExternFn,
  handleExternLet,
  handleImportStatement,
} from "./extern_handlers";
import {
  handleThisFieldAssignment,
  handleIndexAssignment,
  handleDerefAssignment,
  handleRegularAssignment,
} from "./assignment_handlers";
import { Env, envClone, envGet, envSet, envHas } from "../env";
import type { InterpretFn } from "../types";
import {
  isPlainObject,
  isIntOperand,
  isPointer,
  isArrayInstance,
  toErrorMessage,
  unwrapBindingValue,
  hasUninitialized,
  hasAnnotation,
  hasMutable,
  hasPtrMutable,
  getProp,
} from "../types";

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

    if (/^let\b/.test(stmt)) {
      // support `let [mut] name [: annotation] [= rhs]`
      const m = stmt.match(
        /^let\s+(mut\s+)?([a-zA-Z_]\w*)(?:\s*:\s*([^=]+))?(?:\s*=\s*(.+))?$/
      );
      if (!m) throw new Error("invalid let declaration");
      const mutFlag = !!m[1];
      const name = m[2];
      const annotation = m[3] ? m[3].trim() : undefined;
      const hasInitializer = m[4] !== undefined;
      const rhsRaw = hasInitializer && m[4] ? m[4].trim() : undefined;

      // duplicate declaration in same scope is an error
      if (declared.has(name)) throw new Error("duplicate declaration");

      if (!hasInitializer) {
        // validate annotation shape (if present)
        let parsedAnn: unknown = undefined;
        let literalAnnotation = false;
        if (annotation) {
          // resolve type alias if present
          let annText = annotation;
          if (typeof annText === "string" && envHas(localEnv, annText)) {
            const candidate = envGet(localEnv, annText);
            if (
              isPlainObject(candidate) &&
              getProp(candidate, "typeAlias") !== undefined
            ) {
              annText = String(getProp(candidate, "typeAlias"));
            }
          }

          const arrAnn =
            typeof annText === "string"
              ? parseArrayAnnotation(annText)
              : undefined;
          if (arrAnn) {
            // When declaring without initializer, require initCount === 0
            if (arrAnn.initCount !== 0)
              throw new Error(
                "array declaration without initializer requires init count 0"
              );
            const arrInst = makeArrayInstance(arrAnn);
            declared.add(name);
            if (mutFlag)
              envSet(localEnv, name, {
                mutable: true,
                value: arrInst,
                annotation,
              });
            else envSet(localEnv, name, arrInst);
            last = undefined;
            continue;
          }

          const typeOnly = String(annText).match(/^\s*([uUiI])\s*(\d+)\s*$/);
          if (typeOnly) {
            // fine, type-only
          } else if (/^\s*bool\s*$/i.test(String(annText))) {
            // fine
          } else {
            const sliceAnn =
              typeof annText === "string"
                ? parseSliceAnnotation(annText)
                : undefined;
            if (sliceAnn) {
              parsedAnn = String(annText);
              literalAnnotation = false;
            } else {
              const ann = parseOperand(String(annText));
              if (!ann) throw new Error("invalid annotation in let");
              if (!isIntOperand(ann))
                throw new Error(
                  "annotation must be integer literal with suffix"
                );
              parsedAnn = ann;
              literalAnnotation = true;
            }
          }
        }
        declared.add(name);
        // store placeholder so assignments later can validate annotations
        envSet(localEnv, name, {
          uninitialized: true,
          annotation,
          parsedAnnotation: parsedAnn,
          literalAnnotation,
          mutable: mutFlag,
          value: undefined,
        });
        last = undefined;
      } else {
        // initializer present: validate same as before
        let rhs = rhsRaw!;

        // If rhs contains a top-level braced block that is followed by more tokens
        // (e.g., `match (...) { ... } result`), split off the trailing tokens so the
        // initializer is only the braced block and the trailing tokens are evaluated
        // as a following expression in the same statement.
        const braceStart = rhs.indexOf("{");
        let trailingExpr: string | undefined = undefined;
        if (braceStart !== -1) {
          const endIdx = findMatchingParen(rhs, braceStart, "{", "}");
          if (endIdx !== -1 && endIdx < rhs.length - 1) {
            trailingExpr = rhs.slice(endIdx + 1).trim();
            rhs = rhs.slice(0, endIdx + 1).trim();
          }
        }

        const rhsOperand = evaluateRhsLocal(rhs, localEnv);

        if (annotation) {
          // resolve type aliases for annotations before validation
          let resolvedAnn = annotation;
          if (
            typeof resolvedAnn === "string" &&
            envHas(localEnv, resolvedAnn)
          ) {
            const candidate = envGet(localEnv, resolvedAnn);
            if (
              isPlainObject(candidate) &&
              getProp(candidate, "typeAlias") !== undefined
            )
              resolvedAnn = String(getProp(candidate, "typeAlias"));
          }
          validateAnnotation(resolvedAnn, rhsOperand);
        }

        declared.add(name);
        // If RHS is an array instance, clone it to enforce copy-on-assignment
        const valToStore = isArrayInstance(rhsOperand)
          ? cloneArrayInstance(rhsOperand)
          : rhsOperand;
        if (mutFlag) {
          // store as mutable wrapper so future assignments update .value
          envSet(localEnv, name, {
            mutable: true,
            value: valToStore,
            annotation,
          });
        } else {
          envSet(localEnv, name, valToStore);
        }

        // If we split off a trailing expression, evaluate it now and use it as `last`
        if (trailingExpr) {
          last = evaluateReturningOperand(trailingExpr, localEnv);
        } else {
          last = undefined;
        }
      }
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
        const { isDeref, name, op, rhs, isThisField } = assignParts;

        // Handle this.field assignment
        if (isThisField) {
          handleThisFieldAssignment(name, op, rhs, localEnv, evaluateRhsLocal);
          last = undefined;
          continue;
        }

        // Index assignment support: name[index] = rhs or name[index] += rhs
        if (assignParts.indexExpr !== undefined) {
          handleIndexAssignment(
            name,
            assignParts.indexExpr,
            op,
            rhs,
            localEnv,
            evaluateReturningOperand,
            evaluateRhsLocal,
            convertOperandToNumber
          );
          last = undefined;
          continue;
        }

        if (!envHas(localEnv, name))
          throw new Error("assignment to undeclared variable");
        const existing = envGet(localEnv, name);
        // allow assignment to uninitialized placeholders (from declaration-only lets) or normal vars
        // only throw if trying to use an uninitialized var in certain contexts (not assignment)
        if (
          isPlainObject(existing) &&
          hasUninitialized(existing) &&
          existing.uninitialized &&
          !hasAnnotation(existing) &&
          !hasMutable(existing)
        )
          throw new Error("use of uninitialized variable");

        let ptr: unknown;
        if (isDeref) {
          ptr = unwrapBindingValue(existing);
          if (!isPointer(ptr))
            throw new Error("cannot dereference non-pointer");
          if (!hasPtrMutable(ptr) || ptr.ptrMutable !== true)
            throw new Error("cannot assign through immutable pointer");
        }

        const rhsOperand = evaluateRhsLocal(rhs, localEnv);

        if (isDeref) {
          handleDerefAssignment(ptr, op, rhsOperand, localEnv);
        } else {
          handleRegularAssignment(name, op, rhsOperand, existing, localEnv);
        }

        last = undefined;
        continue;
      } else {
        // Support statements that begin with a braced block possibly followed by an
        // expression (e.g., `{ } x`). Evaluate leading braced blocks in sequence and
        // then evaluate any remaining expression.
        let remaining = stmt;
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
            if (endIdx === -1)
              throw new Error("unbalanced braces in statement");
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
            last = evaluateReturningOperand(expr, localEnv);
          } catch (e: unknown) {
            if (toErrorMessage(e) === "invalid expression") {
              // Fall back to interpret for inputs that aren't valid single expressions
              last = interpret(expr, localEnv);
            } else throw e;
          }
          break;
        }
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
