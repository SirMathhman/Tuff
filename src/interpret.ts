/**
 * Interpret function.
 * - If the input starts with a numeric value (integer or float), returns that numeric value.
 * - Otherwise returns 0.
 * This allows inputs with type suffixes like `100U8` to be parsed as 100.
 */
import { splitTopLevelStatements } from "./parser";
import {
  evaluateReturningOperand,
  evaluateFlatExpression,
  isTruthy,
  applyBinaryOp,
} from "./eval";
import {
  getLastTopLevelStatement,
  evaluateRhs,
  validateAnnotation,
  findMatchingParen,
  parseOperand,
  extractAssignmentParts,
  expandParensAndBraces,
  convertOperandToNumber,
} from "./interpret_helpers";

export function interpret(
  input: string,
  env: Record<string, any> = {}
): number {
  let s = input.trim();

  // If this is a top-level match expression, delegate to the expression evaluator
  // early so match bodies are not accidentally pre-processed as braced blocks.
  if (/^match\b/.test(s)) {
    return evaluateFlatExpression(s, env);
  }

  // Helper: check for semicolons at top-level (not nested inside braces/parens)
  function hasTopLevelSemicolon(str: string) {
    return splitTopLevelStatements(str).length > 1;
  }

  // Helper wrapper to adapt imported helpers to local signatures
  const getLastTopLevelStatementLocal = (str: string) =>
    getLastTopLevelStatement(str, splitTopLevelStatements);

  const evaluateRhsLocal = (rhs: string, envLocal: Record<string, any>) =>
    evaluateRhs(rhs, envLocal, interpret, getLastTopLevelStatementLocal);

  // If there are multiple `fn` declarations without top-level semicolons, treat as an error
  // (we require semicolons between top-level declarations)
  const fnCount = (s.match(/\bfn\b/g) || []).length;
  if (fnCount > 1 && !hasTopLevelSemicolon(s)) {
    throw new Error("duplicate declaration");
  }

  // If the input looks like a block (has top-level semicolons, starts with `let`, or is a top-level braced block), evaluate as a block
  if (
    hasTopLevelSemicolon(s) ||
    /^let\b/.test(s) ||
    /^\s*\{[\s\S]*\}\s*$/.test(s)
  ) {
    // If the entire input is an outer braced block, strip outer braces so inner
    // declarations are processed in order and nested groups see earlier declarations.
    if (/^\s*\{[\s\S]*\}\s*$/.test(s)) s = s.replace(/^\{\s*|\s*\}$/g, "");

    // simple block evaluator with lexical scoping (variables shadow parent env)
    const localEnv: Record<string, any> = { ...env };
    const declared = new Set<string>();
    let last: any = undefined;

    const stmts = splitTopLevelStatements(s);
    for (let raw of stmts) {
      const stmt = raw.trim();
      if (!stmt) continue;
      if (/^fn\b/.test(stmt)) {
        // support `fn name(<params>) => <expr>` or `fn name(<params>) { <stmts> }`
        const m = stmt.match(/^fn\s+([a-zA-Z_]\w*)/);
        if (!m) throw new Error("invalid fn declaration");
        const name = m[1];
        if (declared.has(name)) throw new Error("duplicate declaration");

        // find parameter parens
        const start = stmt.indexOf("(");
        if (start === -1) throw new Error("invalid fn syntax");
        const endIdx = findMatchingParen(stmt, start);
        if (endIdx === -1) throw new Error("unbalanced parentheses in fn");
        const paramsRaw = stmt.slice(start + 1, endIdx).trim();
        const params = paramsRaw.length
          ? paramsRaw.split(",").map((p) => {
              const parts = p.split(":");
              const name = parts[0].trim();
              const ann = parts[1] ? parts.slice(1).join(":").trim() : null;
              return { name, annotation: ann };
            })
          : [];

        const after = stmt.slice(endIdx + 1).trim();
        let body: string;
        let isBlock = false;
        // optional result annotation: `: <annotation>` before `=>` or `{`
        let resultAnnotation: string | null = null;
        let rest = after;
        if (rest.startsWith(":")) {
          const afterAnn = rest.slice(1).trimStart();
          const idxArrow = afterAnn.indexOf("=>");
          const idxBrace = afterAnn.indexOf("{");
          let pos = -1;
          if (idxArrow !== -1 && (idxBrace === -1 || idxArrow < idxBrace)) pos = idxArrow;
          else if (idxBrace !== -1) pos = idxBrace;
          if (pos === -1) throw new Error("invalid fn result annotation");
          resultAnnotation = afterAnn.slice(0, pos).trim();
          rest = afterAnn.slice(pos).trimStart();
        }
        if (rest.startsWith("=>")) {
          body = rest.slice(2).trim();
          if (!body) throw new Error("missing fn body");
        } else if (rest.startsWith("{")) {
          const bStart = stmt.indexOf("{", endIdx + 1);
          const bEnd = findMatchingParen(stmt, bStart, "{", "}");
          if (bEnd === -1) throw new Error("unbalanced braces in fn");
          body = stmt.slice(bStart, bEnd + 1);
          isBlock = true;
        } else {
          throw new Error("invalid fn body");
        }

        // reserve name then attach closure env including the function itself
        declared.add(name);
        localEnv[name] = { fn: { params, body, isBlock, resultAnnotation, closureEnv: null } };
        (localEnv[name] as any).fn.closureEnv = { ...localEnv };

        last = undefined;
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
          // validate annotation shape (if present) and capture parsed literal annotation
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
                throw new Error(
                  "annotation must be integer literal with suffix"
                );
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
          const { isDeref, name, op, rhs } = assignParts;

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

            let newVal = rhsOperand;
            if (op) {
              const cur =
                targetExisting && (targetExisting as any).value !== undefined
                  ? (targetExisting as any).value
                  : targetExisting;
              newVal = applyBinaryOp(op, cur, rhsOperand);
            }

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
            let newVal = rhsOperand;
            if (op) {
              const cur =
                existing && (existing as any).value !== undefined
                  ? (existing as any).value
                  : existing;
              newVal = applyBinaryOp(op, cur, rhsOperand);
            }

            if (existing && (existing as any).uninitialized !== undefined) {
              // Placeholder for declaration-only let
              if (
                (existing as any).literalAnnotation &&
                !(existing as any).uninitialized &&
                !(existing as any).mutable
              )
                throw new Error("cannot reassign annotated literal");
              if (
                (existing as any).parsedAnnotation &&
                (existing as any).uninitialized
              ) {
                validateAnnotation((existing as any).parsedAnnotation, newVal);
              } else if ((existing as any).annotation) {
                const annotation = (existing as any).annotation as string;
                const typeOnly = annotation.match(/^\s*([uUiI])\s*(\d+)\s*$/);
                if (typeOnly || /^\s*bool\s*$/i.test(annotation)) {
                  validateAnnotation(annotation, newVal);
                }
              }
              (existing as any).value = newVal;
              (existing as any).uninitialized = false;
              localEnv[name] = existing;
            } else if (
              existing &&
              (existing as any).value !== undefined &&
              (existing as any).mutable
            ) {
              // Mutable wrapper: update its .value
              (existing as any).value = newVal;
              localEnv[name] = existing;
            } else {
              // Normal binding: replace it
              localEnv[name] = newVal;
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
            last = evaluateReturningOperand(remaining, localEnv);
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

  // If expression contains parentheses or braces, evaluate innermost grouped expressions first
  if (s.includes("(") || s.includes("{")) {
    s = expandParensAndBraces(s, env, interpret, getLastTopLevelStatementLocal);

    // After replacing groups, it's possible we introduced top-level semicolons
    // (e.g., "{ let x = 10; } x" -> "0; x"). In that case, re-run the block/sequence
    // handler by delegating to `interpret` again so declarations remain scoped.
    if (hasTopLevelSemicolon(s) || /^let\b/.test(s)) {
      return interpret(s, env);
    }
  }

  // Parse and evaluate expressions with '+' and '-' (left-associative)
  // We'll parse tokens: operand (operator operand)* and evaluate left to right.

  // If expression contains parentheses, evaluate innermost and replace
  if (s.includes("(")) {
    let expr = s;
    const parenRegex = /\([^()]*\)/;
    while (parenRegex.test(expr)) {
      const m = expr.match(parenRegex)![0];
      const inner = m.slice(1, -1);
      const v = evaluateFlatExpression(inner, env);
      expr = expr.replace(m, String(v));
    }
    return evaluateFlatExpression(expr, env);
  }

  // If expression contains any operators (including logical/comparison), evaluate it as a flat expression
  if (/\|\||&&|<=|>=|==|!=|[+\-*/%<>]/.test(s)) {
    return evaluateFlatExpression(s, env);
  }

  // fallback: single operand parse
  const single = parseOperand(s);
  if (!single) {
    // if it's a bare identifier, try resolving from env (so `{ x }` yields the value of `x`)
    const idm = s.match(/^\s*([a-zA-Z_]\w*)\s*$/);
    if (idm) {
      const name = idm[1];
      if (name in env) {
        const val = env[name];
        return convertOperandToNumber(val);
      }
    }
    return 0;
  }
  return convertOperandToNumber(single);
}
