function replaceBraces(expr: string): string {
  const braceRegex = /\{[^{}]*\}/;
  while (braceRegex.test(expr)) {
    expr = expr.replace(braceRegex, (match) => {
      const inner = match.slice(1, -1).trim();
      const { vars, body, error } = parseLetBindings(inner, { inBraces: true });

      if (error) return "NaN";

      if (vars.size > 0) {
        const substituted = substituteVarsInString(body, vars);
        return evalToString(substituted);
      }

      return evalToString(body);
    });
  }
  return expr;
}

function replaceParens(expr: string): string {
  const parenRegex = /\([^()]*\)/;
  while (parenRegex.test(expr)) {
    expr = expr.replace(parenRegex, (match) => {
      const inner = match.slice(1, -1);
      return evalToString(inner);
    });
  }
  return expr;
}

function evalToString(expr: string): string {
  const val = interpret(expr);
  return Number.isNaN(val) ? "NaN" : String(val);
}

function replaceIfExpressions(expr: string): string {
  let processing = true;
  while (expr.indexOf("if") !== -1 && processing) {
    const idx = expr.indexOf("if");
    let pos = idx + 2;
    while (pos < expr.length && expr[pos] === " ") pos++;

    let condStr = "";
    let malformed = false;
    if (expr[pos] === "(") {
      const end = expr.indexOf(")", pos + 1);
      if (end === -1) {
        malformed = true;
      } else {
        condStr = expr.slice(pos + 1, end).trim();
        pos = end + 1;
      }
    } else {
      const m = expr.slice(pos).match(/^\S+/);
      if (!m) {
        malformed = true;
      } else {
        condStr = m[0];
        pos += m[0].length;
      }
    }

    const elseIdx = expr.indexOf("else", pos);
    if (elseIdx === -1) malformed = true;

    if (!malformed) {
      const thenStr = expr.slice(pos, elseIdx).trim();
      const elseStr = expr.slice(elseIdx + 4).trim();

      const condVal = interpret(condStr);
      const chosenStr = condVal && !Number.isNaN(condVal) ? thenStr : elseStr;
      const chosenVal = interpret(chosenStr);

      expr = expr.slice(0, idx) + String(chosenVal);
    } else {
      processing = false;
    }
  }
  return expr;
}

function evalTokens(expr: string): number {
  const tokens = expr.match(/-?\d+(?:\.\d+)?|[+\-*/]/g);
  if (!tokens || tokens.length === 0) return Number(expr);
  if (!/^(-?\d)/.test(tokens[0])) return Number(expr);

  const afterMulDiv: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if ((tk === "*" || tk === "/") && afterMulDiv.length > 0) {
      const prev = Number(afterMulDiv.pop());
      const next = Number(tokens[++i]);
      const res = tk === "*" ? prev * next : prev / next;
      afterMulDiv.push(String(res));
    } else {
      afterMulDiv.push(tk);
    }
  }

  let acc = Number(afterMulDiv[0]);
  for (let i = 1; i < afterMulDiv.length; i += 2) {
    const op = afterMulDiv[i];
    const next = Number(afterMulDiv[i + 1]);
    if (op === "+") acc += next;
    else if (op === "-") acc -= next;
    else return Number(expr);
  }
  return acc;
}

function findSemicolonAtDepthZero(s: string, startPos: number): number {
  let pos = startPos;
  let depth = 0;
  while (pos < s.length) {
    const ch = s[pos];
    if (ch === "(" || ch === "{") depth++;
    else if (ch === ")" || ch === "}") depth = Math.max(0, depth - 1);
    else if (ch === ";" && depth === 0) return pos;
    pos++;
  }
  return -1;
}

function findClosingBrace(s: string, startPos: number): number {
  if (s[startPos] !== "{") return -1;
  let pos = startPos + 1;
  let depth = 1;
  while (pos < s.length) {
    const ch = s[pos];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return pos;
    }
    pos++;
  }
  return -1;
}

function substituteVarsInString(s: string, vars: Map<string, number>): string {
  let out = s;
  for (const [n, v] of vars) {
    out = out.replace(new RegExp("\\b" + n + "\\b", "g"), String(v));
  }
  return out;
}

type FuncDef = {
  params: string[];
  paramTypes: string[];
  body: string; // inner of braces
};

let currentTopFuncs: Map<string, FuncDef> | undefined = undefined;

function readIdentifierAt(
  expr: string,
  i: number
): { name: string; end: number } | undefined {
  if (!/[A-Za-z_$]/.test(expr[i])) return undefined;
  let j = i + 1;
  while (j < expr.length && /[\w$]/.test(expr[j])) j++;
  return { name: expr.slice(i, j), end: j };
}

function findMatchingParen(expr: string, start: number): number {
  // start is index of '('
  let pos = start + 1;
  let depth = 0;
  while (pos < expr.length) {
    const c = expr[pos];
    if (c === "(") depth++;
    else if (c === ")") {
      if (depth === 0) return pos;
      depth--;
    }
    pos++;
  }
  return -1;
}

function splitArgs(argsStr: string): string[] {
  const args: string[] = [];
  let astart = 0;
  let ad = 0;
  for (let p = 0; p <= argsStr.length; p++) {
    const ch2 = argsStr[p];
    if (p === argsStr.length || (ch2 === "," && ad === 0)) {
      args.push(argsStr.slice(astart, p).trim());
      astart = p + 1;
    } else if (ch2 === "(") ad++;
    else if (ch2 === ")") ad = Math.max(0, ad - 1);
  }
  return args;
}

function parseLetBindings(
  input: string,
  options: { inBraces?: boolean } = {}
): {
  vars: Map<string, number>;
  body: string;
  error?: "rhsNaN" | "duplicate" | "badType";
} {
  let text = input;
  const vars = new Map<string, number>();
  let done = false;

  while (!done) {
    const header = text.match(
      /^let\s+([a-zA-Z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)\s*=\s*/
    );
    if (!header) {
      done = true;
    } else {
      const name = header[1];
      let endPos = -1;

      if (options.inBraces) {
        // In braces: let declaration ends at semicolon
        const semiIdx = text.indexOf(";", header[0].length);
        if (semiIdx !== -1) {
          endPos = semiIdx;
        }
      } else {
        // At top level: use depth tracking
        endPos = findSemicolonAtDepthZero(text, header[0].length);
      }

      if (endPos === -1) {
        done = true;
      } else {
        const type = header[2];
        if (type !== "I32" && type !== "Bool") {
          return { vars: new Map(), body: text, error: "badType" };
        }
        if (vars.has(name)) {
          return { vars: new Map(), body: text, error: "duplicate" };
        }

        const rhs = text.slice(header[0].length, endPos).trim();
        const substituted = substituteVarsInString(rhs, vars);
        let rhsVal = interpret(substituted);
        if (Number.isNaN(rhsVal)) {
          return { vars: new Map(), body: text, error: "rhsNaN" };
        }

        // Coerce bools to 0/1
        if (type === "Bool") rhsVal = rhsVal ? 1 : 0;

        vars.set(name, rhsVal);
        text = text.slice(endPos + 1).trim();
      }
    }
  }

  return { vars, body: text };
}

function processTopLevelLets(expr: string): number | undefined {
  const s = expr.trim();
  const { vars, body, error } = parseLetBindings(s);

  if (error) return NaN;

  if (vars.size > 0) {
    const substituted = substituteVarsInString(body, vars);
    return interpret(substituted);
  }
  return undefined;
}

function replaceFunctionCalls(expr: string): string {
  if (!currentTopFuncs || currentTopFuncs.size === 0) return expr;

  function tryReplaceAt(i: number): { expr: string; newIndex: number } | undefined {
    const id = readIdentifierAt(expr, i);
    if (!id) return undefined;
    const name = id.name;
    let k = id.end;
    while (k < expr.length && expr[k] === " ") k++;
    if (expr[k] !== "(") return undefined;
    const end = findMatchingParen(expr, k);
    if (end === -1) return undefined;

    const argsStr = expr.slice(k + 1, end);
    const fn = currentTopFuncs!.get(name);
    if (!fn) return undefined;

    const args = splitArgs(argsStr);

    // evaluate args
    const vals: number[] = [];
    for (const a of args) {
      const replaced = replaceFunctionCalls(a);
      const v = interpret(replaced);
      if (Number.isNaN(v)) {
        vals.push(NaN);
      } else vals.push(v);
    }

    if (vals.length !== fn.params.length) return undefined;

    const paramMap = new Map<string, number>();
    for (let idx = 0; idx < fn.params.length; idx++)
      paramMap.set(fn.params[idx], vals[idx]);

    const bodyWithParams = substituteVarsInString(fn.body, paramMap);

    const yieldMatch = bodyWithParams.match(/\byield\s+([\s\S]*?)\s*;?\s*$/);
    let callVal: number;
    if (yieldMatch) callVal = interpret(yieldMatch[1]);
    else {
      const parsed = parseLetBindings(bodyWithParams, { inBraces: true });
      if (parsed.error) callVal = NaN;
      else {
        const finalBody = substituteVarsInString(parsed.body, parsed.vars);
        callVal = interpret(finalBody);
      }
    }

    const newExpr = expr.slice(0, i) + String(callVal) + expr.slice(end + 1);
    return { expr: newExpr, newIndex: i + String(callVal).length };
  }

  let i = 0;
  while (i < expr.length) {
    const result = tryReplaceAt(i);
    if (result) {
      expr = result.expr;
      i = result.newIndex;
    } else i++;
  }

  return expr;
}

export function interpret(input: string): number {
  let expr = input.trim();

  // Top-level function declarations: `fn name(params) : Type => { ... }` (multiple allowed)
  const topFuncs = new Map<string, FuncDef>();
  let parsing = true;
  while (parsing && expr.startsWith("fn")) {
    const header = expr.match(
      /^fn\s+([a-zA-Z_$][\w$]*)\s*\(\s*([^)]*)\s*\)\s*:\s*([A-Za-z_$][\w$]*)\s*=>\s*/
    );
    if (!header) {
      parsing = false;
    } else {
      const name = header[1];
      const paramsStr = header[2];

      // parse params
      const params: string[] = [];
      const paramTypes: string[] = [];
      let ok = true;
      if (paramsStr.trim().length > 0) {
        const parts = paramsStr.split(",");
        ok = parts.every((p) => {
          const m = p.trim().match(/^([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)$/);
          if (!m) return false;
          params.push(m[1]);
          paramTypes.push(m[2]);
          return true;
        });
      }

      if (!ok) {
        parsing = false;
      } else {
        const bodyStart = header[0].length;
        // expect body starting with '{'
        const end = findClosingBrace(expr, bodyStart);
        if (end === -1) {
          parsing = false;
        } else {
          const bodyInner = expr.slice(bodyStart + 1, end);
          topFuncs.set(name, { params, paramTypes, body: bodyInner });
          expr = expr.slice(end + 1).trim();
        }
      }
    }
  }

  const prevFuncs = currentTopFuncs;
  currentTopFuncs = topFuncs.size > 0 ? topFuncs : undefined;

  try {
    const top = processTopLevelLets(expr);
    if (top !== undefined) return top;

    if (expr === "true") return 1;
    if (expr === "false") return 0;

    expr = replaceFunctionCalls(expr);
    expr = replaceBraces(expr);
    expr = replaceParens(expr);
    expr = replaceIfExpressions(expr);

    return evalTokens(expr);
  } finally {
    currentTopFuncs = prevFuncs;
  }
}
