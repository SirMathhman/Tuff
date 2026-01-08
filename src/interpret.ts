/**
 * Interpret function.
 * - If the input starts with a numeric value (integer or float), returns that numeric value.
 * - Otherwise returns 0.
 * This allows inputs with type suffixes like `100U8` to be parsed as 100.
 */
function parseOperand(token: string) {
  const s = token.trim();
  // Match integer or float with optional suffix attached (e.g., 123, 1.23, 100U8)
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

export function interpret(input: string, env: Record<string, any> = {}): number {
  let s = input.trim();

  // Helper: check for semicolons at top-level (not nested inside braces/parens)
  function hasTopLevelSemicolon(str: string) {
    let depth = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === '(' || ch === '{') depth++;
      else if (ch === ')' || ch === '}') depth = Math.max(0, depth - 1);
      else if (ch === ';' && depth === 0) return true;
    }
    return false;
  }

  // If the input looks like a block (has top-level semicolons or starts with `let`), evaluate as a block
  if (hasTopLevelSemicolon(s) || /^let\b/.test(s)) {
    // simple block evaluator with lexical scoping (variables shadow parent env)
    const localEnv: Record<string, any> = { ...env };
    let last: any = undefined;
    const stmts = s.split(";");
    for (let raw of stmts) {
      const stmt = raw.trim();
      if (!stmt) continue;
      if (/^let\b/.test(stmt)) {
        const m = stmt.match(/^let\s+([a-zA-Z_]\w*)(?:\s*:\s*[^=;]+)?\s*=\s*(.+)$/);
        if (!m) throw new Error("invalid let declaration");
        const name = m[1];
        const rhs = m[2].trim();
        // evaluate RHS as an operand (preserving suffix/type when present)
        const rhsOperand = evaluateReturningOperand(rhs, localEnv);
        localEnv[name] = rhsOperand;
        last = rhsOperand;
      } else {
        last = evaluateReturningOperand(stmt, localEnv);
      }
    }
    // convert last to number
    if (last && (last as any).kind) return Number((last as any).valueBig);
    if (typeof last === "number") return last;
    if (last && (last as any).isFloat) return (last as any).floatValue as number;
    return Number((last as any).valueBig as bigint);
  }

  // If expression contains parentheses or braces, evaluate innermost grouped expressions first
  if (s.includes("(") || s.includes("{")) {
    let expr = s;
    const parenRegex = /\([^()]*\)|\{[^{}]*\}/;
    while (parenRegex.test(expr)) {
      const m = expr.match(parenRegex)![0];
      const inner = m.slice(1, -1);
      // recursively interpret the inner group (pass env so variables are scoped if needed)
      const v = interpret(inner, env);
      expr = expr.replace(m, String(v));
    }
    s = expr;
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
    const m = src.slice(pos).match(/^([+-]?\d+(?:\.\d+)?(?:[uUiI]\d+)?)/);
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
  function evaluateReturningOperand(exprStr: string, localEnv: Record<string, any>): any {
    const exprTokens: { op?: string; operand?: any }[] = [];
    let pos = 0;
    const L = exprStr.length;
    function skip() {
      while (pos < L && exprStr[pos] === ' ') pos++;
    }
    skip();
    const firstMatch = parseOperandAt(exprStr, pos);
    if (!firstMatch) throw new Error('invalid expression');
    exprTokens.push({ operand: firstMatch.operand });
    pos += firstMatch.len;
    skip();
    while (pos < L) {
      const ch = exprStr[pos];
      if (!/[+\-*/%]/.test(ch)) throw new Error('invalid operator');
      const op = ch;
      pos++;
      skip();
      const next = parseOperandAt(exprStr, pos);
      if (!next) throw new Error('invalid operand after operator');
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
      if (kind === 'u') {
        const max = (1n << BigInt(bits)) - 1n;
        if (sum < 0n || sum > max) throw new Error(`value out of range for U${bits}`);
      } else {
        const min = -(1n << BigInt(bits - 1));
        const max = (1n << BigInt(bits - 1)) - 1n;
        if (sum < min || sum > max) throw new Error(`value out of range for I${bits}`);
      }
    }

    function applyOpLocal(op: string, left: any, right: any): any {
      const leftHasKind = left && (left as any).kind !== undefined;
      const rightHasKind = right && (right as any).kind !== undefined;
      if (leftHasKind || rightHasKind) {
        const ref = leftHasKind ? left : right;
        const kind = (ref as any).kind as string;
        const bits = (ref as any).bits as number;
        if (leftHasKind && rightHasKind) {
          if ((left as any).kind !== (right as any).kind || (left as any).bits !== (right as any).bits)
            throw new Error('mismatched suffixes in binary operation');
        }
        if (!leftHasKind && (left as any).isFloat) throw new Error('mixed suffix and float not allowed');
        if (!rightHasKind && (right as any).isFloat) throw new Error('mixed suffix and float not allowed');

        let lBig: bigint;
        if (leftHasKind) lBig = (left as any).valueBig as bigint;
        else if (typeof left === 'number') lBig = BigInt(left as number);
        else lBig = (left as any).valueBig as bigint;

        let rBig: bigint;
        if (rightHasKind) rBig = (right as any).valueBig as bigint;
        else if (typeof right === 'number') rBig = BigInt(right as number);
        else rBig = (right as any).valueBig as bigint;

        let resBig: bigint;
        if (op === '+') resBig = lBig + rBig;
        else if (op === '-') resBig = lBig - rBig;
        else if (op === '*') resBig = lBig * rBig;
        else if (op === '/') {
          if (rBig === 0n) throw new Error('division by zero');
          resBig = lBig / rBig;
        } else if (op === '%') {
          if (rBig === 0n) throw new Error('modulo by zero');
          resBig = lBig % rBig;
        } else throw new Error('unsupported operator');

        checkRangeThrow(kind, bits, resBig);
        return { valueBig: resBig, kind: kind, bits };
      }

      const lNum = typeof left === 'number' ? left : (left as any).isFloat ? (left as any).floatValue : Number((left as any).valueBig);
      const rNum = typeof right === 'number' ? right : (right as any).isFloat ? (right as any).floatValue : Number((right as any).valueBig);
      if (op === '+') return lNum + rNum;
      if (op === '-') return lNum - rNum;
      if (op === '*') return lNum * rNum;
      if (op === '/') return lNum / rNum;
      if (op === '%') return lNum % rNum;
      throw new Error('unsupported operator');
    }

    // higher precedence pass
    let ii = 0;
    while (ii < ops.length) {
      if (ops[ii] === '*' || ops[ii] === '/' || ops[ii] === '%') {
        const res = applyOpLocal(ops[ii], operands[ii], operands[ii + 1]);
        operands.splice(ii, 2, res);
        ops.splice(ii, 1);
      } else ii++;
    }

    // low precedence
    let result: any = operands[0];
    for (let j = 0; j < ops.length; j++) result = applyOpLocal(ops[j], result, operands[j + 1]);

    return result;
  }
  skipSpacesLocal();
  const first = parseOperandAt(s, idx);
  if (first) {
    exprTokens.push({ operand: first.operand });
    idx += first.len;
    skipSpacesLocal();
    while (idx < len) {
      const ch = s[idx];
      if (ch !== "+" && ch !== "-" && ch !== "*" && ch !== "/" && ch !== "%")
        break;
      const op = ch;
      idx++;
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
    if (opnd && (opnd as any).kind) return Number((opnd as any).valueBig);
    if (typeof opnd === "number") return opnd;
    if (opnd && (opnd as any).isFloat) return (opnd as any).floatValue as number;
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

  // If expression contains any operators, evaluate it as a flat expression
  if (/[+\-*/%]/.test(s)) {
    return evaluateFlatExpression(s);
  }

  // fallback: single operand parse
  const single = parseOperand(s);
  if (!single) return 0;
  if ((single as any).kind) {
    const kind = (single as any).kind as string;
    const bits = (single as any).bits as number;
    const valueBig = (single as any).valueBig as bigint;
    return Number(valueBig);
  }
  if ((single as any).isFloat) return (single as any).floatValue as number;
  return Number((single as any).valueBig as bigint);
}
