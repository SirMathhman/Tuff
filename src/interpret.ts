/**
 * Interpret function.
 * - If the input starts with a numeric value (integer or float), returns that numeric value.
 * - Otherwise returns 0.
 * This allows inputs with type suffixes like `100U8` to be parsed as 100.
 */
function parseOperand(token: string) {
  const s = token.trim();
  // Match integer or float with optional suffix attached (e.g., 123, 1.23, 100U8)
  // boolean literals
  if (/^true$/i.test(s)) return { boolValue: true };
  if (/^false$/i.test(s)) return { boolValue: false };

  const m = s.match(/^([+-]?\d+(?:\.\d+)?)([uUiI]\d+)?$/);
  if (!m) return null;
  const numStr = m[1];
  const suffix = m[2];

  if (suffix) {
    const sufMatch = suffix.match(/^([uUiI])(\d+)$/)!;
    const kind = sufMatch[1];
    const bits = Number(sufMatch[2]);
    // Suffix requires integer (no decimal part)
    if (!/^[-+]?\d+$/.test(numStr))
      throw new Error("suffix requires integer value");
    const valueBig = BigInt(numStr);
    if (kind === "u" || kind === "U") {
      if (valueBig < 0n)
        throw new Error("negative numbers with suffixes are not allowed");
      const max = (1n << BigInt(bits)) - 1n;
      if (valueBig > max) throw new Error(`value out of range for U${bits}`);
      return { valueBig, kind: "u", bits };
    }
    // signed
    const min = -(1n << BigInt(bits - 1));
    const max = (1n << BigInt(bits - 1)) - 1n;
    if (valueBig < min || valueBig > max)
      throw new Error(`value out of range for I${bits}`);
    return { valueBig, kind: "i", bits };
  }

  // no suffix: accept float or integer
  if (numStr.includes(".")) {
    return { floatValue: Number(numStr), isFloat: true };
  }
  return { valueBig: BigInt(numStr), isFloat: false };
}

export function interpret(
  input: string,
  env: Record<string, any> = {}
): number {
  let s = input.trim();

  // Helper: check for semicolons at top-level (not nested inside braces/parens)
  function hasTopLevelSemicolon(str: string) {
    return splitTopLevelStatements(str).length > 1;
  }

  function splitTopLevelStatements(str: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === "(" || ch === "{") depth++;
      else if (ch === ")" || ch === "}") depth = Math.max(0, depth - 1);
      else if (ch === ";" && depth === 0) {
        parts.push(str.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(str.slice(start));
    return parts;
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
          const parts = splitTopLevelStatements(inner)
            .map((p) => p.trim())
            .filter(Boolean);
          const last = parts.length ? parts[parts.length - 1] : null;
          if (!last) throw new Error("initializer cannot be empty block");
          if (/^let\b/.test(last))
            throw new Error("initializer cannot contain declarations");
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
        const parts = splitTopLevelStatements(inner)
          .map((p) => p.trim())
          .filter(Boolean);
        const last = parts.length ? parts[parts.length - 1] : null;
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

  function parseOperandAt(src: string, pos: number) {
    // Try numeric/suffixed literal first
    const m = src
      .slice(pos)
      .match(/^([+-]?\d+(?:\.\d+)?(?:[uUiI]\d+)?|true|false)/i);
    if (m) {
      const operand = parseOperand(m[1]);
      if (!operand) throw new Error("invalid operand");
      return { operand, len: m[1].length };
    }
    // fallback: identifier
    const id = src.slice(pos).match(/^([a-zA-Z_]\w*)/);
    if (id) return { operand: { ident: id[1] }, len: id[1].length };
    return null;
  }

  // Evaluate and return the final operand (object or number) so callers can preserve types
  function evaluateReturningOperand(
    exprStr: string,
    localEnv: Record<string, any>
  ): any {
    const exprTokens: { op?: string; operand?: any }[] = [];
    let pos = 0;
    const L = exprStr.length;
    function skip() {
      while (pos < L && exprStr[pos] === " ") pos++;
    }
    skip();
    const firstMatch = parseOperandAt(exprStr, pos);
    if (!firstMatch) throw new Error("invalid expression");
    exprTokens.push({ operand: firstMatch.operand });
    pos += firstMatch.len;
    skip();
    while (pos < L) {
      skip();
      // support multi-char logical operators '||' and '&&'
      let op: string | null = null;
      if (exprStr.startsWith("||", pos)) {
        op = "||";
        pos += 2;
      } else if (exprStr.startsWith("&&", pos)) {
        op = "&&";
        pos += 2;
      } else if (exprStr.startsWith("==", pos)) {
        op = "==";
        pos += 2;
      } else if (exprStr.startsWith("!=", pos)) {
        op = "!=";
        pos += 2;
      } else if (exprStr.startsWith("<=", pos)) {
        op = "<=";
        pos += 2;
      } else if (exprStr.startsWith(">=", pos)) {
        op = ">=";
        pos += 2;
      } else {
        const ch = exprStr[pos];
        if (!/[+\-*/%<>]/.test(ch)) throw new Error("invalid operator");
        op = ch;
        pos++;
      }
      skip();
      const next = parseOperandAt(exprStr, pos);
      if (!next) throw new Error("invalid operand after operator");
      exprTokens.push({ op, operand: next.operand });
      pos += next.len;
      skip();
    }

    // build operands and ops
    let operands = exprTokens.map((t) => t.operand);
    const ops: string[] = [];
    for (let i = 1; i < exprTokens.length; i++) ops.push(exprTokens[i].op!);

    // resolve identifiers from localEnv
    operands = operands.map((op) => {
      if (op && (op as any).ident) {
        const n = (op as any).ident as string;
        if (!(n in localEnv)) throw new Error(`unknown identifier ${n}`);
        return localEnv[n];
      }
      return op;
    });

    function checkRangeThrow(kind: string, bits: number, sum: bigint) {
      if (kind === "u") {
        const max = (1n << BigInt(bits)) - 1n;
        if (sum < 0n || sum > max)
          throw new Error(`value out of range for U${bits}`);
      } else {
        const min = -(1n << BigInt(bits - 1));
        const max = (1n << BigInt(bits - 1)) - 1n;
        if (sum < min || sum > max)
          throw new Error(`value out of range for I${bits}`);
      }
    }

    function isTruthy(val: any): boolean {
      if (val && (val as any).boolValue !== undefined)
        return !!(val as any).boolValue;
      if (val && (val as any).valueBig !== undefined)
        return (val as any).valueBig !== 0n;
      if (typeof val === "number") return val !== 0;
      if (val && (val as any).isFloat) return (val as any).floatValue !== 0;
      return false;
    }

    function applyOpLocal(op: string, left: any, right: any): any {
      // logical operators are evaluated first here (they can apply to any truthy/falsy values)
      if (op === "||") {
        if (isTruthy(left)) return { boolValue: true };
        return { boolValue: isTruthy(right) };
      }
      if (op === "&&") {
        if (!isTruthy(left)) return { boolValue: false };
        return { boolValue: isTruthy(right) };
      }

      const leftHasKind = left && (left as any).kind !== undefined;
      const rightHasKind = right && (right as any).kind !== undefined;
      if (leftHasKind || rightHasKind) {
        const ref = leftHasKind ? left : right;
        const kind = (ref as any).kind as string;
        const bits = (ref as any).bits as number;
        if (leftHasKind && rightHasKind) {
          if (
            (left as any).kind !== (right as any).kind ||
            (left as any).bits !== (right as any).bits
          )
            throw new Error("mismatched suffixes in binary operation");
        }
        if (!leftHasKind && (left as any).isFloat)
          throw new Error("mixed suffix and float not allowed");
        if (!rightHasKind && (right as any).isFloat)
          throw new Error("mixed suffix and float not allowed");

        let lBig: bigint;
        if (leftHasKind) lBig = (left as any).valueBig as bigint;
        else if (typeof left === "number") lBig = BigInt(left as number);
        else lBig = (left as any).valueBig as bigint;

        let rBig: bigint;
        if (rightHasKind) rBig = (right as any).valueBig as bigint;
        else if (typeof right === "number") rBig = BigInt(right as number);
        else rBig = (right as any).valueBig as bigint;

        let resBig: bigint;
        if (op === "+") resBig = lBig + rBig;
        else if (op === "-") resBig = lBig - rBig;
        else if (op === "*") resBig = lBig * rBig;
        else if (op === "/") {
          if (rBig === 0n) throw new Error("division by zero");
          resBig = lBig / rBig;
        } else if (op === "%") {
          if (rBig === 0n) throw new Error("modulo by zero");
          resBig = lBig % rBig;
        } else throw new Error("unsupported operator");

        checkRangeThrow(kind, bits, resBig);
        return { valueBig: resBig, kind: kind, bits };
      }

      const leftIsBool = left && (left as any).boolValue !== undefined;
      const rightIsBool = right && (right as any).boolValue !== undefined;
      const lNum =
        typeof left === "number"
          ? left
          : (left as any).isFloat
          ? (left as any).floatValue
          : leftIsBool
          ? (left as any).boolValue
            ? 1
            : 0
          : Number((left as any).valueBig);
      const rNum =
        typeof right === "number"
          ? right
          : (right as any).isFloat
          ? (right as any).floatValue
          : rightIsBool
          ? (right as any).boolValue
            ? 1
            : 0
          : Number((right as any).valueBig);
      if (op === "+") return lNum + rNum;
      if (op === "-") return lNum - rNum;
      if (op === "*") return lNum * rNum;
      if (op === "/") return lNum / rNum;
      if (op === "%") return lNum % rNum;
      if (op === "<") return { boolValue: lNum < rNum };
      if (op === ">") return { boolValue: lNum > rNum };
      if (op === "<=") return { boolValue: lNum <= rNum };
      if (op === ">=") return { boolValue: lNum >= rNum };
      if (op === "==") return { boolValue: lNum == rNum };
      if (op === "!=") return { boolValue: lNum != rNum };
      throw new Error("unsupported operator");
    }

    function applyPrecedence(opSet: Set<string>) {
      let i = 0;
      while (i < ops.length) {
        if (opSet.has(ops[i])) {
          const res = applyOpLocal(ops[i], operands[i], operands[i + 1]);
          operands.splice(i, 2, res);
          ops.splice(i, 1);
        } else i++;
      }
    }

    applyPrecedence(new Set(["*", "/", "%"]));
    applyPrecedence(new Set(["+", "-"]));
    // comparison operators
    applyPrecedence(new Set(["<", ">", "<=", ">=", "==", "!="]));
    applyPrecedence(new Set(["&&"]));
    applyPrecedence(new Set(["||"]));

    // final result is operands[0]
    let result: any = operands[0];
    return result;
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

  // Evaluate an expression string without parentheses, using operator precedence
  function evaluateFlatExpression(exprStr: string): number {
    const opnd = evaluateReturningOperand(exprStr, env);
    if (opnd && (opnd as any).boolValue !== undefined)
      return (opnd as any).boolValue ? 1 : 0;
    if (opnd && (opnd as any).kind) return Number((opnd as any).valueBig);
    if (typeof opnd === "number") return opnd;
    if (opnd && (opnd as any).isFloat)
      return (opnd as any).floatValue as number;
    return Number((opnd as any).valueBig as bigint);
  }

  // If expression contains parentheses, evaluate innermost and replace
  if (s.includes("(")) {
    let expr = s;
    const parenRegex = /\([^()]*\)/;
    while (parenRegex.test(expr)) {
      const m = expr.match(parenRegex)![0];
      const inner = m.slice(1, -1);
      const v = evaluateFlatExpression(inner);
      expr = expr.replace(m, String(v));
    }
    return evaluateFlatExpression(expr);
  }

  // If expression contains any operators (including logical/comparison), evaluate it as a flat expression
  if (/\|\||&&|<=|>=|==|!=|[+\-*/%<>]/.test(s)) {
    return evaluateFlatExpression(s);
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
