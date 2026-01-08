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

export function interpret(input: string): number {
  const s = input.trim();

  // Parse and evaluate expressions with '+' and '-' (left-associative)
  // We'll parse tokens: operand (operator operand)* and evaluate left to right.
  const exprTokens: { op?: string; operand?: any }[] = [];
  let idx = 0;
  const len = s.length;
  function skipSpacesLocal() {
    while (idx < len && s[idx] === " ") idx++;
  }
  skipSpacesLocal();
  const firstMatch = s.slice(idx).match(/^([+-]?\d+(?:\.\d+)?(?:[uUiI]\d+)?)/);
  if (firstMatch) {
    exprTokens.push({ operand: parseOperand(firstMatch[1]) });
    if (!exprTokens[0].operand) throw new Error("invalid operand");
    idx += firstMatch[1].length;
    skipSpacesLocal();
    while (idx < len) {
      const ch = s[idx];
      if (ch !== "+" && ch !== "-" && ch !== "*" && ch !== "/" && ch !== "%")
        break;
      const op = ch;
      idx++;
      skipSpacesLocal();
      const m = s.slice(idx).match(/^([+-]?\d+(?:\.\d+)?(?:[uUiI]\d+)?)/);
      if (!m) throw new Error("invalid operand after operator");
      const operand = parseOperand(m[1]);
      if (!operand) throw new Error("invalid operand");
      exprTokens.push({ op, operand });
      idx += m[1].length;
      skipSpacesLocal();
    }
  }

  // Evaluate an expression string without parentheses, using operator precedence
  function evaluateFlatExpression(exprStr: string): number {
    const exprTokens: { op?: string; operand?: any }[] = [];
    let pos = 0;
    const L = exprStr.length;
    function skip() {
      while (pos < L && exprStr[pos] === ' ') pos++;
    }
    skip();
    const firstMatch = exprStr.slice(pos).match(/^([+-]?\d+(?:\.\d+)?(?:[uUiI]\d+)?)/);
    if (!firstMatch) throw new Error('invalid expression');
    exprTokens.push({ operand: parseOperand(firstMatch[1]) });
    if (!exprTokens[0].operand) throw new Error('invalid operand');
    pos += firstMatch[1].length;
    skip();
    while (pos < L) {
      const ch = exprStr[pos];
      if (!/[+\-*/%]/.test(ch)) throw new Error('invalid operator');
      const op = ch;
      pos++;
      skip();
      const m = exprStr.slice(pos).match(/^([+-]?\d+(?:\.\d+)?(?:[uUiI]\d+)?)/);
      if (!m) throw new Error('invalid operand after operator');
      const operand = parseOperand(m[1]);
      if (!operand) throw new Error('invalid operand');
      exprTokens.push({ op, operand });
      pos += m[1].length;
      skip();
    }

    // reuse evaluation logic
    const operands = exprTokens.map((t) => t.operand);
    const ops: string[] = [];
    for (let i = 1; i < exprTokens.length; i++) ops.push(exprTokens[i].op!);

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
    let result = operands[0];
    for (let j = 0; j < ops.length; j++) result = applyOpLocal(ops[j], result, operands[j + 1]);

    if (result && (result as any).kind) return Number((result as any).valueBig);
    if (typeof result === 'number') return result;
    if (result && (result as any).isFloat) return (result as any).floatValue as number;
    return Number((result as any).valueBig as bigint);
  }

  // If expression contains parentheses, evaluate innermost and replace
  if (s.includes('(')) {
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
