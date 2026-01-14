const RANGES: Record<string, { min: bigint; max: bigint }> = {
  U8: { min: 0n, max: 255n },
  U16: { min: 0n, max: 65535n },
  U32: { min: 0n, max: 4294967295n },
  U64: { min: 0n, max: 18446744073709551615n },
  I8: { min: -128n, max: 127n },
  I16: { min: -32768n, max: 32767n },
  I32: { min: -2147483648n, max: 2147483647n },
  I64: { min: -9223372036854775808n, max: 9223372036854775807n },
};

type TypedVal = { value: number; type?: string; mutable?: boolean };
type Scope = Record<string, TypedVal>;
type InternalScope = { values: Scope; parent?: InternalScope };

function getFromScope(
  scope: InternalScope,
  name: string
): TypedVal | undefined {
  if (name in scope.values) return scope.values[name];
  if (scope.parent) return getFromScope(scope.parent, name);
  return undefined;
}

function updateInScope(
  scope: InternalScope,
  name: string,
  val: TypedVal
): void {
  if (name in scope.values || !scope.parent) {
    scope.values[name] = val;
  } else {
    updateInScope(scope.parent, name, val);
  }
}

function parseToken(token: string, scope: InternalScope): TypedVal {
  if (token === "true") return { value: 1, type: "bool" };
  if (token === "false") return { value: 0, type: "bool" };
  const inScope = getFromScope(scope, token);
  if (inScope) return inScope;
  const m = token.match(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
  if (!m) throw new Error(`Invalid token: ${token}`);
  const numStr = m[0];
  const n = parseFloat(numStr);
  if (Number.isNaN(n)) throw new Error("Invalid number");

  const rest = token.slice(numStr.length);
  if (rest.length === 0) return { value: n };

  const sufMatch = rest.match(/^([uUiI])(8|16|32|64)(.*)$/);
  if (!sufMatch) return { value: n };

  const sign = sufMatch[1].toUpperCase();
  const bits = parseInt(sufMatch[2], 10);

  if (!/^[-+]?\d+$/.test(numStr)) {
    throw new Error("Integer required for integer type suffix");
  }

  const intVal = Number(numStr);

  const key = `${sign}${bits}`;
  const range = RANGES[key];
  if (!range) return { value: n };

  const big = BigInt(intVal);
  if (big < range.min || big > range.max)
    throw new Error(`${key} out of range`);

  if (
    bits === 64 &&
    (big > BigInt(Number.MAX_SAFE_INTEGER) ||
      big < BigInt(Number.MIN_SAFE_INTEGER))
  ) {
    throw new Error(`${key} value not representable as a JavaScript number`);
  }

  return { value: Number(intVal), type: key };
}

function promoteTypes(type1?: string, type2?: string): string | undefined {
  if (!type1) return type2;
  if (!type2) return type1;
  const r1 = RANGES[type1];
  const r2 = RANGES[type2];
  return r1.max >= r2.max ? type1 : type2;
}

function checkOverflow(value: number, type?: string): void {
  if (type) {
    const r = RANGES[type];
    const big = BigInt(Math.floor(value));
    if (big < r.min || big > r.max) throw new Error(`${type} overflow`);
  }
}

function applyOp(left: TypedVal, right: TypedVal, op: string): TypedVal {
  let res: number;
  let type = promoteTypes(left.type, right.type);
  if (op === "*") res = left.value * right.value;
  else if (op === "/") res = left.value / right.value;
  else if (op === "+") res = left.value + right.value;
  else if (op === "-") res = left.value - right.value;
  else if (op === "<") {
    res = left.value < right.value ? 1 : 0;
    type = "bool";
  } else if (op === ">") {
    res = left.value > right.value ? 1 : 0;
    type = "bool";
  } else if (op === "<=") {
    res = left.value <= right.value ? 1 : 0;
    type = "bool";
  } else if (op === ">=") {
    res = left.value >= right.value ? 1 : 0;
    type = "bool";
  } else if (op === "==") {
    res = left.value === right.value ? 1 : 0;
    type = "bool";
  } else if (op === "!=") {
    res = left.value !== right.value ? 1 : 0;
    type = "bool";
  } else throw new Error(`Unknown operator: ${op}`);
  if (type !== "bool") checkOverflow(res, type);
  return { value: res, type };
}

function evaluateExpression(
  s: string,
  tokens: Array<{ text: string; index: number }>,
  scope: InternalScope
): TypedVal {
  const parsed = tokens.map((t) => ({
    ...parseToken(t.text, scope),
    text: t.text,
    index: t.index,
  }));

  const ops: string[] = [];
  for (let i = 1; i < parsed.length; i++) {
    const between = s.slice(
      parsed[i - 1].index + parsed[i - 1].text.length,
      parsed[i].index
    );
    const opMatch = between.match(/==|!=|<=|>=|[+\-*/<>]/);
    if (!opMatch) throw new Error("Invalid operator between operands");
    ops.push(opMatch[0]);
  }

  const values: TypedVal[] = parsed.map((p) => ({ value: p.value, type: p.type }));
  const currentOps = [...ops];

  const processPass = (targetOps: string[]) => {
    for (let i = 0; i < currentOps.length; i++) {
      if (targetOps.includes(currentOps[i])) {
        const res = applyOp(values[i], values[i + 1], currentOps[i]);
        values.splice(i, 2, res);
        currentOps.splice(i, 1);
        i--;
      }
    }
  };

  processPass(["*", "/"]);
  processPass(["+", "-"]);
  processPass(["<", ">", "<=", ">="]);
  processPass(["==", "!="]);

  return { value: values[0].value, type: values[0].type };
}

function checkNarrowing(targetType: string, sourceType: string): void {
  const target = RANGES[targetType];
  const source = RANGES[sourceType];
  if (target.max < source.max || target.min > source.min) {
    throw new Error(
      `Incompatible types: cannot implicitly narrow ${sourceType} to ${targetType}`
    );
  }
}

function handleLet(
  st: string,
  scope: InternalScope,
  localDecls: Set<string>
): TypedVal {
  const m = st.match(
    /^let\s+(mut\s+)?([a-zA-Z_]\w*)\s*(?::\s*([uUiI](?:8|16|32|64)))?(?:\s*=\s*(.+))?$/
  );
  if (!m) throw new Error("Invalid let declaration");
  const [, mutS, name, type, expr] = m;
  if (localDecls.has(name)) {
    throw new Error(`Variable already declared in this scope: ${name}`);
  }
  let res: TypedVal = { value: 0, type };
  if (expr) {
    res = interpretRaw(expr, scope);
    if (type && res.type) checkNarrowing(type, res.type);
  }
  const finalType = type || res.type;
  if (finalType) checkOverflow(res.value, finalType);
  scope.values[name] = { value: res.value, type: finalType, mutable: !!mutS };
  localDecls.add(name);
  return res;
}

function handleAssign(st: string, scope: InternalScope): TypedVal {
  const m = st.match(/^([a-zA-Z_]\w*)\s*=\s*(.+)$/);
  if (!m) throw new Error("Invalid assignment");
  const [, name, expr] = m;
  const existing = getFromScope(scope, name);
  if (!existing) throw new Error(`Variable not declared: ${name}`);
  if (!existing.mutable) {
    throw new Error(`Cannot assign to immutable variable: ${name}`);
  }
  const res = interpretRaw(expr, scope);
  const targetType = existing.type;
  if (targetType && res.type) checkNarrowing(targetType, res.type);
  if (targetType) checkOverflow(res.value, targetType);
  updateInScope(scope, name, {
    value: res.value,
    type: targetType || res.type,
    mutable: true,
  });
  return res;
}

function findClosingBrace(s: string, startPos: number): number {
  let d = 0;
  for (let i = startPos; i < s.length; i++) {
    if (s[i] === "{") d++;
    else if (s[i] === "}") {
      if (--d === 0) return i;
    }
  }
  return -1;
}

function parseBranch(s: string, pos: number): { content: string; end: number } {
  while (pos < s.length && /\s/.test(s[pos])) pos++;
  if (s[pos] === "{") {
    const end = findClosingBrace(s, pos);
    if (end === -1) throw new Error("Missing closing brace for branch");
    return { content: s.slice(pos + 1, end), end: end + 1 };
  }
  const elseMatch = s.slice(pos).match(/\belse\b/);
  if (elseMatch) {
    const content = s.slice(pos, pos + elseMatch.index!).trim();
    return { content, end: pos + elseMatch.index! };
  }
  return { content: s.slice(pos).trim(), end: s.length };
}

function handleIf(
  s: string,
  scope: InternalScope
): { val: TypedVal; end: number } {
  const condStart = s.indexOf("(");
  if (condStart === -1) throw new Error("Missing condition in if");
  let d = 0,
    condEnd = -1;
  for (let i = condStart; i < s.length; i++) {
    if (s[i] === "(") d++;
    else if (s[i] === ")") {
      if (--d === 0) {
        condEnd = i;
        break;
      }
    }
  }
  if (condEnd === -1) throw new Error("Missing closing paren for if condition");
  const condition = interpretRaw(s.slice(condStart + 1, condEnd), scope);
  const thenRes = parseBranch(s, condEnd + 1);
  let finalPos = thenRes.end;
  let elsePart: string | undefined;

  let checkElse = finalPos;
  while (checkElse < s.length && /\s/.test(s[checkElse])) checkElse++;
  if (s.slice(checkElse).startsWith("else")) {
    const elseRes = parseBranch(s, checkElse + 4);
    elsePart = elseRes.content;
    finalPos = elseRes.end;
  }

  const res = condition.value
    ? interpretRaw(thenRes.content, { values: {}, parent: scope })
    : elsePart !== undefined
    ? interpretRaw(elsePart, { values: {}, parent: scope })
    : { value: 0 };
  return { val: res, end: finalPos };
}

function resolveIfExpressions(s: string, scope: InternalScope): string {
  let res = s;
  while (true) {
    let ifIdx = -1;
    let searchPos = res.length;
    while (searchPos >= 0) {
      const found = res.lastIndexOf("if", searchPos);
      if (found === -1) break;
      if (
        (found === 0 || !/[a-zA-Z0-9_]/.test(res[found - 1])) &&
        (found + 2 === res.length || !/[a-zA-Z0-9_]/.test(res[found + 2]))
      ) {
        ifIdx = found;
        break;
      }
      searchPos = found - 1;
    }

    if (ifIdx === -1) break;
    const { val, end } = handleIf(res.slice(ifIdx), scope);
    res =
      res.slice(0, ifIdx) +
      val.value +
      (val.type ?? "") +
      res.slice(ifIdx + end);
  }
  return res;
}

function splitStatements(s: string): string[] {
  const result: string[] = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s[i];
    if (char === "{" || char === "(") depth++;
    if (char === "}" || char === ")") depth--;
    if (char === ";" && depth === 0) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function resolveBrackets(s: string, scope: InternalScope): string {
  let res = s.trim();
  while (res.includes("(") || res.includes("{")) {
    const lastOpenParen = res.lastIndexOf("(");
    const lastOpenCurly = res.lastIndexOf("{");
    const isCurly = lastOpenCurly > lastOpenParen;
    const lastOpen = isCurly ? lastOpenCurly : lastOpenParen;
    const closeChar = isCurly ? "}" : ")";
    const nextClose = res.indexOf(closeChar, lastOpen);
    if (nextClose === -1) {
      throw new Error(
        `Missing closing ${isCurly ? "curly brace" : "parenthesis"}`
      );
    }
    const internal = res.slice(lastOpen + 1, nextClose);
    const result = interpretRaw(
      internal,
      isCurly ? { values: {}, parent: scope } : scope
    );
    const following = res.slice(nextClose + 1).trim();
    const needsSemicolon =
      isCurly && following.length > 0 && !/^[+\-*/%|&^=]/.test(following);
    res =
      res.slice(0, lastOpen) +
      result.value +
      (result.type ?? "") +
      (needsSemicolon ? ";" : "") +
      res.slice(nextClose + 1);
  }
  return res;
}

function evaluateStatements(s: string, scope: InternalScope): TypedVal {
  const statements = splitStatements(s);
  let lastVal: TypedVal = { value: 0 };
  const localDecls = new Set<string>();

  for (const rawSt of statements) {
    let st = resolveIfExpressions(rawSt, scope);
    st = resolveBrackets(st, scope);
    if (!st) continue;
    if (st.includes(";") && splitStatements(st).length > 1) {
      lastVal = evaluateStatements(st, scope);
      continue;
    }
    if (st.startsWith("let ")) {
      lastVal = handleLet(st, scope, localDecls);
    } else if (st.includes("=") && st.match(/^[a-zA-Z_]\w*\s*=/)) {
      lastVal = handleAssign(st, scope);
    } else {
      const tokenRegex =
        /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?(?:[uUiI](?:8|16|32|64))?|[a-zA-Z_]\w*/g;
      const tokens: Array<{ text: string; index: number }> = [];
      let m: RegExpExecArray | null;
      while ((m = tokenRegex.exec(st))) {
        tokens.push({ text: m[0], index: m.index });
      }
      if (tokens.length === 0) throw new Error("Invalid statement");
      lastVal =
        tokens.length === 1
          ? parseToken(tokens[0].text, scope)
          : evaluateExpression(st, tokens, scope);
    }
  }
  return lastVal;
}

function interpretRaw(input: string, scope: InternalScope): TypedVal {
  return evaluateStatements(input, scope);
}

export function interpret(input: string, scope: Scope = {}): number {
  return interpretRaw(input, { values: scope }).value;
}
