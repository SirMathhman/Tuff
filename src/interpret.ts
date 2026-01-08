/**
 * Interpret function.
 * - If the input starts with a numeric value (integer or float), returns that numeric value.
 * - Otherwise returns 0.
 * This allows inputs with type suffixes like `100U8` to be parsed as 100.
 */
import {
  splitTopLevelStatements,
  parseOperand,
  parseOperandAt,
} from "./parser";
import { evaluateReturningOperand, evaluateFlatExpression } from "./eval";

export function interpret(
  input: string,
  env: Record<string, any> = {}
): number {
  let s = input.trim();

  // Helper: check for semicolons at top-level (not nested inside braces/parens)

  function hasTopLevelSemicolon(str: string) {
    return splitTopLevelStatements(str).length > 1;
  }

  function getLastTopLevelStatement(str: string) {
    const parts = splitTopLevelStatements(str)
      .map((p: string) => p.trim())
      .filter(Boolean);
    return parts.length ? parts[parts.length - 1] : null;
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
      if (/^let\b/.test(stmt)) {
        const m = stmt.match(
          /^let\s+([a-zA-Z_]\w*)(?:\s*:\s*([^=;]+))?\s*=\s*(.+)$/
        );
        if (!m) throw new Error("invalid let declaration");
        const name = m[1];
        const annotation = m[2] ? m[2].trim() : null;
        const rhs = m[3].trim();
        // duplicate declaration in same scope is an error
        if (declared.has(name)) throw new Error("duplicate declaration");
        // Handle initializer blocks: allow if the block's last top-level statement is an expression
        let rhsOperand: any;
        if (/^\s*\{[\s\S]*\}\s*$/.test(rhs)) {
          const inner = rhs.replace(/^\{\s*|\s*\}$/g, "");
          const last = getLastTopLevelStatement(inner);
          if (!last) throw new Error("initializer cannot be empty block");
          if (/^let\b/.test(last)) throw new Error("initializer cannot contain declarations");
          // evaluate inner block in isolated environment
          rhsOperand = interpret(inner, {});
        } else {
          // RHS is not a block; ensure it doesn't contain declaration keywords
          if (/^\s*let\b/.test(rhs) || /\{[^}]*\blet\b/.test(rhs))
            throw new Error("initializer cannot contain declarations");
          rhsOperand = evaluateReturningOperand(rhs, localEnv);
        }
        // if annotation is present, validate it matches the initializer strictly
        if (annotation) {
          // allow type-only annotation like 'I32' or 'U64'
          const typeOnly = annotation.match(/^\s*([uUiI])\s*(\d+)\s*$/);
          if (typeOnly) {
            const kind = typeOnly[1] === "u" || typeOnly[1] === "U" ? "u" : "i";
            const bits = Number(typeOnly[2]);
            if (!(rhsOperand as any).valueBig)
              throw new Error(
                "annotation must be integer type matching initializer"
              );
            if (
              (rhsOperand as any).kind !== kind ||
              (rhsOperand as any).bits !== bits
            )
              throw new Error("annotation kind/bits do not match initializer");
          } else if (/^\s*bool\s*$/i.test(annotation)) {
            // Bool annotation: initializer must be boolean-like
            if (
              !(rhsOperand as any).boolValue &&
              (rhsOperand as any).boolValue !== false
            )
              throw new Error("annotation Bool requires boolean initializer");
          } else {
            const ann = parseOperand(annotation);
            if (!ann) throw new Error("invalid annotation in let");
            // require annotation to be integer literal with suffix
            if (!(ann as any).valueBig)
              throw new Error("annotation must be integer literal with suffix");
            if (!(rhsOperand as any).valueBig)
              throw new Error(
                "initializer must be integer-like to match annotated literal"
              );
            // values must match
            if ((ann as any).valueBig !== (rhsOperand as any).valueBig)
              throw new Error("annotation value does not match initializer");
            // if initializer carries a kind, it must match the annotation kind/bits as well
            if ((rhsOperand as any).kind) {
              if (
                (ann as any).kind !== (rhsOperand as any).kind ||
                (ann as any).bits !== (rhsOperand as any).bits
              )
                throw new Error(
                  "annotation kind/bits do not match initializer"
                );
            }
            // otherwise initializer is plain integer — that's acceptable as long as value matches
          }
        }
        declared.add(name);
        localEnv[name] = rhsOperand;
        // `let` is a statement and does not return a value for the block/sequence
        last = undefined;
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
    // if the block/sequence contained only statements (no final expression), return 0
    if (last === undefined) return 0;
    // convert last to number
    if (last && (last as any).boolValue !== undefined)
      return (last as any).boolValue ? 1 : 0;
    if (last && (last as any).kind) return Number((last as any).valueBig);
    if (typeof last === "number") return last;
    if (last && (last as any).isFloat)
      return (last as any).floatValue as number;
    return Number((last as any).valueBig as bigint);
  }

  // If expression contains parentheses or braces, evaluate innermost grouped expressions first
  if (s.includes("(") || s.includes("{")) {
    let expr = s;
    const parenRegex = /\([^()]*\)|\{[^{}]*\}/;
    while (parenRegex.test(expr)) {
      const m = expr.match(parenRegex)![0];
      const inner = m.slice(1, -1);
      // if this inner group contains a declaration and it's used as an initializer
      // (i.e., preceded by a `let <name> =`), disallow it
      const idx = expr.indexOf(m);
      const prefix = expr.slice(0, idx);
      if (/\blet\s+[a-zA-Z_]\w*\s*=\s*$/.test(prefix)) {
        const last = getLastTopLevelStatement(inner);
        if (!last || /^let\b/.test(last))
          throw new Error("initializer cannot contain declarations");
      }
      // recursively interpret the inner group (pass env so variables are scoped if needed)
      const v = interpret(inner, env);
      // If we replaced a braced block inside another block and the next non-space
      // character after the block is another expression start (e.g., an identifier),
      // insert a semicolon to preserve statement separation. This avoids producing
      // constructs like `0 x` which are invalid when `{}` is used as a standalone
      // statement within a block.
      const after = expr.slice(idx + m.length);
      const afterMatch = after.match(/\s*([^\s])/);
      const afterNon = afterMatch ? afterMatch[1] : null;
      let replacement = String(v);
      if (m[0] === "{" && afterNon && !/[+\-*/%)}\]]/.test(afterNon)) {
        replacement = replacement + ";";
      }
      expr = expr.replace(m, replacement);
    }
    s = expr;

    // After replacing groups, it's possible we introduced top-level semicolons
    // (e.g., "{ let x = 10; } x" -> "0; x"). In that case, re-run the block/sequence
    // handler by delegating to `interpret` again so declarations remain scoped.
    if (hasTopLevelSemicolon(s) || /^let\b/.test(s)) {
      return interpret(s, env);
    }
  }

  // Parse and evaluate expressions with '+' and '-' (left-associative)
  // We'll parse tokens: operand (operator operand)* and evaluate left to right.
  const exprTokens: { op?: string; operand?: any }[] = [];
  let idx = 0;
  const len = s.length;
  function skipSpacesLocal() {
    while (idx < len && s[idx] === " ") idx++;
  }



  skipSpacesLocal();
  const first = parseOperandAt(s, idx);
  if (first) {
    exprTokens.push({ operand: first.operand });
    idx += first.len;
    skipSpacesLocal();
    while (idx < len) {
      skipSpacesLocal();
      // support multi-char logical operators '||' and '&&'
      let op: string | null = null;
      if (s.startsWith("||", idx)) {
        op = "||";
        idx += 2;
      } else if (s.startsWith("&&", idx)) {
        op = "&&";
        idx += 2;
      } else {
        const ch = s[idx];
        if (ch !== "+" && ch !== "-" && ch !== "*" && ch !== "/" && ch !== "%")
          break;
        op = ch;
        idx++;
      }
      skipSpacesLocal();
      const nxt = parseOperandAt(s, idx);
      if (!nxt) throw new Error("invalid operand after operator");
      exprTokens.push({ op, operand: nxt.operand });
      idx += nxt.len;
      skipSpacesLocal();
    }
  }



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
        if (val && (val as any).kind) return Number((val as any).valueBig);
        if (typeof val === "number") return val;
        if (val && (val as any).isFloat)
          return (val as any).floatValue as number;
        return Number((val as any).valueBig as bigint);
      }
    }
    return 0;
  }
  if ((single as any).kind) {
    const kind = (single as any).kind as string;
    const bits = (single as any).bits as number;
    const valueBig = (single as any).valueBig as bigint;
    return Number(valueBig);
  }
  if ((single as any).isFloat) return (single as any).floatValue as number;
  return Number((single as any).valueBig as bigint);
}
