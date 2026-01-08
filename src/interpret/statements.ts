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
} from "../interpret_helpers";
import {
  computeAssignmentValue,
  assignValueToVariable,
  assignToPlaceholder,
} from "./helpers";

export function interpretBlock(
  s: string,
  env: Record<string, any>,
  interpret: any
): number {
  // simple block evaluator with lexical scoping (variables shadow parent env)
  const localEnv: Record<string, any> = { ...env };
  const declared = new Set<string>();
  let last: any = undefined;

  const getLastTopLevelStatementLocal = (str: string) =>
    getLastTopLevelStatement(str, splitTopLevelStatements);

  const evaluateRhsLocal = (rhs: string, envLocal: Record<string, any>) =>
    evaluateRhs(rhs, envLocal, interpret, getLastTopLevelStatementLocal);

  const stmts = splitTopLevelStatements(s);
  for (let raw of stmts) {
    const stmt = raw.trim();
    if (!stmt) continue;
    if (/^fn\b/.test(stmt)) {
      // Delegate parsing and registration to helper
      const tExpr = registerFunctionFromStmt(stmt, localEnv, declared);
      if (tExpr) last = evaluateReturningOperand(tExpr, localEnv);
      else last = undefined;
      continue;
    }

    if (/^let\b/.test(stmt)) {
      // support `let [mut] name [: annotation] [= rhs]`
      const m = stmt.match(
        /^let\s+(mut\s+)?([a-zA-Z_]\w*)(?:\s*:\s*([^=;]+))?(?:\s*=\s*(.+))?$/
      );
      if (!m) throw new Error("invalid let declaration");
      const mutFlag = !!m[1];
      const name = m[2];
      const annotation = m[3] ? m[3].trim() : null;
      const hasInitializer = m[4] !== undefined;
      const rhsRaw = hasInitializer ? (m[4] as string).trim() : null;

      // duplicate declaration in same scope is an error
      if (declared.has(name)) throw new Error("duplicate declaration");

      if (!hasInitializer) {
        // validate annotation shape (if present)
        let parsedAnn: any = null;
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
            if (!(ann as any).valueBig)
              throw new Error("annotation must be integer literal with suffix");
            parsedAnn = ann;
            literalAnnotation = true;
          }
        }
        declared.add(name);
        // store placeholder so assignments later can validate annotations
        localEnv[name] = {
          uninitialized: true,
          annotation,
          parsedAnnotation: parsedAnn,
          literalAnnotation,
          mutable: mutFlag,
          value: undefined,
        };
        last = undefined;
      } else {
        // initializer present: validate same as before
        let rhs = rhsRaw!;

        // If rhs contains a top-level braced block that is followed by more tokens
        // (e.g., `match (...) { ... } result`), split off the trailing tokens so the
        // initializer is only the braced block and the trailing tokens are evaluated
        // as a following expression in the same statement.
        const braceStart = rhs.indexOf("{");
        let trailingExpr: string | null = null;
        if (braceStart !== -1) {
          const endIdx = findMatchingParen(rhs, braceStart, "{", "}");
          if (endIdx !== -1 && endIdx < rhs.length - 1) {
            trailingExpr = rhs.slice(endIdx + 1).trim();
            rhs = rhs.slice(0, endIdx + 1).trim();
          }
        }

        let rhsOperand: any;
        rhsOperand = evaluateRhsLocal(rhs, localEnv);

        if (annotation) {
          validateAnnotation(annotation, rhsOperand);
        }

        declared.add(name);
        if (mutFlag) {
          // store as mutable wrapper so future assignments update .value
          localEnv[name] = { mutable: true, value: rhsOperand, annotation };
        } else {
          localEnv[name] = rhsOperand;
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
        localEnv[structDef.name] = {
          isStructDef: true,
          name: structDef.name,
          fields: structDef.fields,
        };
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
            const inner = body.replace(/^\{\s*|\s*\}\$/g, "");
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

        const hadPrev = iterName in localEnv;
        const prev = hadPrev ? localEnv[iterName] : undefined;

        for (let i = startVal; i < endVal; i++) {
          // bind the loop variable in the same env so body can see and update outer vars
          if (mutFlag) localEnv[iterName] = { mutable: true, value: i };
          else localEnv[iterName] = i;

          if (/^\s*\{[\s\S]*\}\s*$/.test(body)) {
            const inner = body.replace(/^\{\s*|\s*\}$/g, "");
            interpret(inner, localEnv);
          } else {
            interpret(body + ";", localEnv);
          }
        }

        // restore previous binding
        if (hadPrev) localEnv[iterName] = prev;
        else delete localEnv[iterName];

        last = undefined;
        continue;
      }

      // Handle all assignment statements: compound assignment, deref assignment, etc.
      const assignParts = extractAssignmentParts(stmt);
      if (assignParts) {
        const { isDeref, name, op, rhs, isThisField } = assignParts;

        // Handle this.field assignment
        if (isThisField) {
          if (!(name in localEnv))
            throw new Error("assignment to undeclared variable");
          const existing = localEnv[name] as any;

          const rhsOperand: any = evaluateRhsLocal(rhs, localEnv);

          const newVal = computeAssignmentValue(op, existing, rhsOperand);

          assignValueToVariable(name, existing, newVal, localEnv);

          last = undefined;
          continue;
        }

        if (!(name in localEnv))
          throw new Error("assignment to undeclared variable");
        const existing = localEnv[name] as any;
        // allow assignment to uninitialized placeholders (from declaration-only lets) or normal vars
        // only throw if trying to use an uninitialized var in certain contexts (not assignment)
        if (
          existing &&
          (existing as any).uninitialized &&
          !(existing as any).annotation &&
          !(existing as any).mutable
        )
          throw new Error("use of uninitialized variable");

        let ptr: any;
        if (isDeref) {
          ptr =
            existing && (existing as any).value !== undefined
              ? (existing as any).value
              : existing;
          if (!ptr || !ptr.pointer)
            throw new Error("cannot dereference non-pointer");
          if (!ptr.ptrMutable)
            throw new Error("cannot assign through immutable pointer");
        }

        const rhsOperand: any = evaluateRhsLocal(rhs, localEnv);

        if (isDeref) {
          // Deref assignment or compound: update through pointer
          const targetName = ptr.ptrName as string;
          if (!(targetName in localEnv))
            throw new Error(`unknown identifier ${targetName}`);
          const targetExisting = localEnv[targetName] as any;

          const newVal = computeAssignmentValue(op, targetExisting, rhsOperand);

          // For deref assignment to a placeholder, validate annotation
          if (
            targetExisting &&
            (targetExisting as any).uninitialized !== undefined
          ) {
            if (
              (targetExisting as any).literalAnnotation &&
              !(targetExisting as any).uninitialized &&
              !(targetExisting as any).mutable
            )
              throw new Error("cannot reassign annotated literal");
            if (
              (targetExisting as any).parsedAnnotation &&
              (targetExisting as any).uninitialized
            ) {
              validateAnnotation(
                (targetExisting as any).parsedAnnotation,
                newVal
              );
            } else if ((targetExisting as any).annotation) {
              validateAnnotation(
                (targetExisting as any).annotation as string,
                newVal
              );
            }
            (targetExisting as any).value = newVal;
            (targetExisting as any).uninitialized = false;
            localEnv[targetName] = targetExisting;
          } else if (
            targetExisting &&
            (targetExisting as any).value !== undefined &&
            (targetExisting as any).mutable
          ) {
            (targetExisting as any).value = newVal;
            localEnv[targetName] = targetExisting;
          } else {
            localEnv[targetName] = newVal;
          }
        } else {
          // Normal assignment or compound: update variable directly
          const newVal = computeAssignmentValue(op, existing, rhsOperand);

          if (existing && (existing as any).uninitialized !== undefined) {
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
            const inner = block.replace(/^\{\s*|\s*\}$/g, "");
            last = interpret(inner, localEnv);
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
          } catch (e: any) {
            if (e && e.message === "invalid expression") {
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
