/* eslint-disable max-lines */
import { splitTopLevelStatements } from "../parser";
import {
  evaluateReturningOperand,
  evaluateFlatExpression,
  isTruthy,
} from "../eval";
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
} from "../interpret_helpers";
import {
  computeAssignmentValue,
  assignValueToVariable,
  assignToPlaceholder,
} from "./helpers";
import { Env, envClone, envGet, envSet, envHas, envDelete } from "../env";
import type { InterpretFn } from "../types";
import {
  isPlainObject,
  isIntOperand,
  isPointer,
  toErrorMessage,
  unwrapBindingValue,
  hasUninitialized,
  hasAnnotation,
  hasMutable,
  hasPtrMutable,
  hasValue,
  hasLiteralAnnotation,
  hasParsedAnnotation,
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
      // extern function declaration: `extern fn name(params) : Type` (no body)
      const m = stmt.match(
        /^extern\s+fn\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*(?::\s*([^;]+))?\s*;?$/
      );
      if (!m) throw new Error("invalid extern fn declaration");
      const name = m[1];
      const paramsStr = m[2].trim();
      const params =
        paramsStr === "" ? [] : paramsStr.split(",").map((p) => p.trim());
      const resultAnnotation = m[3] ? m[3].trim() : undefined;
      if (declared.has(name)) {
        // symbol already declared (e.g., via an import); extern fn is a no-op here
        last = undefined;
        continue;
      }
      declared.add(name);
      // register placeholder fn wrapper (no nativeImpl yet)
      envSet(localEnv, name, {
        fn: {
          params,
          body: "/* extern */",
          isBlock: false,
          resultAnnotation,
          closureEnv: undefined,
        },
      });
      last = undefined;
      continue;
    }

    if (/^extern\s+let\b/.test(stmt)) {
      // extern let declaration: `extern let name [: annotation];`
      const m = stmt.match(
        /^extern\s+let\s+([a-zA-Z_]\w*)(?:\s*:\s*([^;]+))?\s*;?$/
      );
      if (!m) throw new Error("invalid extern let declaration");
      const name = m[1];
      const annotation = m[2] ? m[2].trim() : undefined;
      if (declared.has(name)) {
        // already declared by import — no-op
        last = undefined;
        continue;
      }
      declared.add(name);
      envSet(localEnv, name, {
        uninitialized: true,
        annotation,
        parsedAnnotation: undefined,
        literalAnnotation: false,
        mutable: false,
        value: undefined,
      });
      last = undefined;
      continue;
    }

    // import statement: optionally prefixed with `extern`: `extern from <ns> use { a, b }`
    if (/^extern\b/.test(stmt) || /^from\b/.test(stmt)) {
      let importStmt = stmt;
      if (/^extern\b/.test(importStmt))
        importStmt = importStmt.replace(/^extern\s+/, "");
      const importRE =
        /from\s+([a-zA-Z_]\w*(?:::[a-zA-Z_]\w*)*)\s+use\s*\{\s*([a-zA-Z_]\w*(?:\s*,\s*[a-zA-Z_]\w*)*)\s*\}/;
      let m = importStmt.match(importRE);
      if (!m) {
        const idx = importStmt.indexOf("from");
        if (idx !== -1) m = importStmt.slice(idx).match(importRE);
      }
      if (!m) throw new Error("invalid import syntax");
      const nsName = m[1];
      const names = m[2].split(",").map((x) => x.trim());
      const resolver =
        envGet(env, "__resolve_namespace") ||
        envGet(localEnv, "__resolve_namespace");
      if (typeof resolver !== "function")
        throw new Error("namespace resolver not available");
      const nsExports = resolver(nsName);
      if (!isPlainObject(nsExports))
        throw new Error("namespace resolver returned invalid exports");
      for (const name of names) {
        if (!Object.prototype.hasOwnProperty.call(nsExports, name))
          throw new Error("symbol not found in namespace");
        if (declared.has(name)) throw new Error("duplicate declaration");
        declared.add(name);
        envSet(localEnv, name, nsExports[name]);
      }
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
        /^let\s+(mut\s+)?([a-zA-Z_]\w*)(?:\s*:\s*([^=;]+))?(?:\s*=\s*(.+))?$/
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
          const typeOnly = annotation.match(/^\s*([uUiI])\s*(\d+)\s*$/);
          if (typeOnly) {
            // fine, type-only
          } else if (/^\s*bool\s*$/i.test(annotation)) {
            // fine
          } else {
            const ann = parseOperand(annotation);
            if (!ann) throw new Error("invalid annotation in let");
            if (!isIntOperand(ann))
              throw new Error("annotation must be integer literal with suffix");
            parsedAnn = ann;
            literalAnnotation = true;
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
          validateAnnotation(annotation, rhsOperand);
        }

        declared.add(name);
        if (mutFlag) {
          // store as mutable wrapper so future assignments update .value
          envSet(localEnv, name, {
            mutable: true,
            value: rhsOperand,
            annotation,
          });
        } else {
          envSet(localEnv, name, rhsOperand);
        }

        // If we split off a trailing expression, evaluate it now and use it as `last`
        if (trailingExpr) {
          last = evaluateReturningOperand(trailingExpr, localEnv);
        } else {
          last = undefined;
        }
      }
    } else {
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
          // Evaluate the remaining content as an expression
          const result = evaluateFlatExpression(remaining, localEnv);
          last = result;
        }
        continue;
      }

      // if statement (statement-level, optional else)
      if (/^if\b/.test(stmt)) {
        const start = stmt.indexOf("(");
        if (start === -1) throw new Error("invalid if syntax");
        const endIdx = findMatchingParen(stmt, start);
        if (endIdx === -1)
          throw new Error("invalid if syntax: unbalanced parentheses");
        const cond = stmt.slice(start + 1, endIdx).trim();
        let rest = stmt.slice(endIdx + 1).trim();
        if (!rest) throw new Error("missing if body");

        // parse true body (braced block or single statement)
        let trueBody = "";
        let falseBody: string | undefined = undefined;
        if (rest.startsWith("{")) {
          const bEnd = findMatchingParen(rest, 0, "{", "}");
          if (bEnd === -1) throw new Error("unbalanced braces in if");
          trueBody = rest.slice(0, bEnd + 1).trim();
          rest = rest.slice(bEnd + 1).trim();
        } else {
          // single statement body; could be followed by 'else <body>' in the same statement
          const elseIdx = rest.indexOf(" else ");
          if (elseIdx !== -1) {
            trueBody = rest.slice(0, elseIdx).trim();
            rest = rest.slice(elseIdx + 6).trim();
          } else {
            trueBody = rest.trim();
            rest = "";
          }
        }

        // if an else body remains, parse it similarly
        if (rest) {
          if (rest.startsWith("{")) {
            const bEnd = findMatchingParen(rest, 0, "{", "}");
            if (bEnd === -1) throw new Error("unbalanced braces in if else");
            falseBody = rest.slice(0, bEnd + 1).trim();
          } else {
            falseBody = rest.trim();
          }
        }

        const condOpnd = evaluateReturningOperand(cond, localEnv);
        if (isTruthy(condOpnd)) {
          if (/^\s*\{[\s\S]*\}\s*$/.test(trueBody)) {
            const inner = trueBody.replace(/^\{\s*|\s*\}$/g, "");
            interpret(inner, localEnv);
          } else {
            interpret(trueBody + ";", localEnv);
          }
        } else if (falseBody) {
          if (/^\s*\{[\s\S]*\}\s*$/.test(falseBody)) {
            const inner = falseBody.replace(/^\{\s*|\s*\}$/g, "");
            interpret(inner, localEnv);
          } else {
            interpret(falseBody + ";", localEnv);
          }
        }

        last = undefined;
        continue;
      }

      // while loop
      if (/^while\b/.test(stmt)) {
        const start = stmt.indexOf("(");
        if (start === -1) throw new Error("invalid while syntax");
        const endIdx = findMatchingParen(stmt, start);
        if (endIdx === -1) throw new Error("unbalanced parentheses in while");
        const cond = stmt.slice(start + 1, endIdx).trim();
        let body = stmt.slice(endIdx + 1).trim();
        if (!body) throw new Error("missing while body");
        while (true) {
          const condOpnd = evaluateReturningOperand(cond, localEnv);
          if (!isTruthy(condOpnd)) break;
          if (/^\s*\{[\s\S]*\}\s*$/.test(body)) {
            const inner = body.replace(/^\{\s*|\s*\}$/g, "");
            interpret(inner, localEnv);
          } else {
            interpret(body + ";", localEnv);
          }
        }
        last = undefined;
        continue;
      }

      // for loop: `for (let [mut] name in start..end) body`
      if (/^for\b/.test(stmt)) {
        const start = stmt.indexOf("(");
        if (start === -1) throw new Error("invalid for syntax");
        const endIdx = findMatchingParen(stmt, start);
        if (endIdx === -1) throw new Error("unbalanced parentheses in for");
        const cond = stmt.slice(start + 1, endIdx).trim();
        let body = stmt.slice(endIdx + 1).trim();
        if (!body) throw new Error("missing for body");

        // cond should be: let [mut] <name> in <start>.. <end>
        const m = cond.match(
          /^let\s+(mut\s+)?([a-zA-Z_]\w*)\s+in\s+([\s\S]+)$/
        );
        if (!m) throw new Error("invalid for loop header");
        const mutFlag = !!m[1];
        const iterName = m[2];
        const rangeExpr = m[3].trim();
        const rm = rangeExpr.match(/^([\s\S]+?)\s*\.\.\s*([\s\S]+)$/);
        if (!rm) throw new Error("invalid for range expression");
        const startExpr = rm[1].trim();
        const endExpr = rm[2].trim();

        const startVal = evaluateFlatExpression(startExpr, localEnv);
        const endVal = evaluateFlatExpression(endExpr, localEnv);

        const hadPrev = envHas(localEnv, iterName);
        const prev = hadPrev ? envGet(localEnv, iterName) : undefined;

        for (let i = startVal; i < endVal; i++) {
          // bind the loop variable in the same env so body can see and update outer vars
          if (mutFlag) envSet(localEnv, iterName, { mutable: true, value: i });
          else envSet(localEnv, iterName, i);

          if (/^\s*\{[\s\S]*\}\s*$/.test(body)) {
            const inner = body.replace(/^\{\s*|\s*\}$/g, "");
            interpret(inner, localEnv);
          } else {
            interpret(body + ";", localEnv);
          }
        }

        // restore previous binding
        if (hadPrev) envSet(localEnv, iterName, prev);
        else envDelete(localEnv, iterName);

        last = undefined;
        continue;
      }

      // Handle all assignment statements: compound assignment, deref assignment, etc.
      const assignParts = extractAssignmentParts(stmt);
      if (assignParts) {
        const { isDeref, name, op, rhs, isThisField } = assignParts;

        // Handle this.field assignment
        if (isThisField) {
          if (!envHas(localEnv, name))
            throw new Error("assignment to undeclared variable");
          const existing = envGet(localEnv, name);

          const rhsOperand = evaluateRhsLocal(rhs, localEnv);

          const newVal = computeAssignmentValue(op, existing, rhsOperand);

          assignValueToVariable(name, existing, newVal, localEnv);

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
          // Deref assignment or compound: update through pointer
          if (!isPointer(ptr))
            throw new Error("internal error: deref assignment without pointer");
          const targetName = ptr.ptrName;
          if (!envHas(localEnv, targetName))
            throw new Error(`unknown identifier ${targetName}`);
          const targetExisting = envGet(localEnv, targetName);

          const newVal = computeAssignmentValue(op, targetExisting, rhsOperand);

          // For deref assignment to a placeholder, validate annotation
          if (
            isPlainObject(targetExisting) &&
            hasUninitialized(targetExisting)
          ) {
            if (
              hasLiteralAnnotation(targetExisting) &&
              targetExisting.literalAnnotation &&
              !targetExisting.uninitialized &&
              (!hasMutable(targetExisting) || !targetExisting.mutable)
            )
              throw new Error("cannot reassign annotated literal");
            if (
              hasParsedAnnotation(targetExisting) &&
              targetExisting.parsedAnnotation &&
              targetExisting.uninitialized
            ) {
              validateAnnotation(targetExisting.parsedAnnotation, newVal);
            } else if (
              hasAnnotation(targetExisting) &&
              typeof targetExisting.annotation === "string"
            ) {
              validateAnnotation(targetExisting.annotation, newVal);
            }
            // Use helpers to avoid direct casts and ensure consistent behavior
            assignToPlaceholder(targetName, targetExisting, newVal, localEnv);
          } else if (
            isPlainObject(targetExisting) &&
            hasValue(targetExisting) &&
            targetExisting.value !== undefined &&
            hasMutable(targetExisting) &&
            targetExisting.mutable
          ) {
            assignValueToVariable(targetName, targetExisting, newVal, localEnv);
          } else {
            envSet(localEnv, targetName, newVal);
          }
        } else {
          // Normal assignment or compound: update variable directly
          const newVal = computeAssignmentValue(op, existing, rhsOperand);

          if (isPlainObject(existing) && hasUninitialized(existing)) {
            // Placeholder for declaration-only let
            assignToPlaceholder(name, existing, newVal, localEnv);
          } else {
            assignValueToVariable(name, existing, newVal, localEnv);
          }
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
